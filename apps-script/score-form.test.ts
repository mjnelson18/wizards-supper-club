// The score form runs inside Google Apps Script, which cannot be run here. These
// tests load the script into a sandbox with a fake Sheet and check the part that
// matters most: what it writes to the Evenings and Log tabs.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseCuisines, parseEvenings, parseScores, parseWizards } from '../src/lib/ingest.ts';
import { buildStats } from '../src/lib/stats.ts';

type Cell = string | number | Date;

class FakeSheet {
  rows: Cell[][];
  formats: Record<string, string> = {};
  constructor(rows: Cell[][]) {
    this.rows = rows.map((r) => [...r]);
  }
  getDataRange() {
    return { getValues: () => this.rows.map((r) => [...r]) };
  }
  getLastRow() {
    return this.rows.length;
  }
  appendRow(row: Cell[]) {
    this.rows.push([...row]);
  }
  getRange(r: number, c: number, nr = 1, nc = 1) {
    const write = (values: Cell[][]) => {
      for (let i = 0; i < nr; i++) {
        while (this.rows.length < r + i) this.rows.push([]);
        const row = this.rows[r + i - 1];
        for (let j = 0; j < nc; j++) {
          while (row.length < c + j) row.push('');
          row[c + j - 1] = values[i][j];
        }
      }
    };
    const range = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => this.rows[r + i - 1]?.[c + j - 1] ?? '')),
      setValues: (v: Cell[][]) => (write(v), range),
      setValue: (v: Cell) => (write([[v]]), range),
      setFormula: (f: string) => (write([[f]]), range),
      getFormula: () => {
        const v = this.rows[r - 1]?.[c - 1];
        return typeof v === 'string' && v.startsWith('=') ? v : '';
      },
      setNumberFormat: (f: string) => ((this.formats[`${r},${c}`] = f), range),
      setFontWeight: () => range,
    };
    return range;
  }
}

const EVENINGS: Cell[][] = [
  ['Evening ID', 'Circuit', 'No. in circuit', 'Date', 'Chooser', 'Restaurant', 'Average score'],
  ['C7-09', 7, 9, new Date(Date.UTC(2026, 4, 29, 12)), 'Daniel', 'Master Wei', ''],
  ['C7-10', 7, 10, new Date(Date.UTC(2026, 9, 22, 12)), 'Craig', 'Barrafina (Borough Yards)', ''],
  ['C8-01', 8, 1, new Date(Date.UTC(2026, 8, 3, 12)), 'Charles', 'Golden Phoenix', ''],
];
const LOG: Cell[][] = [
  ['Evening ID', 'Wizard', 'Status', 'Score', 'Source', 'Updated', 'Review / note'],
  ['C7-10', 'Craig', 'TBC', '', 'Spreadsheet / WhatsApp backfill', '', ''],
  ['C7-10', 'Michael', 'Scored', 7, 'Catch-up form', '', ''],
  ['C7-10', 'Calum', 'TBC', '', 'Spreadsheet / WhatsApp backfill', '', ''],
  ['', 'Calum', 'Note', '', 'Catch-up form', '', 'a private remark'],
  ['C8-01', 'Calum', 'Scored', 8, 'Spreadsheet / WhatsApp backfill', '', ''],
];

const OLD_PUBLIC = '=QUERY(Evenings!A:F,"select A,B,C,D,E,F where A is not null",1)';

function load(evenings = EVENINGS, log = LOG, publicFormula: string | null = OLD_PUBLIC) {
  const sheets: Record<string, FakeSheet> = { Evenings: new FakeSheet(evenings), Log: new FakeSheet(log) };
  if (publicFormula !== null) sheets.Public_Evenings = new FakeSheet([[publicFormula]]);
  const ss = { getSheetByName: (n: string) => sheets[n] ?? null, getSpreadsheetTimeZone: () => 'Europe/London' };
  const logged: string[] = [];
  const ctx = vm.createContext({
    Utilities: { formatDate: (d: Date) => d.toISOString().slice(0, 10) },
    Logger: { log: (m: string) => logged.push(m) },
  });
  vm.runInContext(readFileSync('apps-script/ScoreForm.gs', 'utf8'), ctx);
  // The script's globals are untyped: this is a sandbox, not a module.
  return { gs: ctx as any, ss, evenings: sheets.Evenings, log: sheets.Log, publicTab: sheets.Public_Evenings, logged };
}

const NOW = new Date('2026-12-04T09:00:00Z');
let t: ReturnType<typeof load>;
beforeEach(() => {
  t = load();
});

const score = (extra: Record<string, unknown>) => ({ action: t.gs.SF_ACTION.SCORE, evening: 'C7-10 · Barrafina (Borough Yards) · 22 Oct 2026 · Craig\'s pick', ...extra });
const newEvening = (extra: Record<string, unknown> = {}) => ({
  action: t.gs.SF_ACTION.NEW,
  restaurant: 'The Palomar',
  date: '2026-12-03',
  chooser: 'Dan',
  circuit: '8th circuit (the current one)',
  present: ['Mike', 'Calum', 'Tom'],
  ...extra,
});

describe('scoring an evening', () => {
  it("updates the wizard's own row and nothing else", () => {
    const before = t.log.rows.map((r) => [...r]);
    const res = t.gs.sfApply_(t.ss, score({ who: 'Craig', there: t.gs.SF_THERE.SCORE, score: '7.5', review: 'Straight bat.' }), NOW);
    expect(res.changed).toBe(true);
    expect(t.log.rows[1]).toEqual(['C7-10', 'Craig', 'Scored', 7.5, 'Score form', NOW, 'Straight bat.']);
    expect(t.log.rows.length).toBe(before.length);
    expect(t.log.rows.filter((_, i) => i !== 1)).toEqual(before.filter((_, i) => i !== 1));
  });

  it('records an absence or a request for the average without a number', () => {
    t.gs.sfApply_(t.ss, score({ who: 'Craig', there: t.gs.SF_THERE.ABSENT }), NOW);
    expect(t.log.rows[1].slice(0, 5)).toEqual(['C7-10', 'Craig', 'DNA', '', 'Score form']);
    t.gs.sfApply_(t.ss, score({ who: 'Calum', there: t.gs.SF_THERE.AVERAGE }), NOW);
    expect(t.log.rows[3].slice(0, 4)).toEqual(['C7-10', 'Calum', 'Average', '']);
  });

  it('lets a wizard correct a score already given', () => {
    t.gs.sfApply_(t.ss, score({ who: 'Mike', there: t.gs.SF_THERE.SCORE, score: '8.25' }), NOW);
    expect(t.log.rows[2].slice(0, 5)).toEqual(['C7-10', 'Michael', 'Scored', 8.25, 'Score form']);
  });

  it('adds a row when the wizard has none for that evening', () => {
    t.gs.sfApply_(t.ss, score({ who: 'Jonny', there: t.gs.SF_THERE.SCORE, score: '9' }), NOW);
    expect(t.log.rows[t.log.rows.length - 1]).toEqual(['C7-10', 'Jonathan', 'Scored', 9, 'Score form', NOW, '']);
  });

  it('ignores a bad score, an unknown evening or an unknown wizard', () => {
    const before = JSON.stringify(t.log.rows);
    for (const a of [
      score({ who: 'Craig', there: t.gs.SF_THERE.SCORE, score: '11' }),
      score({ who: 'Craig', there: t.gs.SF_THERE.SCORE, score: '' }),
      score({ who: 'Craig', there: t.gs.SF_THERE.SCORE, score: 'eight' }),
      score({ who: 'Paddy', there: t.gs.SF_THERE.SCORE, score: '8' }),
      { ...score({ who: 'Craig', there: t.gs.SF_THERE.SCORE, score: '8' }), evening: 'C9-04 · Nowhere' },
    ]) {
      expect(t.gs.sfApply_(t.ss, a, NOW).changed).toBe(false);
    }
    expect(JSON.stringify(t.log.rows)).toBe(before);
  });

  it('never lets a review be read as a formula', () => {
    t.gs.sfApply_(t.ss, score({ who: 'Craig', there: t.gs.SF_THERE.SCORE, score: '7', review: '=IMPORTRANGE("x","y")' }), NOW);
    expect(t.log.rows[1][6]).toBe('\'=IMPORTRANGE("x","y")');
  });
});

describe('recording a new evening', () => {
  it('adds the evening and a row for every current wizard', () => {
    const res = t.gs.sfApply_(t.ss, newEvening(), NOW);
    expect(res.changed).toBe(true);
    const row = t.evenings.rows[4];
    expect(row.slice(0, 6)).toEqual(['C8-02', 8, 2, '2026-12-03', 'Daniel', 'The Palomar']);
    expect(String(row[6])).toContain('AVERAGEIFS(Log!D:D,Log!A:A,A5');

    const added = t.log.rows.filter((r) => r[0] === 'C8-02');
    expect(added).toHaveLength(9);
    const status = Object.fromEntries(added.map((r) => [r[1], r[2]]));
    // Those ticked, plus the chooser, owe a score; the rest did not attend.
    expect(status).toEqual({
      Calum: 'TBC', Michael: 'TBC', Thomas: 'TBC', Daniel: 'TBC',
      Charles: 'DNA', Craig: 'DNA', James: 'DNA', Jonathan: 'DNA', Jeremy: 'DNA',
    });
    expect(added.every((r) => r[3] === '' && r[4] === 'Score form')).toBe(true);
  });

  it('numbers the evening within the chosen circuit', () => {
    expect(t.gs.sfApply_(t.ss, newEvening({ circuit: '9th circuit (this evening starts it)' }), NOW).message).toContain('C9-01');
    expect(t.gs.sfApply_(t.ss, newEvening({ restaurant: 'Late One', circuit: '7th circuit (a late one)' }), NOW).message).toContain('C7-11');
  });

  it('ignores a second submission of the same evening', () => {
    t.gs.sfApply_(t.ss, newEvening(), NOW);
    const rows = t.log.rows.length;
    const again = t.gs.sfApply_(t.ss, newEvening({ restaurant: 'the palomar' }), NOW);
    expect(again.changed).toBe(false);
    expect(again.message).toContain('already recorded as C8-02');
    expect(t.log.rows.length).toBe(rows);
    expect(t.evenings.rows.length).toBe(5);
  });

  it('stores the date the same way as the existing rows', () => {
    t.gs.sfApply_(t.ss, newEvening(), NOW);
    expect(t.evenings.formats['5,4']).toBe('yyyy-mm-dd'); // existing dates are real dates
    expect(t.evenings.formats['5,6']).toBe('@');

    const text = load(EVENINGS.map((r, i) => (i === 0 ? r : [r[0], r[1], r[2], '2026-01-01', r[4], r[5], r[6]])));
    text.gs.sfApply_(text.ss, newEvening(), NOW);
    expect(text.evenings.formats['5,4']).toBe('@');
  });

  it('cleans a restaurant name so the website build cannot fail on it', () => {
    expect(t.gs.sfCleanName_('  Dishoom @ King\'s Cross https://dishoom.com/x ')).toBe("Dishoom at King's Cross");
    expect(t.gs.sfCleanName_('R'.repeat(120))).toHaveLength(80);
    expect(t.gs.sfCleanName_('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(t.gs.sfApply_(t.ss, newEvening({ restaurant: '   ' }), NOW).changed).toBe(false);
    expect(t.gs.sfApply_(t.ss, newEvening({ date: '03/12/2026' }), NOW).changed).toBe(false);
  });
});

describe('form lists', () => {
  it('offers evenings newest first, labelled with restaurant, date and chooser', () => {
    expect(t.gs.sfEveningLabels_(t.gs.sfEvenings_(t.ss))).toEqual([
      "C8-01 · Golden Phoenix · 3 Sep 2026 · Charlie's pick",
      "C7-10 · Barrafina (Borough Yards) · 22 Oct 2026 · Craig's pick",
      "C7-09 · Master Wei · 29 May 2026 · Dan's pick",
    ]);
  });

  it('offers the current, next and previous circuit', () => {
    expect(t.gs.sfCircuitChoices_(t.gs.sfEvenings_(t.ss))).toEqual([
      '8th circuit (the current one)',
      '9th circuit (this evening starts it)',
      '7th circuit (a late one)',
    ]);
  });
});

describe('what the form writes passes the website checks', () => {
  it('is accepted by the same ingest the deploy uses', () => {
    t.gs.sfApply_(t.ss, newEvening(), NOW);
    t.gs.sfApply_(t.ss, { action: t.gs.SF_ACTION.SCORE, evening: 'C8-02 · The Palomar', who: 'Mike', there: t.gs.SF_THERE.SCORE, score: '8.5', review: 'Lovely. See https://example.com' }, NOW);
    t.gs.sfApply_(t.ss, { action: t.gs.SF_ACTION.SCORE, evening: 'C8-02 · The Palomar', who: 'Tom', there: t.gs.SF_THERE.ABSENT }, NOW);

    // What Public_Evenings (A:F) and Public_Scores (A:D, no notes) would publish.
    const cell = (v: Cell) => (v instanceof Date ? v.toISOString().slice(0, 10) : `"${String(v).replace(/"/g, '""')}"`);
    const evCsv = t.evenings.rows.map((r) => r.slice(0, 6).map(cell).join(',')).join('\n');
    const scCsv = t.log.rows.filter((r) => r[0] !== '' && r[2] !== 'Note').map((r) => r.slice(0, 4).map(cell).join(',')).join('\n');
    expect(scCsv).not.toContain('example.com');

    const wizards = parseWizards(JSON.parse(readFileSync('config/wizards.json', 'utf8')));
    const evenings = parseEvenings(evCsv, wizards);
    const { scores } = parseScores(scCsv, wizards, evenings);
    const stats = buildStats({ evenings, scores, wizards });
    const e = stats.evenings.find((x) => x.id === 'C8-02')!;
    expect(e.restaurant).toBe('The Palomar');
    expect(e.date).toBe('2026-12-03');
    expect(e.average).toBe(8.5);
    expect(e.owed).toEqual(['Calum', 'Daniel']);
    expect(e.dna).toBe(6);
    expect(stats.circuits.find((c) => c.circuit === 8)!.choosers).toEqual(['Charles', 'Daniel']);
  });

  it('keeps the form roster in step with the website roster', () => {
    const wizards = parseWizards(JSON.parse(readFileSync('config/wizards.json', 'utf8')));
    const current = wizards.filter((w) => w.memberUntil === null).map((w) => [w.displayName, w.sheetName]);
    expect([...t.gs.SF_WIZARDS].map((w: string[]) => [...w]).sort()).toEqual(current.sort());
  });
});

describe('cuisine', () => {
  it('upgrade adds a Cuisine column and makes the public tab publish it', () => {
    t.gs.sfEnsureCuisineColumn_(t.ss);
    t.gs.sfUpdatePublicTab_(t.ss);
    expect(t.evenings.rows[0][7]).toBe('Cuisine');
    expect(t.publicTab.rows[0][0]).toBe('=QUERY(Evenings!A:H,"select A,B,C,D,E,F,H where A is not null",1)');
    // Running it again changes nothing.
    const before = JSON.stringify([t.evenings.rows, t.publicTab.rows]);
    t.gs.sfEnsureCuisineColumn_(t.ss);
    t.gs.sfUpdatePublicTab_(t.ss);
    expect(JSON.stringify([t.evenings.rows, t.publicTab.rows])).toBe(before);
  });

  it('leaves a public tab it does not recognise alone, and says what to set', () => {
    const custom = load(EVENINGS, LOG, '=QUERY(Evenings!A:F,"select A,F where A is not null",1)');
    custom.gs.sfUpdatePublicTab_(custom.ss);
    expect(custom.publicTab.rows[0][0]).toContain('select A,F');
    expect(custom.logged.join(' ')).toContain('left alone');
    const none = load(EVENINGS, LOG, null);
    expect(() => none.gs.sfUpdatePublicTab_(none.ss)).not.toThrow();
  });

  it('refuses to take over a column H that is already in use', () => {
    const used = load(EVENINGS.map((r, i) => [...r, i === 0 ? 'Cost per head' : '']));
    expect(() => used.gs.sfEnsureCuisineColumn_(used.ss)).toThrow(/already used for "Cost per head"/);
  });

  it('writes the chosen cuisine with the new evening', () => {
    t.gs.sfEnsureCuisineColumn_(t.ss);
    const res = t.gs.sfApply_(t.ss, newEvening({ cuisine: 'Israeli' }), NOW);
    expect(t.evenings.rows[4][7]).toBe('Israeli');
    expect(t.evenings.formats['5,8']).toBe('@');
    expect(res.message).toContain('The Palomar, Israeli');
  });

  it('takes a typed cuisine when it is not on the list, cleaned up', () => {
    t.gs.sfEnsureCuisineColumn_(t.ss);
    t.gs.sfApply_(t.ss, newEvening({ cuisine: t.gs.SF_OTHER, cuisineOther: '  Uyghur http://x.example ' }), NOW);
    expect(t.evenings.rows[4][7]).toBe('Uyghur');
    t.gs.sfApply_(t.ss, newEvening({ restaurant: 'Second', cuisine: t.gs.SF_OTHER, cuisineOther: '' }), NOW);
    expect(t.evenings.rows[5][7] ?? '').toBe('');
  });

  it('still records the evening on a Sheet that has no Cuisine column yet', () => {
    const res = t.gs.sfApply_(t.ss, newEvening({ cuisine: 'Israeli' }), NOW);
    expect(res.changed).toBe(true);
    expect(t.evenings.rows[4]).toHaveLength(7);
  });

  it('reaches the website through the published tab', () => {
    t.gs.sfEnsureCuisineColumn_(t.ss);
    t.gs.sfApply_(t.ss, newEvening({ cuisine: 'Israeli' }), NOW);
    t.gs.sfApply_(t.ss, newEvening({ restaurant: 'Kimchee', date: '2026-12-10', cuisine: t.gs.SF_OTHER, cuisineOther: 'Uyghur' }), NOW);

    // Public_Evenings publishes A:F and H.
    const cell = (v: Cell | undefined) => (v instanceof Date ? v.toISOString().slice(0, 10) : `"${String(v ?? '').replace(/"/g, '""')}"`);
    const csv = t.evenings.rows.map((r) => [...r.slice(0, 6), r[7]].map(cell).join(',')).join('\n');
    const wizards = parseWizards(JSON.parse(readFileSync('config/wizards.json', 'utf8')));
    const evenings = parseEvenings(csv, wizards);
    const { tags, warnings } = parseCuisines(JSON.parse(readFileSync('config/cuisines.json', 'utf8')), evenings, { checkLabels: false });
    expect(tags['C8-02']).toEqual({ cuisine: 'Israeli', region: 'Middle East' });
    expect(tags['C8-03']).toEqual({ cuisine: 'Uyghur', region: 'Elsewhere' });
    expect(tags['C8-01']).toEqual({ cuisine: 'Chinese', region: 'East Asia' }); // history, from the config file
    expect(warnings.some((w) => w.includes('"Uyghur" from the Sheet is not listed'))).toBe(true);
  });

  it('only offers cuisines the website knows how to place', () => {
    const regions = Object.keys(JSON.parse(readFileSync('config/cuisines.json', 'utf8')).regions).sort();
    expect([...t.gs.SF_CUISINES].sort()).toEqual(regions);
  });
});
