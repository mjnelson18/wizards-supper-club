// Display formatting. Numbers stay plain: two decimals for averages, the score
// as entered for individual scores.

const MINUS = '−';
const DASH = '–';

/** An average: two decimals, or a dash when there is none. */
export function fmt(n: number | null | undefined, dp = 2): string {
  return n === null || n === undefined ? DASH : n.toFixed(dp);
}

/** An individual score as entered: 8, 7.8, 9.49. */
export function fmtScore(n: number | null | undefined): string {
  return n === null || n === undefined ? DASH : String(Math.round(n * 100) / 100);
}

/** A signed difference: +0.31, −0.31, 0.00. */
export function signed(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined) return DASH;
  const s = Math.abs(n).toFixed(dp);
  if (Number(s) === 0) return s;
  return `${n > 0 ? '+' : MINUS}${s}`;
}

export function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? DASH : `${Math.round(n * 100)}%`;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "3 Sep 2026", or "Date not recorded" for the early circuits. */
export function fmtDate(iso: string | null | undefined, missing = 'Date not recorded'): string {
  return iso ? dateFmt.format(new Date(`${iso}T00:00:00Z`)) : missing;
}

export function fmtDateRange(from: string | null, to: string | null): string {
  if (!from || !to) return 'Dates not recorded';
  return from === to ? fmtDate(from) : `${fmtDate(from)} ${DASH} ${fmtDate(to)}`;
}

/** Refresh time in the reader's own time zone. */
export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Today's date (reader's local time) as YYYY-MM-DD. */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Calum, Dan and Mike" */
export function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
