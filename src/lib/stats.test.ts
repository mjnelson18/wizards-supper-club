import { describe, expect, it } from 'vitest';
import {
  absenteeAdjusted,
  buildStats,
  daysBetween,
  divisiveness,
  gymnastic,
  headToHead,
  histogram,
  latestEvening,
  leaderboard,
  mean,
  rankDescending,
} from './stats.ts';
import type { Evening, ScoreEntry, Status, WizardConfig } from './types.ts';

const wizard = (sheetName: string, memberFrom = 1, memberUntil: number | null = null): WizardConfig => ({
  sheetName,
  displayName: sheetName,
  fullName: `${sheetName} Test`,
  memberFrom,
  memberUntil,
});

const evening = (id: string, chooser: string, restaurant = id, date: string | null = null): Evening => {
  const [, c, n] = /^C(\d+)-(\d+)$/.exec(id) as RegExpExecArray;
  return { id, circuit: Number(c), number: Number(n), date, chooser, restaurant };
};

/** "A:8 B:DNA C:TBC" -> score rows for one evening. */
const rows = (eveningId: string, spec: string): ScoreEntry[] =>
  spec.split(/\s+/).map((part) => {
    const [w, v] = part.split(':');
    const n = Number(v.replace('*', ''));
    if (Number.isFinite(n)) {
      return { eveningId, wizard: w, status: v.endsWith('*') ? 'Imputed' : 'Scored', score: n };
    }
    return { eveningId, wizard: w, status: v as Status, score: null };
  });

describe('maths helpers', () => {
  it('means, and null for no scores', () => {
    expect(mean([8, 6, 5, 5, 4, 4, 3])).toBe(5);
    expect(mean([])).toBeNull();
  });

  it('gymnastic drops one highest and one lowest, 3+ scores only', () => {
    expect(gymnastic([8, 6, 5, 5, 4, 4, 3])).toBeCloseTo(4.8, 10);
    expect(gymnastic([9, 9, 2])).toBe(9);
    expect(gymnastic([9, 2])).toBeNull();
    // Only a single top and bottom score go, even when they are tied.
    expect(gymnastic([10, 10, 7, 1, 1])).toBe(6);
  });

  it('divisiveness is the population standard deviation, 3+ scores only', () => {
    expect(divisiveness([8, 6, 5, 5, 4, 4, 3])).toBeCloseTo(Math.sqrt(16 / 7), 10);
    // Milk Beach (C6-09), quoted in the spec as 1.97.
    expect(divisiveness([5.5, 4, 5, 10, 5.5, 4.5])?.toFixed(2)).toBe('1.97');
    expect(divisiveness([7, 7, 7])).toBe(0);
    expect(divisiveness([9, 2])).toBeNull();
  });

  it('absentee-adjusted average follows the spreadsheet formula', () => {
    // (14 + 7 x 1 absentee + their index of -2) / (2 scores + 1 absentee)
    expect(absenteeAdjusted([8, 6], [-2])).toBeCloseTo(19 / 3, 10);
    expect(absenteeAdjusted([8, 6], [])).toBe(7);
    expect(absenteeAdjusted([], [-2])).toBeNull();
  });

  it('buckets scores by whole number', () => {
    const h = histogram([7.8, 7, 9.49, 10, 0, 3]);
    expect(h[7]).toBe(2);
    expect(h[9]).toBe(1);
    expect(h[10]).toBe(1);
    expect(h[0]).toBe(1);
    expect(h[3]).toBe(1);
  });

  it('ranks with ties sharing a place', () => {
    const items = [{ v: 8 }, { v: 9 }, { v: 8 }, { v: null }, { v: 7 }];
    const r = rankDescending(items, (i) => i.v);
    expect(items.map((i) => r.get(i))).toEqual([2, 1, 2, undefined, 4]);
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-10-22', '2026-11-20')).toBe(29);
  });
});

describe('Golden Phoenix (C8-01), the evening quoted in the spec', () => {
  const wizards = ['Calum', 'Charles', 'Craig', 'Daniel', 'James', 'Michael', 'Thomas', 'Jonathan', 'Jeremy'].map((n) => wizard(n));
  const stats = buildStats({
    wizards: [...wizards, wizard('Max', 1, 4)],
    evenings: [evening('C8-01', 'Charles', 'Golden Phoenix', '2026-09-03')],
    scores: rows('C8-01', 'Calum:8 Charles:6 James:5 Jeremy:5 Jonathan:4 Thomas:4 Michael:3'),
  });
  const e = stats.evenings[0];

  it('averages 5.00 from 7 scores', () => {
    expect(e.nScores).toBe(7);
    expect(e.average).toBe(5);
    expect(e.qualified).toBe(true);
  });

  it('has Charlie gone and the other eight active members due, Max excluded', () => {
    const c8 = stats.circuits[0];
    expect(stats.currentCircuit).toBe(8);
    expect(c8.choosers).toEqual(['Charles']);
    expect(c8.due).toEqual(['Calum', 'Craig', 'Daniel', 'James', 'Michael', 'Thomas', 'Jonathan', 'Jeremy']);
    expect(c8.due).not.toContain('Max');
    expect(c8.provisional).toBe(true);
    expect(c8.provisionalReasons).toEqual(['due']);
  });

  it("gives Charlie's self-score bias", () => {
    // Own 6 minus the others' mean of (8+5+5+4+4+3)/6
    expect(e.selfScore?.bias).toBeCloseTo(6 - 29 / 6, 10);
  });
});

describe('a small history', () => {
  const wizards = [wizard('A'), wizard('B'), wizard('C'), wizard('D', 2), wizard('X', 1, 1)];
  const evenings = [
    // Deliberately out of order, with a late date on an early evening.
    evening('C2-01', 'B', 'Later Place', '2026-03-01'),
    evening('C1-02', 'B', 'Second', '2026-06-01'),
    evening('C1-01', 'A', 'First'),
    evening('C1-03', 'C', 'Third'),
    evening('C1-04', 'A', 'Fourth'),
  ];
  const scores = [
    ...rows('C1-01', 'A:8 B:6 C:DNA X:UNK'),
    ...rows('C1-02', 'A:9 B:7 C:5 X:TBC'),
    ...rows('C1-03', 'A:Average B:8* C:9 X:10'),
    ...rows('C1-04', 'A:7 B:DNA C:DNA'),
    ...rows('C2-01', 'A:6 B:6 C:3 D:7'),
  ];
  const stats = buildStats({ wizards, evenings, scores });
  const ev = (id: string) => stats.evenings.find((e) => e.id === id)!;
  const wz = (name: string) => stats.wizards.find((w) => w.sheetName === name)!;
  const c1 = stats.circuits[0];

  it('orders by circuit then number, never by date', () => {
    expect(stats.evenings.map((e) => e.id)).toEqual(['C1-01', 'C1-02', 'C1-03', 'C1-04', 'C2-01']);
    expect(stats.evenings.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
  });

  it('counts Scored and Imputed in the maths, nothing else', () => {
    expect(stats.totalScores).toBe(13);
    expect(ev('C1-03').nScores).toBe(3);
    expect(ev('C1-03').average).toBe(9);
    expect(ev('C1-01').nScores).toBe(2);
    expect(ev('C1-01').qualified).toBe(false);
  });

  it('counts attendance by status', () => {
    const e = ev('C1-02');
    expect(e.attended).toBe(4); // three scores and a TBC
    expect(e.owed).toEqual(['X']);
    expect(ev('C1-01').attended).toBe(2);
    expect(ev('C1-01').dna).toBe(1);
    expect(ev('C1-01').unk).toBe(1);
    expect(ev('C1-03').attended).toBe(4); // Average attended without a number
  });

  it('computes score index against the overall mean', () => {
    const overall = stats.overallMean!;
    expect(overall).toBeCloseTo(91 / 13, 10);
    expect(wz('A').meanGiven).toBeCloseTo(7.5, 10);
    expect(wz('A').index).toBeCloseTo(7.5 - overall, 10);
    expect(wz('C').index).toBeCloseTo(17 / 3 - overall, 10);
  });

  it('adjusts for absentees using their score index', () => {
    const overall = stats.overallMean!;
    const cIndex = 17 / 3 - overall;
    expect(ev('C1-01').adjusted).toBeCloseTo((14 + 7 + cIndex) / 3, 10);
    const bIndex = 27 / 4 - overall;
    expect(ev('C1-04').adjusted).toBeCloseTo((7 + 7 * 2 + bIndex + cIndex) / 3, 10);
    expect(ev('C1-02').adjusted).toBeCloseTo(7, 10); // nobody absent
  });

  it('computes self-score bias against the others', () => {
    expect(ev('C1-01').selfScore).toEqual({ own: 8, others: 6, bias: 2 });
    expect(ev('C1-02').selfScore).toEqual({ own: 7, others: 7, bias: 0 });
    expect(ev('C1-04').selfScore).toBeNull(); // nobody else scored
    expect(wz('A').meanSelfBias).toBe(2);
  });

  it('measures attendance only within membership, ignoring UNK', () => {
    expect(wz('A').attended).toBe(5);
    expect(wz('A').attendanceRate).toBe(1);
    expect(wz('C').attended).toBe(3);
    expect(wz('C').dna).toBe(2);
    expect(wz('C').attendanceRate).toBeCloseTo(0.6, 10);
    // X was a member for the 1st circuit only: UNK, TBC, Scored, then no row.
    expect(wz('X').attended).toBe(2);
    expect(wz('X').unk).toBe(1);
    expect(wz('X').attendanceRate).toBe(1);
    // D joined in the 2nd circuit.
    expect(wz('D').attended).toBe(1);
  });

  it('tracks streaks; DNA and UNK break them', () => {
    expect(wz('A').longestStreak).toBe(5);
    expect(wz('A').currentStreak).toBe(5);
    expect(wz('C').longestStreak).toBe(2);
    expect(wz('C').currentStreak).toBe(1);
    expect(wz('B').longestStreak).toBe(3);
    expect(wz('B').currentStreak).toBe(1);
    expect(wz('X').longestStreak).toBe(2);
    expect(wz('X').currentStreak).toBe(0); // no row for C1-04 ends it
  });

  it('picks the circuit winner from qualified evenings', () => {
    expect(c1.leaderboard).toEqual(['C1-03', 'C1-02']);
    expect(c1.unqualified).toEqual(['C1-01', 'C1-04']);
    expect(c1.winner).toEqual({ wizard: 'C', eveningId: 'C1-03', average: 9, source: 'calculated' });
    expect(ev('C1-03').rank.circuit).toBe(1);
    expect(ev('C1-02').rank.circuit).toBe(2);
    expect(ev('C1-01').rank.circuit).toBeNull();
  });

  it('flags a circuit provisional while TBC or UNK are outstanding', () => {
    expect(c1.provisional).toBe(true);
    expect(c1.provisionalReasons).toEqual(['TBC', 'UNK']);
    expect(c1.due).toEqual([]); // A hosted twice; everyone current has hosted
    expect(wz('C').circuitWins).toEqual([]); // not counted until final
  });

  it('lists who is due in the current circuit', () => {
    const c2 = stats.circuits[1];
    expect(stats.currentCircuit).toBe(2);
    expect(c2.members).toEqual(['A', 'B', 'C', 'D']);
    expect(c2.due).toEqual(['A', 'C', 'D']);
    expect(c2.provisional).toBe(true);
  });

  it('lets an official result override the calculation', () => {
    const official = buildStats({
      wizards,
      evenings,
      scores,
      overrides: { C1: { winner: 'B', announced: '2026-07-01' } },
    });
    const c = official.circuits[0];
    expect(c.provisional).toBe(false);
    expect(c.official).toBe(true);
    expect(c.announced).toBe('2026-07-01');
    expect(c.resultDate).toBe('2026-07-01');
    expect(c.winner).toEqual({ wizard: 'B', eveningId: 'C1-02', average: 7, source: 'override' });
    expect(official.wizards.find((w) => w.sheetName === 'B')!.circuitWins).toEqual([1]);

    const closed = buildStats({ wizards, evenings, scores, overrides: { C1: { final: true } } });
    expect(closed.circuits[0].provisional).toBe(false);
    expect(closed.circuits[0].winner?.wizard).toBe('C');
    expect(closed.records.mostWins).toEqual([{ wizard: 'C', wins: 1 }]);
  });

  it('ranks all-time across qualified evenings only', () => {
    expect(stats.allTime).toEqual(['C1-03', 'C1-02', 'C2-01']);
    expect(ev('C2-01').rank.allTime).toBe(3);
    expect(ev('C1-04').rank.allTime).toBeNull();
    const board = leaderboard(stats.evenings.filter((e) => e.chooser === 'A'));
    expect(board.qualified).toEqual([]);
    expect(board.unqualified.map((e) => e.id)).toEqual(['C1-01', 'C1-04']);
  });

  it('computes records from the data', () => {
    expect(stats.records.tens).toEqual([{ eveningId: 'C1-03', wizard: 'X' }]);
    expect(stats.records.lowScores).toEqual([{ eveningId: 'C2-01', wizard: 'C', score: 3 }]);
    expect(stats.records.mostDivisive[0]).toBe('C1-02');
    expect(stats.records.mostUnanimous[0]).toBe('C1-03');
    expect(stats.records.selfBiasHigh[0]).toEqual({ eveningId: 'C1-01', wizard: 'A', bias: 2 });
    expect(stats.records.longestStreak[0]).toEqual({ wizard: 'A', length: 5 });
  });

  it('reads nominations from the chooser sequence within a circuit', () => {
    expect(stats.records.nominations).toEqual([
      { from: 'A', to: 'B', count: 1 },
      { from: 'B', to: 'C', count: 1 },
      { from: 'C', to: 'A', count: 1 },
    ]);
  });

  it('compares two wizards on evenings both scored', () => {
    const h = headToHead(stats.evenings, 'A', 'B');
    expect(h.shared.map((s) => s.eveningId)).toEqual(['C1-01', 'C1-02', 'C2-01']);
    expect(h.together).toBe(4);
    expect(h.meanDiff).toBeCloseTo(4 / 3, 10);
    expect(h.meanAbsDiff).toBeCloseTo(4 / 3, 10);
    expect([h.aHigher, h.bHigher, h.same]).toEqual([2, 0, 1]);
  });

  it('finds the latest evening by date, falling back to order', () => {
    expect(latestEvening(stats.evenings, '2026-11-20')?.id).toBe('C1-02');
    expect(latestEvening(stats.evenings, '2026-04-01')?.id).toBe('C2-01');
    expect(latestEvening(stats.evenings, '2025-01-01')?.id).toBe('C1-04');
  });

  it('copes with an evening that has no scores yet', () => {
    const s = buildStats({ wizards, evenings: [...evenings, evening('C2-02', 'D', 'Upcoming', '2027-01-01')], scores });
    const e = s.evenings.find((x) => x.id === 'C2-02')!;
    expect(e.average).toBeNull();
    expect(e.adjusted).toBeNull();
    expect(e.qualified).toBe(false);
    expect(s.circuits[1].due).toEqual(['A', 'C']);
  });
});

describe('cuisines', () => {
  const SEA = { cuisine: 'Thai', region: 'South-East Asia' };
  const stats = buildStats({
    wizards: [wizard('A'), wizard('B'), wizard('C')],
    evenings: [
      evening('C1-01', 'A'),
      evening('C1-02', 'B'),
      evening('C1-03', 'C'),
      evening('C2-01', 'A'),
      evening('C2-02', 'B'),
      evening('C2-03', 'C'),
    ],
    scores: [
      ...rows('C1-01', 'A:8 B:6 C:7'),
      ...rows('C1-02', 'A:9 B:7 C:8'),
      ...rows('C1-03', 'A:5 B:7 C:6'),
      ...rows('C2-01', 'A:6 B:6 C:6'),
      ...rows('C2-02', 'A:9 B:6 C:6'),
      ...rows('C2-03', 'A:7 B:7'),
    ],
    cuisines: {
      'C1-01': SEA,
      'C1-02': SEA,
      'C1-03': { cuisine: 'Chinese', region: 'East Asia' },
      'C2-01': { cuisine: 'Greek', region: 'Continental Europe' },
      'C2-02': SEA,
    },
  });
  const c = stats.cuisines;

  it('tags each evening and lists the unclassified ones', () => {
    expect(stats.evenings.map((e) => e.cuisine)).toEqual(['Thai', 'Thai', 'Chinese', 'Greek', 'Thai', null]);
    expect(stats.evenings[5].region).toBeNull();
    expect(c.unclassified).toEqual(['C2-03']);
  });

  it('ranks cuisines and regions by how often they were visited', () => {
    expect(c.cuisines.map((g) => [g.name, g.eveningIds.length])).toEqual([['Thai', 3], ['Chinese', 1], ['Greek', 1]]);
    const thai = c.cuisines[0];
    expect(thai.region).toBe('South-East Asia');
    expect(thai.eveningIds).toEqual(['C1-01', 'C1-02', 'C2-02']);
    expect(thai.nScores).toBe(9);
    expect(thai.mean).toBeCloseTo(66 / 9, 10);
    expect(thai.best).toBe('C1-02');
    expect(thai.firstCircuit).toBe(1);
    expect(c.regions.map((g) => g.name)).toEqual(['South-East Asia', 'Continental Europe', 'East Asia']);
  });

  it('counts regions per circuit and spots first-time cuisines', () => {
    expect(c.byCircuit).toEqual([
      { circuit: 1, regions: { 'South-East Asia': 2, 'East Asia': 1 }, firstTime: ['Thai', 'Chinese'] },
      { circuit: 2, regions: { 'Continental Europe': 1, 'South-East Asia': 1 }, firstTime: ['Greek'] },
    ]);
  });

  it('shows what each wizard picks, and repeats', () => {
    expect(c.choosers).toEqual([
      { wizard: 'A', picks: 2, distinct: 2, regions: [{ name: 'Continental Europe', count: 1 }, { name: 'South-East Asia', count: 1 }], repeats: [] },
      { wizard: 'B', picks: 2, distinct: 1, regions: [{ name: 'South-East Asia', count: 2 }], repeats: [{ name: 'Thai', count: 2 }] },
      { wizard: 'C', picks: 1, distinct: 1, regions: [{ name: 'East Asia', count: 1 }], repeats: [] },
    ]);
  });

  it("measures taste against the table, less the wizard's usual gap", () => {
    // A is 1.5, 1.5 and 3 above the others at the Thai evenings (mean 2), and
    // 0.75 above them on average everywhere, so A's taste for the region is +1.25.
    const taste = Object.fromEntries(c.taste.map((t) => [t.wizard, t.rows]));
    expect(taste.A).toHaveLength(1); // other regions have under 3 evenings
    expect(taste.A[0].region).toBe('South-East Asia');
    expect(taste.A[0].n).toBe(3);
    expect(taste.A[0].diff).toBeCloseTo(1.25, 10);
    expect(taste.B[0].diff).toBeCloseTo(-1, 10);
    expect(taste.C[0].diff).toBeCloseTo(-0.2, 10);
  });

  it('copes with no cuisine data at all', () => {
    const none = buildStats({ wizards: [wizard('A')], evenings: [evening('C1-01', 'A')], scores: rows('C1-01', 'A:8') });
    expect(none.cuisines).toEqual({ unclassified: ['C1-01'], cuisines: [], regions: [], byCircuit: [{ circuit: 1, regions: {}, firstTime: [] }], choosers: [], taste: [] });
  });
});
