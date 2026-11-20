import { useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useData } from '../data.tsx';
import { fmt, ordinal, plural } from '../lib/format.ts';
import type { EveningStats } from '../lib/types.ts';

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Wizards Supper Club`;
  }, [title]);
}

export function PageTitle({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  useTitle(title);
  return (
    <header className="mb-5">
      <h1 className="text-2xl text-gold sm:text-3xl">{title}</h1>
      {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      {children}
    </header>
  );
}

export function Card({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-4 rounded-xl border border-line bg-surface p-4 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {title && <h2 className="text-lg">{title}</h2>}
          {aside && <div className="text-sm text-ink-2">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A headline number with its label. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg bg-raised px-3 py-2.5">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold leading-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;
}

export function Badge({ tone = 'muted', children }: { tone?: 'gold' | 'amber' | 'muted'; children: ReactNode }) {
  const tones = {
    gold: 'bg-gold text-on-gold',
    amber: 'bg-[var(--tbc)] text-[var(--tbc-ink)]',
    muted: 'border border-line text-ink-2',
  };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 align-middle text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Provisional() {
  return <Badge tone="amber">Provisional</Badge>;
}

export function EveningLink({ e, className = 'link' }: { e: EveningStats; className?: string }) {
  return (
    <Link to={`/evenings/${e.id}`} className={className}>
      {e.restaurant}
    </Link>
  );
}

export function WizardLink({ name, className = 'link' }: { name: string; className?: string }) {
  const data = useData();
  return (
    <Link to={`/wizards/${name}`} className={className}>
      {data.name(name)}
    </Link>
  );
}

export function CircuitLink({ n, className = 'link' }: { n: number; className?: string }) {
  return (
    <Link to={`/circuits/${n}`} className={className}>
      {ordinal(n)} circuit
    </Link>
  );
}

export function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1 block text-xs text-ink-2">
        {label}
      </label>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Ranked restaurants. Evenings with fewer than three scores have no rank and
 * are shown greyed out.
 */
export function RankList({ evenings, rank, showCircuit = true }: { evenings: EveningStats[]; rank?: (e: EveningStats, i: number) => number | null; showCircuit?: boolean }) {
  const data = useData();
  if (!evenings.length) return <p className="text-sm text-muted">Nothing here yet.</p>;
  return (
    <ol className="divide-y divide-line">
      {evenings.map((e, i) => {
        const place = e.qualified ? (rank ? rank(e, i) : i + 1) : null;
        return (
          <li key={e.id} className={`flex items-baseline gap-3 py-2 ${e.qualified ? '' : 'text-muted'}`}>
            <span className="num w-6 shrink-0 text-right text-sm text-muted" aria-label={place ? `Rank ${place}` : 'Unranked'}>
              {place ?? '–'}
            </span>
            <span className="min-w-0 flex-1">
              <EveningLink e={e} className={e.qualified ? 'link' : 'underline underline-offset-2'} />
              <span className="block text-xs text-muted">
                {data.name(e.chooser)}
                {showCircuit && ` · ${ordinal(e.circuit)} circuit`} · {plural(e.nScores, 'score')}
                {!e.qualified && ' (needs 3 to rank)'}
              </span>
            </span>
            <span className="num shrink-0 text-base font-semibold">{fmt(e.average)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A value on a 0-10 track, for comparing a handful of scores. */
export function ScoreBar({ label, value, note }: { label: ReactNode; value: number; note?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="w-16 shrink-0 truncate">{label}</span>
      <span className="relative h-3 min-w-0 flex-1" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-r bg-[var(--series-1)]" style={{ width: `${Math.max(1, value * 10)}%` }} />
      </span>
      <span className="num w-14 shrink-0 text-right font-semibold">{note}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-raised px-3 py-4 text-center text-sm text-ink-2">{children}</p>;
}

export function NotFound({ what }: { what: string }) {
  return (
    <div>
      <PageTitle title="Not found" />
      <Empty>
        There is no {what} here. <Link to="/" className="link">Back to the Council chamber</Link>
      </Empty>
    </div>
  );
}
