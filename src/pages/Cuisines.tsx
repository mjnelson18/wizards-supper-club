import { TableView } from '../components/charts.tsx';
import { Card, EveningLink, PageTitle, WizardLink } from '../components/ui.tsx';
import { useData } from '../data.tsx';
import { fmt, ordinal, plural, signed } from '../lib/format.ts';
import type { CuisineGroup } from '../lib/types.ts';

/** Evenings in one circuit: 1, 2, 3, 4+ map to four steps of the score ramp. */
const countClass = (n: number) => (n >= 4 ? 6 : n === 3 ? 4 : n === 2 ? 3 : 1);

function Bars({ groups, sub }: { groups: CuisineGroup[]; sub?: (g: CuisineGroup) => string }) {
  const max = Math.max(1, ...groups.map((g) => g.eveningIds.length));
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th scope="col">Cuisine</th>
          <th scope="col" className="w-[26%]"><span className="sr-only">Share</span></th>
          <th scope="col" className="r">Visits</th>
          <th scope="col" className="r">Avg</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.name}>
            <td className="whitespace-nowrap">
              {g.name}
              {sub && <span className="block text-xs text-muted">{sub(g)}</span>}
            </td>
            <td aria-hidden="true">
              <span className="mt-1.5 block h-3 rounded-r bg-[var(--series-1)]" style={{ width: `${(g.eveningIds.length / max) * 100}%` }} />
            </td>
            <td className="r font-semibold">{g.eveningIds.length}</td>
            <td className="r">{fmt(g.mean)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Cuisines() {
  const data = useData();
  const { stats } = data;
  const c = stats.cuisines;
  const ev = (id: string) => data.evening(id)!;
  const total = stats.evenings.length;
  const classified = total - c.unclassified.length;
  const repeated = c.cuisines.filter((g) => g.eveningIds.length > 1);
  const once = c.cuisines.filter((g) => g.eveningIds.length === 1);
  const regionNames = c.regions.map((r) => r.name);

  if (!classified) {
    return <PageTitle title="Cuisines" sub="No evenings have a cuisine recorded yet." />;
  }

  return (
    <>
      <PageTitle
        title="Cuisines"
        sub={`What the Council eats, how that has changed, and who favours what. ${classified} of ${total} evenings, ${c.cuisines.length} cuisines.`}
      />

      <Card title="Where the Council goes" aside="By part of the world">
        <Bars groups={c.regions} />
        <p className="mt-2 text-xs text-muted">Visits are evenings. Avg is the mean of every score given at them.</p>
      </Card>

      <Card title="Most popular cuisines" aside="Visited more than once">
        <ul className="divide-y divide-line">
          {repeated.map((g) => (
            <li key={g.name} className="py-1">
              <details>
                <summary className="flex items-baseline justify-between gap-3 py-1">
                  <span className="min-w-0">
                    <span className="underline underline-offset-2">{g.name}</span>
                    <span className="block text-xs text-muted">{g.region} · {plural(g.eveningIds.length, 'evening')}</span>
                  </span>
                  <span className="num shrink-0 font-semibold">{fmt(g.mean)}</span>
                </summary>
                <ul className="mb-2 ml-3 space-y-1 border-l border-line pl-3 text-sm">
                  {g.eveningIds.map(ev).map((e) => (
                    <li key={e.id} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        <EveningLink e={e} /> <span className="text-xs text-muted">{data.name(e.chooser)}, {ordinal(e.circuit)}</span>
                      </span>
                      <span className="num shrink-0">{fmt(e.average)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Tap a cuisine for its evenings. The number is the average of every score given.</p>
      </Card>

      <Card title="Rare finds" aside={`${once.length} tried once`}>
        <ul className="divide-y divide-line">
          {once.map((g) => {
            const e = ev(g.eveningIds[0]);
            return (
              <li key={g.name} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  {g.name}
                  <span className="block text-xs text-muted">
                    <EveningLink e={e} className="underline underline-offset-2" /> · {data.name(e.chooser)}, {ordinal(e.circuit)} circuit
                  </span>
                </span>
                <span className="num shrink-0 font-semibold">{fmt(e.average)}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="How the mix has changed" aside="Evenings per circuit">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Evenings per region in each circuit">
          <table className="border-separate border-spacing-0.5">
            <thead>
              <tr>
                <th scope="col" className="pr-1.5 text-left text-xs font-semibold text-muted">Circuit</th>
                {c.byCircuit.map((b) => (
                  <th key={b.circuit} scope="col" className="text-center text-xs font-semibold text-muted">
                    <abbr title={`${ordinal(b.circuit)} circuit`} className="no-underline">{b.circuit}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {regionNames.map((region) => (
                <tr key={region}>
                  <th scope="row" className="whitespace-nowrap pr-1.5 text-left text-xs font-normal">{region}</th>
                  {c.byCircuit.map((b) => {
                    const n = b.regions[region] ?? 0;
                    const k = countClass(n);
                    return (
                      <td key={b.circuit} className="p-0">
                        {n ? (
                          <span className="num flex h-7 w-[22px] items-center justify-center rounded text-[11px] font-semibold" style={{ background: `var(--seq-${k})`, color: `var(--seq-ink-${k})` }}>
                            {n}
                          </span>
                        ) : (
                          <span className="flex h-7 w-[22px] items-center justify-center text-xs text-muted" aria-label="None">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mb-1 mt-4 text-sm">New to the Council, by circuit</h3>
        <ul className="space-y-1 text-sm">
          {c.byCircuit.map((b) => (
            <li key={b.circuit}>
              <span className="text-ink-2">{ordinal(b.circuit)}: </span>
              {b.firstTime.length ? (
                <>
                  <span className="num font-semibold">{b.firstTime.length}</span> <span className="text-ink-2">({b.firstTime.join(', ')})</span>
                </>
              ) : (
                <span className="text-muted">nothing new</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Who picks what" aside="Regions chosen more than once, and repeat cuisines">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Wizard</th>
              <th scope="col">Goes for</th>
              <th scope="col">Repeats</th>
            </tr>
          </thead>
          <tbody>
            {c.choosers.map((ch) => {
              const top = ch.regions[0].count;
              const favourites = ch.regions.filter((r) => r.count === top);
              return (
                <tr key={ch.wizard}>
                  <td className="whitespace-nowrap">
                    <WizardLink name={ch.wizard} />
                    <span className="block text-xs text-muted">{plural(ch.picks, 'pick')}</span>
                  </td>
                  <td>
                    {top > 1 ? (
                      favourites.map((r) => (
                        <span key={r.name} className="block">
                          {r.name} <span className="num whitespace-nowrap text-xs text-muted">{r.count} of {ch.picks}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-muted">No favourite</span>
                    )}
                  </td>
                  <td>
                    {ch.repeats.length ? (
                      ch.repeats.map((r) => (
                        <span key={r.name} className="block">
                          {r.name} <span className="num text-xs text-muted">×{r.count}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-muted">None</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Who rates what" aside="Against the rest of the table">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Wizard</th>
              <th scope="col">Warmest to</th>
              <th scope="col">Coolest to</th>
            </tr>
          </thead>
          <tbody>
            {c.taste.map((t) => {
              const warm = t.rows[0];
              const cool = t.rows[t.rows.length - 1];
              return (
                <tr key={t.wizard}>
                  <td className="whitespace-nowrap"><WizardLink name={t.wizard} /></td>
                  <td>
                    {warm.diff > 0 ? (
                      <>
                        {warm.region}
                        <span className="num block text-xs text-muted">{signed(warm.diff)} over {plural(warm.n, 'evening')}</span>
                      </>
                    ) : (
                      <span className="text-muted">–</span>
                    )}
                  </td>
                  <td>
                    {cool.diff < 0 && cool !== warm ? (
                      <>
                        {cool.region}
                        <span className="num block text-xs text-muted">{signed(cool.diff)} over {plural(cool.n, 'evening')}</span>
                      </>
                    ) : (
                      <span className="text-muted">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          How much higher or lower a wizard scores a region than everyone else at the same evenings, after taking off their usual gap to the table. Needs 3 or more evenings in a region, so these rest on small numbers.
        </p>
        <TableView
          head={['Wizard and region', 'Difference', 'Evenings']}
          rows={c.taste.flatMap((t) => t.rows.map((r) => [`${data.name(t.wizard)}: ${r.region}`, signed(r.diff), r.n]))}
        />
      </Card>

      {c.unclassified.length > 0 && (
        <Card title="Not yet classified">
          <p className="text-sm text-ink-2">
            {c.unclassified.map(ev).map((e, i) => (
              <span key={e.id}>
                {i > 0 && ', '}
                <EveningLink e={e} />
              </span>
            ))}
            . These are left out of everything above.
          </p>
        </Card>
      )}
    </>
  );
}
