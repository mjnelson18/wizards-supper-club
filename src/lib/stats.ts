// Every number on the site comes from this module. Pure functions only: no I/O,
// no dates read from the clock, so the same inputs always give the same outputs.

import { isMember, resolveWizard } from './roster.ts';
import type {
  CircuitStats,
  CircuitWinner,
  Evening,
  EveningEntry,
  EveningStats,
  FiveNumber,
  HostingSlot,
  Records,
  ScoreEntry,
  Stats,
  StatsInput,
  Status,
  WizardCircuit,
  WizardStats,
} from './types.ts';

/** Restaurants need this many scores to appear on a leaderboard. */
export const MIN_SCORES_TO_QUALIFY = 3;
/** Gymnastic score and divisiveness need this many scores. */
export const MIN_SCORES_FOR_SPREAD = 3;

const EPS = 1e-9;

// ---------- Status rules ----------

export const countsAsScore = (s: Status) => s === 'Scored' || s === 'Imputed';
export const countsAsAttended = (s: Status) =>
  s === 'Scored' || s === 'Imputed' || s === 'Average' || s === 'TBC';

// ---------- Small maths helpers ----------

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function mean(xs: number[]): number | null {
  return xs.length ? sum(xs) / xs.length : null;
}

/** Sample standard deviation (n - 1), as STDEV gives in a spreadsheet. */
export function standardDeviation(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = sum(xs) / xs.length;
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

/** Drop the single highest and single lowest score, average the rest. */
export function gymnastic(xs: number[]): number | null {
  if (xs.length < MIN_SCORES_FOR_SPREAD) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return mean(sorted.slice(1, -1));
}

/** Divisiveness: standard deviation of an evening's scores, 3 or more only. */
export function divisiveness(xs: number[]): number | null {
  return xs.length >= MIN_SCORES_FOR_SPREAD ? standardDeviation(xs) : null;
}

/**
 * Absentee-adjusted average: assume each absentee would have given the evening
 * average shifted by their own score index.
 */
export function absenteeAdjusted(scores: number[], absentIndexes: number[]): number | null {
  const avg = mean(scores);
  if (avg === null) return null;
  const nAbsent = absentIndexes.length;
  return (sum(scores) + avg * nAbsent + sum(absentIndexes)) / (scores.length + nAbsent);
}

function quantile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function fiveNumber(xs: number[]): FiveNumber | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return {
    min: s[0],
    q1: quantile(s, 0.25),
    median: quantile(s, 0.5),
    q3: quantile(s, 0.75),
    max: s[s.length - 1],
  };
}

/** Scores bucketed by whole number: 7.8 -> bucket 7; only a 10 lands in bucket 10. */
export function histogram(xs: number[]): number[] {
  const out = new Array<number>(11).fill(0);
  for (const x of xs) out[Math.min(10, Math.max(0, Math.floor(x + EPS)))] += 1;
  return out;
}

/** Order by circuit, then number in circuit. Never by date. */
export function compareEvenings(a: Evening, b: Evening): number {
  return a.circuit - b.circuit || a.number - b.number;
}

/** Competition ranking (1, 2, 2, 4), highest value first. Nulls get no rank. */
export function rankDescending<T>(items: T[], value: (t: T) => number | null): Map<T, number> {
  const ranked = items
    .filter((t) => value(t) !== null)
    .sort((a, b) => (value(b) as number) - (value(a) as number));
  const out = new Map<T, number>();
  ranked.forEach((t, i) => {
    const prev = ranked[i - 1];
    const tied = i > 0 && Math.abs((value(prev) as number) - (value(t) as number)) < EPS;
    out.set(t, tied ? (out.get(prev) as number) : i + 1);
  });
  return out;
}

const byAverageDesc = (a: EveningStats, b: EveningStats) =>
  (b.average ?? -1) - (a.average ?? -1) || a.seq - b.seq;

// ---------- The model ----------

export function buildStats(input: StatsInput): Stats {
  const { wizards } = input;
  const overrides = input.overrides ?? {};
  const evenings = [...input.evenings].sort(compareEvenings);
  const eveningIds = new Set(evenings.map((e) => e.id));
  const rosterOrder = new Map(wizards.map((w, i) => [w.sheetName, i]));
  const order = (name: string) => rosterOrder.get(name) ?? wizards.length;

  const rows = input.scores.filter((s) => eveningIds.has(s.eveningId));
  const byEvening = new Map<string, ScoreEntry[]>();
  for (const s of rows) {
    const list = byEvening.get(s.eveningId);
    if (list) list.push(s);
    else byEvening.set(s.eveningId, [s]);
  }

  // Overall mean and each wizard's score index (harshness).
  const scored = rows.filter((s) => countsAsScore(s.status) && s.score !== null);
  const overallMean = mean(scored.map((s) => s.score as number));
  const givenBy = new Map<string, number[]>();
  for (const s of scored) {
    const list = givenBy.get(s.wizard);
    if (list) list.push(s.score as number);
    else givenBy.set(s.wizard, [s.score as number]);
  }
  const scoreIndex = (wizard: string): number | null => {
    const m = mean(givenBy.get(wizard) ?? []);
    return m === null || overallMean === null ? null : m - overallMean;
  };

  // ----- Evenings -----
  const evs: EveningStats[] = evenings.map((e, seq) => {
    const entries: EveningEntry[] = (byEvening.get(e.id) ?? [])
      .map((s) => ({
        wizard: s.wizard,
        status: s.status,
        score: countsAsScore(s.status) ? s.score : null,
      }))
      .sort((a, b) => order(a.wizard) - order(b.wizard));
    const withScore = entries.filter((x) => x.score !== null);
    const xs = withScore.map((x) => x.score as number);
    const absent = entries.filter((x) => x.status === 'DNA');
    const own = withScore.find((x) => x.wizard === e.chooser);
    const others = mean(withScore.filter((x) => x.wizard !== e.chooser).map((x) => x.score as number));
    return {
      ...e,
      seq,
      entries,
      nScores: xs.length,
      average: mean(xs),
      gymnastic: gymnastic(xs),
      adjusted: absenteeAdjusted(
        xs,
        absent.map((x) => scoreIndex(x.wizard) ?? 0),
      ),
      sd: divisiveness(xs),
      min: xs.length ? Math.min(...xs) : null,
      max: xs.length ? Math.max(...xs) : null,
      attended: entries.filter((x) => countsAsAttended(x.status)).length,
      dna: absent.length,
      unk: entries.filter((x) => x.status === 'UNK').length,
      owed: entries.filter((x) => x.status === 'TBC').map((x) => x.wizard),
      members: wizards.filter((w) => isMember(w, e.circuit)).length,
      qualified: xs.length >= MIN_SCORES_TO_QUALIFY,
      selfScore:
        own && others !== null
          ? { own: own.score as number, others, bias: (own.score as number) - others }
          : null,
      rank: {
        allTime: null,
        allTimeOf: 0,
        circuit: null,
        circuitGymnastic: null,
        circuitAdjusted: null,
        circuitOf: 0,
      },
    };
  });
  const evById = new Map(evs.map((e) => [e.id, e]));

  // All-time ranks (qualified evenings only).
  const qualified = evs.filter((e) => e.qualified);
  const allTimeRank = rankDescending(qualified, (e) => e.average);
  for (const e of qualified) {
    e.rank.allTime = allTimeRank.get(e) ?? null;
  }
  for (const e of evs) e.rank.allTimeOf = qualified.length;
  const allTime = [...qualified].sort(byAverageDesc).map((e) => e.id);

  // ----- Circuits -----
  const circuitNumbers = [...new Set(evs.map((e) => e.circuit))].sort((a, b) => a - b);
  const currentCircuit = circuitNumbers.length ? circuitNumbers[circuitNumbers.length - 1] : 0;

  const circuits: CircuitStats[] = circuitNumbers.map((c) => {
    const list = evs.filter((e) => e.circuit === c);
    const q = list.filter((e) => e.qualified);
    const rAvg = rankDescending(q, (e) => e.average);
    const rGym = rankDescending(q, (e) => e.gymnastic);
    const rAdj = rankDescending(q, (e) => e.adjusted);
    for (const e of list) {
      e.rank.circuit = rAvg.get(e) ?? null;
      e.rank.circuitGymnastic = rGym.get(e) ?? null;
      e.rank.circuitAdjusted = rAdj.get(e) ?? null;
      e.rank.circuitOf = q.length;
    }

    const leaderboard = [...q].sort(byAverageDesc);
    const unqualified = list.filter((e) => !e.qualified).sort(byAverageDesc);
    const pool = leaderboard.length ? leaderboard : unqualified.filter((e) => e.average !== null);

    const choosers = [...new Set(list.map((e) => e.chooser))];
    const members = wizards.filter((w) => isMember(w, c)).map((w) => w.sheetName);
    const due = wizards
      .filter((w) => isMember(w, c) && w.memberUntil === null && !choosers.includes(w.sheetName))
      .map((w) => w.sheetName);

    const reasons: string[] = [];
    if (list.some((e) => e.owed.length > 0)) reasons.push('TBC');
    if (list.some((e) => e.unk > 0)) reasons.push('UNK');
    if (due.length) reasons.push('due');

    const ov = overrides[`C${c}`];
    const officialWinner = ov?.winner ? resolveWizard(ov.winner, wizards) : undefined;
    const closed = Boolean(officialWinner) || ov?.final === true;

    let winner: CircuitWinner | null = null;
    let tiedWith: string[] = [];
    if (officialWinner) {
      const theirs = list.filter((e) => e.chooser === officialWinner.sheetName).sort(byAverageDesc);
      const ev = (ov?.evening ? list.find((e) => e.id === ov.evening) : undefined) ?? theirs[0];
      winner = {
        wizard: officialWinner.sheetName,
        eveningId: ev?.id ?? null,
        average: ev?.average ?? null,
        source: 'override',
      };
    } else if (pool.length) {
      const top = pool[0];
      winner = { wizard: top.chooser, eveningId: top.id, average: top.average, source: 'calculated' };
      tiedWith = pool
        .slice(1)
        .filter((e) => Math.abs((e.average as number) - (top.average as number)) < EPS)
        .map((e) => e.id);
    }

    const dates = list.map((e) => e.date).filter((d): d is string => d !== null).sort();
    const xs = list.flatMap((e) => e.entries.filter((x) => x.score !== null).map((x) => x.score as number));
    const attended = sum(list.map((e) => e.attended));
    const dna = sum(list.map((e) => e.dna));

    return {
      circuit: c,
      eveningIds: list.map((e) => e.id),
      choosers,
      members,
      due,
      provisional: !closed && reasons.length > 0,
      provisionalReasons: reasons,
      official: Boolean(officialWinner),
      announced: ov?.announced ?? null,
      winner,
      tiedWith,
      leaderboard: leaderboard.map((e) => e.id),
      unqualified: unqualified.map((e) => e.id),
      dateFrom: dates[0] ?? null,
      dateTo: dates[dates.length - 1] ?? null,
      resultDate: ov?.announced ?? dates[dates.length - 1] ?? null,
      nScores: xs.length,
      mean: mean(xs),
      sd: standardDeviation(xs),
      box: fiveNumber(xs),
      histogram: histogram(xs),
      attendanceRate: attended + dna > 0 ? attended / (attended + dna) : null,
      best: leaderboard[0]?.id ?? null,
      worst: leaderboard.length > 1 ? leaderboard[leaderboard.length - 1].id : null,
    };
  });
  const circuitByNumber = new Map(circuits.map((c) => [c.circuit, c]));

  // ----- Wizards -----
  const wizardStats: WizardStats[] = wizards.map((w) => {
    const name = w.sheetName;
    let attended = 0;
    let dna = 0;
    let unk = 0;
    let run = 0;
    let longest = 0;
    const given: { eveningId: string; circuit: number; score: number }[] = [];
    const owed: string[] = [];

    for (const e of evs) {
      const entry = e.entries.find((x) => x.wizard === name);
      if (entry?.score != null) given.push({ eveningId: e.id, circuit: e.circuit, score: entry.score });
      if (entry?.status === 'TBC') owed.push(e.id);
      if (!isMember(w, e.circuit)) continue;
      if (entry && countsAsAttended(entry.status)) {
        attended += 1;
        run += 1;
        longest = Math.max(longest, run);
      } else {
        // DNA, UNK or no row at all: the streak ends.
        if (entry?.status === 'DNA') dna += 1;
        if (entry?.status === 'UNK') unk += 1;
        run = 0;
      }
    }

    const xs = given.map((g) => g.score);
    const meanGiven = mean(xs);
    const hi = xs.length ? Math.max(...xs) : null;
    const lo = xs.length ? Math.min(...xs) : null;
    const at = (v: number) => given.filter((g) => Math.abs(g.score - v) < EPS).map((g) => g.eveningId);

    const perCircuit: WizardCircuit[] = circuits
      .filter((c) => isMember(w, c.circuit) || given.some((g) => g.circuit === c.circuit))
      .map((c) => {
        const cs = given.filter((g) => g.circuit === c.circuit).map((g) => g.score);
        const m = mean(cs);
        return {
          circuit: c.circuit,
          n: cs.length,
          mean: m,
          index: m !== null && c.mean !== null ? m - c.mean : null,
        };
      });

    const hosted = evs.filter((e) => e.chooser === name);
    const selfScores = hosted
      .filter((e) => e.selfScore !== null)
      .map((e) => ({ eveningId: e.id, ...(e.selfScore as NonNullable<EveningStats['selfScore']>) }));

    return {
      ...w,
      active: w.memberUntil === null,
      attended,
      dna,
      unk,
      attendanceRate: attended + dna > 0 ? attended / (attended + dna) : null,
      longestStreak: longest,
      currentStreak: run,
      nScores: xs.length,
      meanGiven,
      index: scoreIndex(name),
      histogram: histogram(xs),
      highest: hi !== null ? { score: hi, eveningIds: at(hi) } : null,
      lowest: lo !== null ? { score: lo, eveningIds: at(lo) } : null,
      perCircuit,
      hosted: hosted.map((e) => e.id),
      circuitWins: circuits
        .filter((c) => !c.provisional && c.winner?.wizard === name)
        .map((c) => c.circuit),
      selfScores,
      meanSelfBias: mean(selfScores.map((s) => s.bias)),
      owed,
    };
  });

  // ----- Records -----
  const withSd = evs.filter((e) => e.sd !== null);
  const selfBias = evs
    .filter((e) => e.selfScore !== null)
    .map((e) => ({ eveningId: e.id, wizard: e.chooser, bias: (e.selfScore as { bias: number }).bias }));
  const allEntries = evs.flatMap((e) =>
    e.entries
      .filter((x) => x.score !== null)
      .map((x) => ({ eveningId: e.id, wizard: x.wizard, score: x.score as number, seq: e.seq })),
  );

  const nominationCounts = new Map<string, { from: string; to: string; count: number }>();
  for (const c of circuits) {
    const list = c.eveningIds.map((id) => evById.get(id) as EveningStats);
    for (let i = 1; i < list.length; i++) {
      const from = list[i - 1].chooser;
      const to = list[i].chooser;
      if (from === to) continue;
      const key = `${from}>${to}`;
      const cur = nominationCounts.get(key);
      if (cur) cur.count += 1;
      else nominationCounts.set(key, { from, to, count: 1 });
    }
  }

  const records: Records = {
    highest: allTime.slice(0, 5),
    lowest: allTime.slice(-5).reverse(),
    mostDivisive: [...withSd].sort((a, b) => (b.sd as number) - (a.sd as number) || a.seq - b.seq).slice(0, 5).map((e) => e.id),
    mostUnanimous: [...withSd].sort((a, b) => (a.sd as number) - (b.sd as number) || a.seq - b.seq).slice(0, 5).map((e) => e.id),
    tens: allEntries.filter((x) => x.score >= 10 - EPS).map(({ eveningId, wizard }) => ({ eveningId, wizard })),
    lowScores: allEntries
      .filter((x) => x.score <= 3 + EPS)
      .sort((a, b) => a.score - b.score || a.seq - b.seq)
      .map(({ eveningId, wizard, score }) => ({ eveningId, wizard, score })),
    selfBiasHigh: selfBias.filter((s) => s.bias > EPS).sort((a, b) => b.bias - a.bias).slice(0, 5),
    selfBiasLow: selfBias.filter((s) => s.bias < -EPS).sort((a, b) => a.bias - b.bias).slice(0, 5),
    longestStreak: wizardStats
      .filter((w) => w.longestStreak > 0)
      .sort((a, b) => b.longestStreak - a.longestStreak)
      .map((w) => ({ wizard: w.sheetName, length: w.longestStreak })),
    mostWins: wizardStats
      .filter((w) => w.circuitWins.length > 0)
      .sort((a, b) => b.circuitWins.length - a.circuitWins.length)
      .map((w) => ({ wizard: w.sheetName, wins: w.circuitWins.length })),
    nominations: [...nominationCounts.values()].sort(
      (a, b) => b.count - a.count || order(a.from) - order(b.from) || order(a.to) - order(b.to),
    ),
  };

  // ----- Hosting order -----
  const byPosition = new Map<number, number[]>();
  const firstHalf: number[] = [];
  const secondHalf: number[] = [];
  for (const e of qualified) {
    const list = byPosition.get(e.number);
    if (list) list.push(e.average as number);
    else byPosition.set(e.number, [e.average as number]);

    const c = circuitByNumber.get(e.circuit) as CircuitStats;
    // An unfinished current circuit has no known length yet, so no halves.
    if (c.circuit === currentCircuit && c.due.length > 0) continue;
    const where = (e.number - 0.5) / c.eveningIds.length;
    if (where < 0.5 - EPS) firstHalf.push(e.average as number);
    else if (where > 0.5 + EPS) secondHalf.push(e.average as number);
  }
  const slots: HostingSlot[] = [...byPosition.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([position, xs]) => ({ position, n: xs.length, mean: mean(xs) as number }));

  return {
    overallMean,
    totalScores: scored.length,
    currentCircuit,
    wizards: wizardStats,
    evenings: evs,
    circuits,
    allTime,
    records,
    hostingOrder: { slots, firstHalfMean: mean(firstHalf), secondHalfMean: mean(secondHalf) },
    status: input.status ?? { batonHolder: null, nextDate: null, nextRestaurant: null },
  };
}

// ---------- Queries used by pages (same module, same numbers) ----------

export interface HeadToHead {
  shared: { eveningId: string; a: number; b: number; diff: number }[];
  /** Evenings both attended, scored or not. */
  together: number;
  meanA: number | null;
  meanB: number | null;
  /** Mean of (a - b). */
  meanDiff: number | null;
  meanAbsDiff: number | null;
  aHigher: number;
  bHigher: number;
  same: number;
  biggestGap: string | null;
}

/** How far apart two wizards' scores are on evenings both scored. */
export function headToHead(evenings: EveningStats[], a: string, b: string): HeadToHead {
  const shared: HeadToHead['shared'] = [];
  let together = 0;
  for (const e of evenings) {
    const ea = e.entries.find((x) => x.wizard === a);
    const eb = e.entries.find((x) => x.wizard === b);
    if (!ea || !eb) continue;
    if (countsAsAttended(ea.status) && countsAsAttended(eb.status)) together += 1;
    if (ea.score === null || eb.score === null) continue;
    shared.push({ eveningId: e.id, a: ea.score, b: eb.score, diff: ea.score - eb.score });
  }
  const biggest = [...shared].sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))[0];
  return {
    shared,
    together,
    meanA: mean(shared.map((s) => s.a)),
    meanB: mean(shared.map((s) => s.b)),
    meanDiff: mean(shared.map((s) => s.diff)),
    meanAbsDiff: mean(shared.map((s) => Math.abs(s.diff))),
    aHigher: shared.filter((s) => s.diff > EPS).length,
    bHigher: shared.filter((s) => s.diff < -EPS).length,
    same: shared.filter((s) => Math.abs(s.diff) <= EPS).length,
    biggestGap: biggest && Math.abs(biggest.diff) > EPS ? biggest.eveningId : null,
  };
}

/** Split evenings into ranked qualifiers and the unqualified rest. */
export function leaderboard(evenings: EveningStats[]): {
  qualified: EveningStats[];
  unqualified: EveningStats[];
} {
  return {
    qualified: evenings.filter((e) => e.qualified).sort(byAverageDesc),
    unqualified: evenings.filter((e) => !e.qualified).sort(byAverageDesc),
  };
}

/**
 * The most recent evening that has happened: latest date on or before `today`
 * when dates exist, otherwise the last evening in circuit order.
 */
export function latestEvening(evenings: EveningStats[], today: string): EveningStats | null {
  const dated = evenings.filter((e) => e.date !== null && e.date <= today);
  if (dated.length) {
    return dated.reduce((best, e) => ((e.date as string) > (best.date as string) ? e : best));
  }
  const undated = evenings.filter((e) => e.date === null);
  return undated[undated.length - 1] ?? null;
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
