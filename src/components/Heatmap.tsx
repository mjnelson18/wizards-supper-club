import { Link } from 'react-router';
import { useData } from '../data.tsx';
import { fmtScore } from '../lib/format.ts';
import type { EveningEntry, EveningStats } from '../lib/types.ts';

/** Seven score classes: under 4, then one per whole number up to 9-10. */
export const scoreClass = (score: number) => Math.max(0, Math.min(6, Math.floor(score) - 3));

const CELL = 'flex h-9 w-11 items-center justify-center rounded text-xs font-semibold num';

function Cell({ entry }: { entry: EveningEntry | undefined }) {
  if (!entry) return <span className={`${CELL} text-muted`} aria-label="Not a member or no record">·</span>;
  if (entry.score !== null) {
    const k = scoreClass(entry.score);
    return (
      <span className={CELL} style={{ background: `var(--seq-${k})`, color: `var(--seq-ink-${k})` }}>
        {fmtScore(entry.score)}
        {entry.status === 'Imputed' && <span aria-label=" (imputed)">*</span>}
      </span>
    );
  }
  switch (entry.status) {
    case 'DNA':
      return <span className={`${CELL} bg-[var(--dna)] text-[var(--dna-ink)]`} aria-label="Did not attend">DNA</span>;
    case 'TBC':
      return <span className={`${CELL} bg-[var(--tbc)] text-[var(--tbc-ink)]`} aria-label="Attended, score owed">TBC</span>;
    case 'UNK':
      return <span className={`${CELL} hatch border border-line text-ink`} aria-label="Attendance unknown">?</span>;
    default:
      return <span className={`${CELL} border border-line text-ink-2`} aria-label="Attended, took the evening average">avg</span>;
  }
}

/**
 * Wizard x evening grid for one circuit. The only element on the site allowed
 * to scroll sideways, and it does so inside its own frame.
 */
export function Heatmap({ evenings }: { evenings: EveningStats[] }) {
  const data = useData();
  const circuit = evenings[0]?.circuit;
  const wizards = data.stats.wizards.filter(
    (w) => (circuit !== undefined && w.memberFrom <= circuit && (w.memberUntil === null || circuit <= w.memberUntil)) || evenings.some((e) => e.entries.some((x) => x.wizard === w.sheetName)),
  );

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-line" tabIndex={0} role="region" aria-label="Scores by wizard and evening. Scrolls sideways.">
        <table className="border-separate border-spacing-0.5 p-1.5">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface px-1.5 text-left text-xs font-semibold text-muted">
                Wizard
              </th>
              {evenings.map((e) => (
                <th key={e.id} scope="col" className="px-0 pb-1 text-center text-xs font-semibold">
                  <Link to={`/evenings/${e.id}`} className="link block w-11" title={`${e.restaurant}, chosen by ${data.name(e.chooser)}`} aria-label={`Evening ${e.number}: ${e.restaurant}`}>
                    {e.number}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wizards.map((w) => (
              <tr key={w.sheetName}>
                <th scope="row" className="sticky left-0 z-10 bg-surface px-1.5 text-left text-sm font-normal">
                  <Link to={`/wizards/${w.sheetName}`} className="link whitespace-nowrap">
                    {w.displayName}
                  </Link>
                </th>
                {evenings.map((e) => {
                  const entry = e.entries.find((x) => x.wizard === w.sheetName);
                  return (
                    <td key={e.id} className={`p-0 ${e.chooser === w.sheetName ? 'rounded outline outline-2 outline-[var(--gold)]' : ''}`}>
                      <Cell entry={entry} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-2">
        <li className="flex items-center gap-1">
          <span>Low</span>
          <span className="flex" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((k) => (
              <span key={k} className="h-3 w-4" style={{ background: `var(--seq-${k})` }} />
            ))}
          </span>
          <span>High (under 4 to 9+)</span>
        </li>
        <li className="flex items-center gap-1"><span className="h-3 w-4 rounded-sm bg-[var(--dna)]" aria-hidden="true" />DNA: did not attend</li>
        <li className="flex items-center gap-1"><span className="h-3 w-4 rounded-sm bg-[var(--tbc)]" aria-hidden="true" />TBC: score owed</li>
        <li className="flex items-center gap-1"><span className="hatch h-3 w-4 rounded-sm border border-line" aria-hidden="true" />?: attendance unknown</li>
        <li>avg: took the evening average</li>
        <li>*: imputed score</li>
        <li className="flex items-center gap-1"><span className="h-3 w-4 rounded-sm outline outline-2 outline-[var(--gold)]" aria-hidden="true" />chooser</li>
      </ul>
    </div>
  );
}
