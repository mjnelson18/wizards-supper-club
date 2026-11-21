// Shared data types. Raw inputs come from the two public Sheet tabs; everything
// under "Derived" is produced by src/lib/stats.ts and written to stats.json.

export const STATUSES = ['Scored', 'Imputed', 'Average', 'TBC', 'UNK', 'DNA'] as const;
export type Status = (typeof STATUSES)[number];

// ---------- Raw inputs ----------

export interface WizardConfig {
  /** Name used in the Sheet (primary key). */
  sheetName: string;
  displayName: string;
  fullName: string;
  /** First circuit as a member. */
  memberFrom: number;
  /** Last circuit as a member; null = still a member. */
  memberUntil: number | null;
}

export interface Evening {
  /** e.g. "C7-08" */
  id: string;
  circuit: number;
  number: number;
  /** ISO date or null (circuits 1-6 have none yet). */
  date: string | null;
  /** Sheet name of the chooser. */
  chooser: string;
  restaurant: string;
}

export interface ScoreEntry {
  eveningId: string;
  /** Sheet name. */
  wizard: string;
  status: Status;
  /** Present only when status is Scored or Imputed. */
  score: number | null;
}

export interface OverrideEntry {
  /** Official winner (sheet name, display name or full name). */
  winner?: string;
  /** Winning evening ID, if the winner hosted more than one evening. */
  evening?: string;
  /** ISO date the result was announced. */
  announced?: string;
  /** Mark the circuit as finished and keep the calculated winner. */
  final?: boolean;
}
export type Overrides = Record<string, OverrideEntry>;

export interface PublicStatus {
  batonHolder: string | null;
  nextDate: string | null;
  nextRestaurant: string | null;
}

export interface StatsInput {
  evenings: Evening[];
  scores: ScoreEntry[];
  wizards: WizardConfig[];
  overrides?: Overrides;
  status?: PublicStatus;
}

// ---------- Derived ----------

export interface EveningEntry {
  wizard: string;
  status: Status;
  score: number | null;
}

export interface SelfScore {
  own: number;
  others: number;
  bias: number;
}

export interface EveningStats extends Evening {
  /** Position in the whole history (0-based), ordered by circuit then number. */
  seq: number;
  entries: EveningEntry[];
  nScores: number;
  average: number | null;
  gymnastic: number | null;
  adjusted: number | null;
  /** Population standard deviation; null under 3 scores. */
  sd: number | null;
  min: number | null;
  max: number | null;
  attended: number;
  dna: number;
  unk: number;
  /** Wizards whose status is TBC. */
  owed: string[];
  /** Roster members in this evening's circuit. */
  members: number;
  /** 3 or more scores. */
  qualified: boolean;
  selfScore: SelfScore | null;
  rank: {
    allTime: number | null;
    allTimeOf: number;
    circuit: number | null;
    circuitGymnastic: number | null;
    circuitAdjusted: number | null;
    circuitOf: number;
  };
}

export interface FiveNumber {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

export interface CircuitWinner {
  wizard: string;
  eveningId: string | null;
  average: number | null;
  source: 'calculated' | 'override';
}

export interface CircuitStats {
  circuit: number;
  eveningIds: string[];
  /** Unique choosers in hosting order. */
  choosers: string[];
  /** Roster members during this circuit. */
  members: string[];
  /** Current members who have not chosen in this circuit. */
  due: string[];
  provisional: boolean;
  /** Why it is provisional: any of 'TBC', 'UNK', 'due'. */
  provisionalReasons: string[];
  /** An official result was recorded in config/overrides.json. */
  official: boolean;
  announced: string | null;
  winner: CircuitWinner | null;
  /** Other evenings tied with the winner on evening average. */
  tiedWith: string[];
  /** Qualified evenings, best average first. */
  leaderboard: string[];
  /** Evenings with fewer than 3 scores, best average first. */
  unqualified: string[];
  dateFrom: string | null;
  dateTo: string | null;
  /** Date the result became known: announcement, else last evening date. */
  resultDate: string | null;
  nScores: number;
  /** Mean of every score given in the circuit. */
  mean: number | null;
  /** Population standard deviation of every score given in the circuit. */
  sd: number | null;
  box: FiveNumber | null;
  /** Count of scores by whole number: index 0 = 0-0.99 ... index 10 = exactly 10. */
  histogram: number[];
  attendanceRate: number | null;
  best: string | null;
  worst: string | null;
}

export interface WizardCircuit {
  circuit: number;
  n: number;
  mean: number | null;
  /** Mean given in the circuit minus the circuit's mean. */
  index: number | null;
}

export interface WizardStats extends WizardConfig {
  active: boolean;
  attended: number;
  dna: number;
  unk: number;
  attendanceRate: number | null;
  longestStreak: number;
  currentStreak: number;
  nScores: number;
  meanGiven: number | null;
  /** Score index (harshness): meanGiven minus the overall mean. */
  index: number | null;
  histogram: number[];
  highest: { score: number; eveningIds: string[] } | null;
  lowest: { score: number; eveningIds: string[] } | null;
  perCircuit: WizardCircuit[];
  hosted: string[];
  /** Circuits won (finished circuits only). */
  circuitWins: number[];
  selfScores: ({ eveningId: string } & SelfScore)[];
  meanSelfBias: number | null;
  /** Evenings where this wizard's score is still TBC. */
  owed: string[];
}

export interface Records {
  highest: string[];
  lowest: string[];
  mostDivisive: string[];
  mostUnanimous: string[];
  tens: { eveningId: string; wizard: string }[];
  lowScores: { eveningId: string; wizard: string; score: number }[];
  selfBiasHigh: { eveningId: string; wizard: string; bias: number }[];
  selfBiasLow: { eveningId: string; wizard: string; bias: number }[];
  longestStreak: { wizard: string; length: number }[];
  mostWins: { wizard: string; wins: number }[];
  nominations: { from: string; to: string; count: number }[];
}

export interface HostingSlot {
  position: number;
  n: number;
  mean: number;
}

export interface Stats {
  overallMean: number | null;
  totalScores: number;
  currentCircuit: number;
  wizards: WizardStats[];
  evenings: EveningStats[];
  circuits: CircuitStats[];
  /** Qualified evenings, best average first. */
  allTime: string[];
  records: Records;
  hostingOrder: {
    slots: HostingSlot[];
    firstHalfMean: number | null;
    secondHalfMean: number | null;
  };
  status: PublicStatus;
}

export interface Meta {
  refreshedAt: string;
  source: 'sheet' | 'sample';
  counts: { evenings: number; scoreRows: number; scores: number };
}
