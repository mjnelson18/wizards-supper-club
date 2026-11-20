import type { ReactNode } from 'react';
import { Card, EveningLink, PageTitle, WizardLink } from '../components/ui.tsx';
import { useData } from '../data.tsx';
import { fmt, fmtScore, ordinal, plural, signed } from '../lib/format.ts';
import type { EveningStats } from '../lib/types.ts';

function Rows({ items }: { items: { key: string; main: ReactNode; sub?: ReactNode; value: ReactNode }[] }) {
  if (!items.length) return <p className="text-sm text-muted">None yet.</p>;
  return (
    <ol className="divide-y divide-line">
      {items.map((it) => (
        <li key={it.key} className="flex items-baseline justify-between gap-3 py-2">
          <span className="min-w-0">
            {it.main}
            {it.sub && <span className="block text-xs text-muted">{it.sub}</span>}
          </span>
          <span className="num shrink-0 font-semibold">{it.value}</span>
        </li>
      ))}
    </ol>
  );
}

export function Records() {
  const data = useData();
  const { records } = data.stats;
  const ev = (id: string) => data.evening(id) as EveningStats;
  const where = (e: EveningStats) => `${data.name(e.chooser)} · ${ordinal(e.circuit)} circuit`;
  const evenings = (ids: string[], value: (e: EveningStats) => ReactNode) =>
    ids.map(ev).map((e) => ({ key: e.id, main: <EveningLink e={e} />, sub: `${where(e)} · ${plural(e.nScores, 'score')}`, value: value(e) }));

  const topStreak = records.longestStreak[0]?.length ?? 0;
  const topWins = records.mostWins[0]?.wins ?? 0;

  // Group the 10s by evening so a much-loved night reads as one line.
  const tensByEvening = new Map<string, string[]>();
  for (const t of records.tens) tensByEvening.set(t.eveningId, [...(tensByEvening.get(t.eveningId) ?? []), t.wizard]);

  return (
    <>
      <PageTitle title="Records and fun facts" sub="All worked out from the scores. Nothing here is written by hand." />

      <Card title="Highest evenings ever">
        <Rows items={evenings(records.highest, (e) => fmt(e.average))} />
      </Card>

      <Card title="Lowest evenings ever">
        <Rows items={evenings(records.lowest, (e) => fmt(e.average))} />
      </Card>

      <Card title="Most divisive" aside="Widest spread of scores">
        <Rows items={evenings(records.mostDivisive, (e) => fmt(e.sd))} />
      </Card>

      <Card title="Most unanimous" aside="Narrowest spread of scores">
        <Rows items={evenings(records.mostUnanimous, (e) => fmt(e.sd))} />
      </Card>

      <Card title="Every 10" aside={plural(records.tens.length, 'perfect score')}>
        <Rows
          items={[...tensByEvening.entries()].map(([id, wizards]) => {
            const e = ev(id);
            return {
              key: id,
              main: <EveningLink e={e} />,
              sub: (
                <>
                  from{' '}
                  {wizards.map((w, i) => (
                    <span key={w}>
                      {i > 0 && ', '}
                      <WizardLink name={w} className="underline underline-offset-2" />
                    </span>
                  ))}
                </>
              ),
              value: wizards.length > 1 ? `${wizards.length} × 10` : '10',
            };
          })}
        />
      </Card>

      <Card title="Every score of 3 or under" aside={plural(records.lowScores.length, 'score')}>
        <Rows
          items={records.lowScores.map((s) => {
            const e = ev(s.eveningId);
            return {
              key: `${s.eveningId}-${s.wizard}`,
              main: <EveningLink e={e} />,
              sub: (
                <>
                  from <WizardLink name={s.wizard} className="underline underline-offset-2" /> · {ordinal(e.circuit)} circuit
                </>
              ),
              value: fmtScore(s.score),
            };
          })}
        />
      </Card>

      <Card title="Biggest self-score bias" aside="Own score minus the others' average">
        <h3 className="mb-1 text-sm">Kindest to their own choice</h3>
        <Rows
          items={records.selfBiasHigh.map((s) => ({
            key: s.eveningId,
            main: <WizardLink name={s.wizard} />,
            sub: <>at <EveningLink e={ev(s.eveningId)} className="underline underline-offset-2" /></>,
            value: signed(s.bias),
          }))}
        />
        <h3 className="mb-1 mt-4 text-sm">Hardest on their own choice</h3>
        <Rows
          items={records.selfBiasLow.map((s) => ({
            key: s.eveningId,
            main: <WizardLink name={s.wizard} />,
            sub: <>at <EveningLink e={ev(s.eveningId)} className="underline underline-offset-2" /></>,
            value: signed(s.bias),
          }))}
        />
      </Card>

      <Card title="Longest attendance streak" aside="Evenings in a row">
        <Rows
          items={records.longestStreak.slice(0, 5).map((s) => ({
            key: s.wizard,
            main: <WizardLink name={s.wizard} />,
            sub: s.length === topStreak ? 'Record holder' : undefined,
            value: s.length,
          }))}
        />
      </Card>

      <Card title="Most circuit wins" aside="Finished circuits only">
        <Rows
          items={records.mostWins.map((s) => ({
            key: s.wizard,
            main: <WizardLink name={s.wizard} />,
            sub: s.wins === topWins ? 'Most wins' : undefined,
            value: s.wins,
          }))}
        />
      </Card>

      <Card title="Who nominates whom" aside="From the hosting order within each circuit">
        <Rows
          items={records.nominations.slice(0, 12).map((n) => ({
            key: `${n.from}-${n.to}`,
            main: (
              <>
                <WizardLink name={n.from} /> <span aria-hidden="true">→</span><span className="sr-only">nominated</span> <WizardLink name={n.to} />
              </>
            ),
            value: plural(n.count, 'time'),
          }))}
        />
        {records.nominations.length > 12 && <p className="mt-2 text-xs text-muted">Showing the 12 most frequent of {records.nominations.length} pairings.</p>}
      </Card>
    </>
  );
}
