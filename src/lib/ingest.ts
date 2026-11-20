// Turn the published CSV tabs into validated rows. Pure (no network or disk),
// so the privacy guards and the data contract are unit-tested.

import { z } from 'zod';
import { resolveWizard } from './roster.ts';
import { STATUSES } from './types.ts';
import type { Evening, Overrides, PublicStatus, ScoreEntry, Status, WizardConfig } from './types.ts';

/** Raised with every problem found, so one run reports them all. */
export class DataError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`${issues.length} data problem${issues.length === 1 ? '' : 's'}:\n- ${issues.join('\n- ')}`);
    this.name = 'DataError';
    this.issues = issues;
  }
}

// ---------- CSV ----------

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------- Whitelist and privacy guards ----------

const FORBIDDEN = ['@', 'http', 'docs.google.com'];
const MAX_CELL = 60;
const MAX_RESTAURANT = 80;

/** Reject anything that looks like an email, a link or free text. */
export function guardCell(value: string, where: string, max = MAX_CELL): string[] {
  const issues: string[] = [];
  const lower = value.toLowerCase();
  for (const bad of FORBIDDEN) {
    if (lower.includes(bad)) issues.push(`${where}: contains "${bad}", which is never allowed in public data`);
  }
  if (value.length > max) issues.push(`${where}: ${value.length} characters long (limit ${max})`);
  return issues;
}

type Row = Record<string, string>;

/**
 * Keep only the named columns, matched by header. Every other column is
 * dropped before anything else looks at the data.
 */
function whitelist(csv: string, tab: string, columns: Record<string, string>, issues: string[]): { row: Row; line: number }[] {
  const table = parseCsv(csv);
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  if (header.some((h) => h.startsWith('<!doctype') || h.startsWith('<html'))) {
    issues.push(`${tab}: got a web page instead of CSV. Is the tab published to the web as CSV?`);
    return [];
  }
  const index: Record<string, number> = {};
  for (const [key, name] of Object.entries(columns)) {
    index[key] = header.indexOf(name.toLowerCase());
    if (index[key] === -1) issues.push(`${tab}: missing column "${name}"`);
  }
  if (Object.values(index).includes(-1)) return [];

  const out: { row: Row; line: number }[] = [];
  table.slice(1).forEach((cells, i) => {
    const row: Row = {};
    for (const key of Object.keys(columns)) row[key] = (cells[index[key]] ?? '').trim();
    if (Object.values(row).every((v) => v === '')) return;
    out.push({ row, line: i + 2 });
  });
  return out;
}

// ---------- Row schemas (the data contract) ----------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), 'is not a real date');

const eveningRow = z.object({
  id: z.string().regex(/^C\d+-\d{2}$/, 'Evening ID must look like C7-08'),
  circuit: z.string().regex(/^\d+$/, 'Circuit must be a whole number'),
  number: z.string().regex(/^\d+$/, 'No. in circuit must be a whole number'),
  date: z.union([z.literal(''), isoDate]),
  chooser: z.string().min(1, 'Chooser is blank'),
  restaurant: z.string().min(1, 'Restaurant is blank'),
});

const scoreRow = z.object({
  eveningId: z.string().regex(/^C\d+-\d{2}$/, 'Evening ID must look like C7-08'),
  wizard: z.string().min(1, 'Wizard is blank'),
  status: z.enum(STATUSES, { error: `Status must be one of ${STATUSES.join(', ')}` }),
  score: z.string(),
});

const describe = (err: z.ZodError) => err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');

// ---------- Tabs ----------

export function parseEvenings(csv: string, wizards: WizardConfig[]): Evening[] {
  const issues: string[] = [];
  const rows = whitelist(
    csv,
    'Public_Evenings',
    { id: 'Evening ID', circuit: 'Circuit', number: 'No. in circuit', date: 'Date', chooser: 'Chooser', restaurant: 'Restaurant' },
    issues,
  );
  const out: Evening[] = [];
  const seen = new Set<string>();
  for (const { row, line } of rows) {
    const where = `Public_Evenings row ${line}`;
    for (const [key, value] of Object.entries(row)) {
      issues.push(...guardCell(value, `${where} (${key})`, key === 'restaurant' ? MAX_RESTAURANT : MAX_CELL));
    }
    const parsed = eveningRow.safeParse(row);
    if (!parsed.success) {
      issues.push(`${where}: ${describe(parsed.error)}`);
      continue;
    }
    const r = parsed.data;
    const [, c, n] = /^C(\d+)-(\d{2})$/.exec(r.id) as RegExpExecArray;
    if (Number(c) !== Number(r.circuit) || Number(n) !== Number(r.number)) {
      issues.push(`${where}: Evening ID ${r.id} does not match circuit ${r.circuit}, number ${r.number}`);
    }
    if (seen.has(r.id)) issues.push(`${where}: duplicate Evening ID ${r.id}`);
    seen.add(r.id);
    const chooser = resolveWizard(r.chooser, wizards);
    if (!chooser) {
      issues.push(`${where}: chooser "${r.chooser}" is not in config/wizards.json`);
      continue;
    }
    out.push({
      id: r.id,
      circuit: Number(r.circuit),
      number: Number(r.number),
      date: r.date === '' ? null : r.date,
      chooser: chooser.sheetName,
      restaurant: r.restaurant,
    });
  }
  if (!issues.length && !out.length) issues.push('Public_Evenings: no rows');
  if (issues.length) throw new DataError(issues);
  return out;
}

export function parseScores(
  csv: string,
  wizards: WizardConfig[],
  evenings: Evening[],
): { scores: ScoreEntry[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];
  const rows = whitelist(
    csv,
    'Public_Scores',
    { eveningId: 'Evening ID', wizard: 'Wizard', status: 'Status', score: 'Score' },
    issues,
  );
  const known = new Set(evenings.map((e) => e.id));
  const seen = new Set<string>();
  const scores: ScoreEntry[] = [];
  for (const { row, line } of rows) {
    const where = `Public_Scores row ${line}`;
    for (const [key, value] of Object.entries(row)) issues.push(...guardCell(value, `${where} (${key})`));
    const parsed = scoreRow.safeParse(row);
    if (!parsed.success) {
      issues.push(`${where}: ${describe(parsed.error)}`);
      continue;
    }
    const r = parsed.data;
    const status = r.status as Status;
    if (!known.has(r.eveningId)) issues.push(`${where}: evening ${r.eveningId} is not in Public_Evenings`);
    const wizard = resolveWizard(r.wizard, wizards);
    if (!wizard) {
      issues.push(`${where}: wizard "${r.wizard}" is not in config/wizards.json`);
      continue;
    }
    const key = `${r.eveningId}|${wizard.sheetName}`;
    if (seen.has(key)) issues.push(`${where}: second row for ${wizard.sheetName} at ${r.eveningId}`);
    seen.add(key);

    let score: number | null = null;
    if (status === 'Scored' || status === 'Imputed') {
      const n = Number(r.score);
      if (r.score === '' || !Number.isFinite(n) || n < 0 || n > 10) {
        issues.push(`${where}: ${status} needs a score from 0 to 10, got "${r.score}"`);
        continue;
      }
      score = n;
    } else if (r.score !== '') {
      warnings.push(`${where}: score "${r.score}" ignored because status is ${status}`);
    }
    scores.push({ eveningId: r.eveningId, wizard: wizard.sheetName, status, score });
  }
  if (issues.length) throw new DataError(issues);
  return { scores, warnings };
}

/** Optional key/value tab: baton_holder, next_date, next_restaurant. */
export function parseStatus(csv: string | null, wizards: WizardConfig[]): PublicStatus {
  const status: PublicStatus = { batonHolder: null, nextDate: null, nextRestaurant: null };
  if (!csv || !csv.trim()) return status;
  const issues: string[] = [];
  const rows = whitelist(csv, 'Public_Status', { key: 'key', value: 'value' }, issues);
  for (const { row, line } of rows) {
    const where = `Public_Status row ${line}`;
    const key = row.key.toLowerCase();
    const value = row.value;
    if (value === '') continue;
    if (key === 'baton_holder') {
      issues.push(...guardCell(value, where));
      const w = resolveWizard(value, wizards);
      if (!w) issues.push(`${where}: baton_holder "${value}" is not in config/wizards.json`);
      else status.batonHolder = w.sheetName;
    } else if (key === 'next_date') {
      const d = isoDate.safeParse(value);
      if (!d.success) issues.push(`${where}: next_date must be YYYY-MM-DD`);
      else status.nextDate = value;
    } else if (key === 'next_restaurant') {
      issues.push(...guardCell(value, where, MAX_RESTAURANT));
      status.nextRestaurant = value;
    }
    // Any other key is dropped: only the three known keys are public.
  }
  if (issues.length) throw new DataError(issues);
  return status;
}

// ---------- Config files ----------

const wizardSchema = z.object({
  sheetName: z.string().min(1),
  displayName: z.string().min(1),
  fullName: z.string().min(1),
  memberFrom: z.number().int().min(1),
  memberUntil: z.number().int().min(1).nullable(),
});

const overrideSchema = z.record(
  z.string().regex(/^C\d+$/, 'keys must look like C6'),
  z.object({
    winner: z.string().optional(),
    evening: z.string().optional(),
    announced: isoDate.optional(),
    final: z.boolean().optional(),
  }),
);

export function parseWizards(json: unknown): WizardConfig[] {
  const parsed = z.array(wizardSchema).min(1).safeParse(json);
  if (!parsed.success) throw new DataError([`config/wizards.json: ${describe(parsed.error)}`]);
  const names = parsed.data.map((w) => w.sheetName.toLowerCase());
  if (new Set(names).size !== names.length) throw new DataError(['config/wizards.json: duplicate sheetName']);
  return parsed.data;
}

export function parseOverrides(json: unknown, wizards: WizardConfig[]): Overrides {
  const parsed = overrideSchema.safeParse(json);
  if (!parsed.success) throw new DataError([`config/overrides.json: ${describe(parsed.error)}`]);
  const issues: string[] = [];
  for (const [key, o] of Object.entries(parsed.data)) {
    if (o.winner && !resolveWizard(o.winner, wizards)) {
      issues.push(`config/overrides.json: ${key} winner "${o.winner}" is not in config/wizards.json`);
    }
  }
  if (issues.length) throw new DataError(issues);
  return parsed.data;
}
