import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeSample } from '../../scripts/sample-data.ts';
import { DataError, guardCell, parseCsv, parseCuisines, parseEvenings, parseOverrides, parseScores, parseStatus, parseWizards } from './ingest.ts';
import { buildStats } from './stats.ts';

const wizards = parseWizards(JSON.parse(readFileSync('config/wizards.json', 'utf8')));

const EVENINGS_HEADER = 'Evening ID,Circuit,No. in circuit,Date,Chooser,Restaurant';
const SCORES_HEADER = 'Evening ID,Wizard,Status,Score';
const oneEvening = `${EVENINGS_HEADER}\nC8-01,8,1,2026-09-03,Charles,Golden Phoenix\n`;

const issuesOf = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (err) {
    if (err instanceof DataError) return err.issues;
    throw err;
  }
  return [];
};

describe('parseCsv', () => {
  it('handles quotes, embedded commas and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });
});

describe('evenings tab', () => {
  it('reads rows, blank dates included, and resolves the chooser', () => {
    const out = parseEvenings(`${EVENINGS_HEADER}\nC1-01,1,1,,Tom,Lahore Kebab House\n`, wizards);
    expect(out).toEqual([
      { id: 'C1-01', circuit: 1, number: 1, date: null, chooser: 'Thomas', restaurant: 'Lahore Kebab House' },
    ]);
  });

  it('drops every column that is not whitelisted', () => {
    const csv = `Evening ID,Circuit,No. in circuit,Date,Chooser,Restaurant,Average score,Review / note\nC8-01,8,1,2026-09-03,Charles,Golden Phoenix,5.00,someone@example.com wrote https://forms.gle/x\n`;
    const out = parseEvenings(csv, wizards);
    expect(JSON.stringify(out)).not.toMatch(/example|forms|5\.00/);
    expect(Object.keys(out[0]).sort()).toEqual(['chooser', 'circuit', 'date', 'id', 'number', 'restaurant']);
  });

  it('fails on a bad ID, a mismatched circuit, an unknown chooser or a non-ISO date', () => {
    expect(issuesOf(() => parseEvenings(`${EVENINGS_HEADER}\nC8-1,8,1,,Charles,X\n`, wizards))[0]).toMatch(/C7-08/);
    expect(issuesOf(() => parseEvenings(`${EVENINGS_HEADER}\nC8-01,7,1,,Charles,X\n`, wizards))[0]).toMatch(/does not match/);
    expect(issuesOf(() => parseEvenings(`${EVENINGS_HEADER}\nC8-01,8,1,,Paddy,X\n`, wizards))[0]).toMatch(/not in config/);
    expect(issuesOf(() => parseEvenings(`${EVENINGS_HEADER}\nC8-01,8,1,03/09/2026,Charles,X\n`, wizards))[0]).toMatch(/YYYY-MM-DD/);
    expect(issuesOf(() => parseEvenings(`${EVENINGS_HEADER}\nC8-01,8,1,2026-02-30,Charles,X\n`, wizards))[0]).toMatch(/real date/);
  });

  it('fails on a missing column or a web page', () => {
    expect(issuesOf(() => parseEvenings('Evening ID,Circuit\nC8-01,8\n', wizards)).join()).toMatch(/missing column "Restaurant"/);
    expect(issuesOf(() => parseEvenings('<!DOCTYPE html><html>Sign in</html>', wizards))[0]).toMatch(/web page/);
  });
});

describe('privacy guards', () => {
  it('rejects emails, links and long free text', () => {
    expect(guardCell('a@b.com', 'x')).toHaveLength(1);
    expect(guardCell('see HTTP://x', 'x')).toHaveLength(1);
    expect(guardCell('docs.google.com/forms', 'x')).toHaveLength(1);
    expect(guardCell('x'.repeat(61), 'x')).toHaveLength(1);
    expect(guardCell('x'.repeat(60), 'x')).toHaveLength(0);
  });

  it('allows restaurant names up to 80 characters, no further', () => {
    const row = (name: string) => `${EVENINGS_HEADER}\nC8-01,8,1,,Charles,${name}\n`;
    expect(parseEvenings(row('R'.repeat(80)), wizards)).toHaveLength(1);
    expect(issuesOf(() => parseEvenings(row('R'.repeat(81)), wizards))[0]).toMatch(/limit 80/);
  });

  it('fails the build when a whitelisted cell holds an email or link', () => {
    const evenings = parseEvenings(oneEvening, wizards);
    expect(issuesOf(() => parseScores(`${SCORES_HEADER}\nC8-01,Calum,Scored,8\nC8-01,a@b.com,Scored,7\n`, wizards, evenings)).join()).toMatch(/"@"/);
    expect(issuesOf(() => parseEvenings(`${EVENINGS_HEADER}\nC8-01,8,1,,Charles,http://example.com\n`, wizards)).join()).toMatch(/"http"/);
  });
});

describe('scores tab', () => {
  const evenings = parseEvenings(oneEvening, wizards);

  it('reads every status and keeps numbers only for Scored and Imputed', () => {
    const csv = `${SCORES_HEADER},Review / note\nC8-01,Calum,Scored,8,lovely\nC8-01,Mike,Imputed,7.25,\nC8-01,Craig,DNA,,\nC8-01,Daniel,TBC,,\nC8-01,James,UNK,,\nC8-01,Dyson,Average,6.1,\n`;
    const { scores, warnings } = parseScores(csv, wizards, evenings);
    expect(scores).toEqual([
      { eveningId: 'C8-01', wizard: 'Calum', status: 'Scored', score: 8 },
      { eveningId: 'C8-01', wizard: 'Michael', status: 'Imputed', score: 7.25 },
      { eveningId: 'C8-01', wizard: 'Craig', status: 'DNA', score: null },
      { eveningId: 'C8-01', wizard: 'Daniel', status: 'TBC', score: null },
      { eveningId: 'C8-01', wizard: 'James', status: 'UNK', score: null },
      { eveningId: 'C8-01', wizard: 'Jeremy', status: 'Average', score: null },
    ]);
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(scores)).not.toContain('lovely');
  });

  it('fails on unknown status, wizard or evening, bad scores and duplicates', () => {
    const bad = (line: string) => issuesOf(() => parseScores(`${SCORES_HEADER}\n${line}\n`, wizards, evenings)).join();
    expect(bad('C8-01,Calum,Note,')).toMatch(/Status must be one of/);
    expect(bad('C8-01,Paddy,Scored,8')).toMatch(/not in config/);
    expect(bad('C9-01,Calum,Scored,8')).toMatch(/not in Public_Evenings/);
    expect(bad('C8-01,Calum,Scored,11')).toMatch(/0 to 10/);
    expect(bad('C8-01,Calum,Scored,')).toMatch(/0 to 10/);
    expect(bad('C8-01,Calum,Scored,8\nC8-01,Calum,Scored,7')).toMatch(/second row/);
  });
});

describe('status tab and config', () => {
  it('reads the three known keys and ignores the rest', () => {
    const s = parseStatus('key,value\nbaton_holder,Dyson\nnext_date,2026-12-10\nnext_restaurant,Barrafina\nsecret,ignored\n', wizards);
    expect(s).toEqual({ batonHolder: 'Jeremy', nextDate: '2026-12-10', nextRestaurant: 'Barrafina' });
    expect(parseStatus(null, wizards)).toEqual({ batonHolder: null, nextDate: null, nextRestaurant: null });
    expect(parseStatus('key,value\nbaton_holder,\n', wizards).batonHolder).toBeNull();
  });

  it('validates overrides against the roster', () => {
    expect(parseOverrides({ C6: { winner: 'Dyson', announced: '2024-08-16' } }, wizards).C6.winner).toBe('Dyson');
    expect(issuesOf(() => parseOverrides({ C6: { winner: 'Gandalf' } }, wizards))[0]).toMatch(/not in config/);
    expect(issuesOf(() => parseOverrides({ six: { winner: 'Dyson' } }, wizards))).toHaveLength(1);
  });
});

describe('sample data', () => {
  it('passes the same pipeline as real data and keeps the known quirks', () => {
    const csv = makeSample();
    const evenings = parseEvenings(csv.evenings, wizards);
    const { scores } = parseScores(csv.scores, wizards, evenings);
    const stats = buildStats({ evenings, scores, wizards, status: parseStatus(csv.status, wizards) });
    expect(stats.evenings).toHaveLength(60);
    expect(stats.currentCircuit).toBe(8);
    const c7 = stats.circuits.find((c) => c.circuit === 7)!;
    expect(stats.evenings.filter((e) => e.circuit === 7 && e.chooser === 'Thomas').map((e) => e.id)).toEqual(['C7-02', 'C7-06']);
    expect(c7.eveningIds[c7.eveningIds.length - 1]).toBe('C7-10');
    expect(stats.evenings.find((e) => e.id === 'C8-01')!.average).toBe(5);
    expect(stats.circuits[7].due).toHaveLength(8);
  });
});

describe('cuisine config', () => {
  const evenings = parseEvenings(`${EVENINGS_HEADER}\nC8-01,8,1,2026-09-03,Charles,Golden Phoenix\nC8-02,8,2,,Daniel,New Place\n`, wizards);
  const regions = { Chinese: 'East Asia' };

  it('tags evenings and warns, without failing, about ones with no cuisine', () => {
    const { tags, warnings } = parseCuisines({ regions, evenings: { 'C8-01': { restaurant: 'Golden Phoenix', cuisine: 'Chinese' } } }, evenings);
    expect(tags).toEqual({ 'C8-01': { cuisine: 'Chinese', region: 'East Asia' } });
    expect(warnings).toEqual(['No cuisine recorded for: C8-02 New Place. Add them to config/cuisines.json.']);
  });

  it('warns about an unknown evening or a label that no longer matches the Sheet', () => {
    const { warnings } = parseCuisines(
      { regions, evenings: { 'C8-01': { restaurant: 'Silver Phoenix', cuisine: 'Chinese' }, 'C8-02': { cuisine: 'Chinese' }, 'C9-01': { cuisine: 'Chinese' } } },
      evenings,
    );
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/labelled "Silver Phoenix" but the Sheet says "Golden Phoenix"/);
    expect(warnings[1]).toMatch(/C9-01 is not in the Sheet/);
  });

  it('fails on a cuisine with no region or a malformed file', () => {
    expect(issuesOf(() => parseCuisines({ regions, evenings: { 'C8-01': { cuisine: 'Martian' } } }, evenings))[0]).toMatch(/not listed under "regions"/);
    expect(issuesOf(() => parseCuisines({ regions }, evenings))).toHaveLength(1);
    expect(issuesOf(() => parseCuisines({ regions, evenings: { eight: { cuisine: 'Chinese' } } }, evenings))).toHaveLength(1);
  });

  it('accepts the real config file', () => {
    const json = JSON.parse(readFileSync('config/cuisines.json', 'utf8'));
    expect(() => parseCuisines(json, [])).not.toThrow();
    const used = new Set(Object.values(json.evenings as Record<string, { cuisine: string }>).map((e) => e.cuisine));
    // Every listed cuisine is used, so the list cannot fill up with leftovers.
    expect(Object.keys(json.regions).filter((c) => !used.has(c))).toEqual([]);
  });
});
