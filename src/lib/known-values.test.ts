// Acceptance check against the real Sheet as it stood on 18 Nov 2026 (build
// spec, "Known values"). Run with: npm run data && npm run test:known
//
// It is not part of the normal test run: these figures are a snapshot, and they
// are expected to move once the catch-up form fills in missing scores.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EveningStats, Meta, Stats } from './types.ts';

const read = <T,>(name: string): T | null => {
  const path = `public/data/${name}`;
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null;
};

const meta = read<Meta>('meta.json');
const stats = read<Stats>('stats.json');
const real = meta?.source === 'sheet' && stats !== null;

describe.runIf(real)('known values from the Sheet (18 Nov 2026)', () => {
  const s = stats as Stats;
  const ev = (id: string) => s.evenings.find((e) => e.id === id) as EveningStats;
  const named = (name: string) => s.evenings.find((e) => e.restaurant.toLowerCase().includes(name.toLowerCase())) as EveningStats;
  const circuit = (n: number) => s.circuits.find((c) => c.circuit === n)!;
  const two = (n: number | null) => Number((n as number).toFixed(2));

  it('has 60 evenings across circuits 1-8 and 324 scores', () => {
    expect(s.evenings).toHaveLength(60);
    expect(s.circuits.map((c) => c.circuit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(s.totalScores).toBe(324);
  });

  it('C6-02 Ivan Mazemen (Dyson): 8.92 from 6 scores, winner of the 6th circuit', () => {
    expect(ev('C6-02').restaurant).toMatch(/Ivan/i);
    expect(two(ev('C6-02').average)).toBe(8.92);
    expect(ev('C6-02').nScores).toBe(6);
    expect(circuit(6).winner?.wizard).toBe('Jeremy');
    expect(circuit(6).winner?.eveningId).toBe('C6-02');
  });

  it('C5-01 Som Saa (Charlie): 8.75 from 4 scores, winner of the 5th circuit', () => {
    expect(two(ev('C5-01').average)).toBe(8.75);
    expect(ev('C5-01').nScores).toBe(4);
    expect(circuit(5).winner?.wizard).toBe('Charles');
  });

  it('C4 winner: Hammer & Tongs (Mike), 8.71', () => {
    expect(circuit(4).winner?.wizard).toBe('Michael');
    expect(ev(circuit(4).winner!.eveningId!).restaurant).toMatch(/Hammer/i);
    expect(two(circuit(4).winner!.average)).toBe(8.71);
  });

  it('C1 winner: Lahore Kebab House (Tom), 8.57', () => {
    expect(circuit(1).winner?.wizard).toBe('Thomas');
    expect(ev(circuit(1).winner!.eveningId!).restaurant).toMatch(/Lahore/i);
    expect(two(circuit(1).winner!.average)).toBe(8.57);
  });

  it('lowest qualifying evenings: KIN 4.20, Rodizio Rico 4.75, Golden Phoenix 5.00', () => {
    const lowest = s.allTime.slice(-3).reverse().map((id) => ev(id));
    expect(lowest.map((e) => two(e.average))).toEqual([4.2, 4.75, 5]);
    expect(lowest[0].restaurant).toMatch(/KIN/i);
    expect(lowest[1].restaurant).toMatch(/Rodizio/i);
    expect(lowest[2].restaurant).toMatch(/Golden Phoenix/i);
  });

  it('C8-01 Golden Phoenix: 5.00 from the seven quoted scores', () => {
    const e = ev('C8-01');
    const by = Object.fromEntries(e.entries.filter((x) => x.score !== null).map((x) => [x.wizard, x.score]));
    expect(by).toEqual({ Calum: 8, Charles: 6, James: 5, Jeremy: 5, Jonathan: 4, Thomas: 4, Michael: 3 });
    expect(e.average).toBe(5);
  });

  it('most divisive (3+ scores): C6-09 Milk Beach, standard deviation 1.97', () => {
    expect(s.records.mostDivisive[0]).toBe('C6-09');
    expect(ev('C6-09').restaurant).toMatch(/Milk Beach/i);
    expect(two(ev('C6-09').sd)).toBe(1.97);
  });

  it('7th circuit is provisional; Barang leads qualified evenings on 9.00 from 3 scores', () => {
    const c7 = circuit(7);
    expect(c7.provisional).toBe(true);
    expect(c7.provisionalReasons).toEqual(expect.arrayContaining(['TBC', 'UNK']));
    const leader = ev(c7.leaderboard[0]);
    expect(leader.restaurant).toMatch(/Barang/i);
    expect(two(leader.average)).toBe(9);
    expect(leader.nScores).toBe(3);
    expect(named('Barrafina').id).toBe('C7-10');
  });

  it('8th circuit: Charlie gone, the other eight active members due', () => {
    const c8 = circuit(8);
    expect(c8.choosers).toEqual(['Charles']);
    expect([...c8.due].sort()).toEqual(['Calum', 'Craig', 'Daniel', 'James', 'Jeremy', 'Jonathan', 'Michael', 'Thomas']);
  });
});

describe.runIf(!real)('known values', () => {
  it.skip('skipped: no real Sheet data in public/data (run "npm run data" first)', () => {});
});
