import type { ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Heatmap } from '../components/Heatmap.tsx';
import { Badge, Card, EveningLink, NotFound, PageTitle, Provisional, Select, Stat, StatGrid, WizardLink } from '../components/ui.tsx';
import { useData } from '../data.tsx';
import { fmt, fmtDateRange, list, ordinal, pct, plural } from '../lib/format.ts';
import type { CircuitStats, EveningStats } from '../lib/types.ts';
import { whyProvisional } from './Home.tsx';

function StatusBadge({ c }: { c: CircuitStats }) {
  if (c.provisional) return <Provisional />;
  return c.official ? <Badge tone="gold">Official</Badge> : <Badge>Final</Badge>;
}

export function CircuitsIndex() {
  const data = useData();
  const circuits = [...data.stats.circuits].reverse();
  const latest = circuits[0]?.circuit ?? 1;
  return (
    <>
      <PageTitle title="Circuits" sub="One round in which every member chooses once. The highest evening average wins." />
      <p className="mb-4 text-sm">
        <Link to={`/circuits/compare?a=${Math.max(1, latest - 1)}&b=${latest}`} className="link">
          Compare two circuits
        </Link>
      </p>
      <ul>
        {circuits.map((c) => {
          const win = c.winner?.eveningId ? data.evening(c.winner.eveningId) : undefined;
          return (
            <li key={c.circuit}>
              <Card
                title={
                  <Link to={`/circuits/${c.circuit}`} className="link">
                    {ordinal(c.circuit)} circuit
                  </Link>
                }
                aside={<StatusBadge c={c} />}
              >
                {c.winner ? (
                  <p className="text-sm">
                    <span className="text-ink-2">{c.provisional ? 'Leading: ' : 'Winner: '}</span>
                    <WizardLink name={c.winner.wizard} />
                    {win && (
                      <>
                        {' '}with <EveningLink e={win} /> <span className="num font-semibold">{fmt(c.winner.average)}</span>
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted">No scores yet.</p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {plural(c.eveningIds.length, 'evening')} · {fmtDateRange(c.dateFrom, c.dateTo)} · circuit average <span className="num">{fmt(c.mean)}</span>
                </p>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Ranked({ value, rank }: { value: number | null; rank: number | null }) {
  return (
    <>
      {fmt(value)}
      <span className="block text-[11px] font-normal text-muted">{rank ? ordinal(rank) : '–'}</span>
    </>
  );
}

export function CircuitDetail() {
  const data = useData();
  const n = Number(useParams().n);
  const c = data.circuit(n);
  if (!c) return <NotFound what="circuit" />;
  const evenings = c.eveningIds.map((id) => data.evening(id)!);
  const win = c.winner?.eveningId ? data.evening(c.winner.eveningId) : undefined;

  return (
    <>
      <PageTitle title={`${ordinal(c.circuit)} circuit`} sub={`${plural(evenings.length, 'evening')} · ${fmtDateRange(c.dateFrom, c.dateTo)}`}>
        <nav aria-label="Other circuits" className="mt-2 flex gap-4 text-sm">
          {data.circuit(n - 1) && <Link to={`/circuits/${n - 1}`} className="link">← {ordinal(n - 1)}</Link>}
          {data.circuit(n + 1) && <Link to={`/circuits/${n + 1}`} className="link">{ordinal(n + 1)} →</Link>}
          <Link to="/circuits" className="link">All circuits</Link>
        </nav>
      </PageTitle>

      <Card title={c.provisional ? 'Standing' : 'Result'} aside={<StatusBadge c={c} />}>
        {c.winner ? (
          <p>
            <span className="text-ink-2">{c.provisional ? 'Leading: ' : 'Winner: '}</span>
            <WizardLink name={c.winner.wizard} />
            {win && (
              <>
                {' '}with <EveningLink e={win} /> on <span className="num font-semibold">{fmt(c.winner.average)}</span>
              </>
            )}
          </p>
        ) : (
          <p className="text-muted">No scores yet.</p>
        )}
        {c.tiedWith.length > 0 && (
          <p className="mt-1 text-sm text-ink-2">Tied on average with {list(c.tiedWith.map((id) => data.evening(id)!.restaurant))}.</p>
        )}
        {c.official && c.winner?.source === 'override' && (
          <p className="mt-1 text-sm text-ink-2">Official result as declared by the group{c.announced ? ` on ${fmtDateRange(c.announced, c.announced)}` : ''}.</p>
        )}
        {c.provisional && <p className="mt-1 text-sm text-ink-2">Provisional while {whyProvisional(c)}.</p>}
        {c.due.length > 0 && (
          <p className="mt-1 text-sm text-ink-2">
            Still to host: {list(c.due.map(data.name))}.
          </p>
        )}
        <div className="mt-3">
          <StatGrid>
            <Stat label="Circuit average" value={fmt(c.mean)} sub={plural(c.nScores, 'score')} />
            <Stat label="Attendance" value={pct(c.attendanceRate)} />
          </StatGrid>
        </div>
      </Card>

      <Card title="Evenings in order" aside="Rank within the circuit under each score">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Evening</th>
              <th scope="col" className="r">Avg</th>
              <th scope="col" className="r"><abbr title="Gymnastic score: highest and lowest dropped">Gym</abbr></th>
              <th scope="col" className="r"><abbr title="Absentee-adjusted average">Adj</abbr></th>
            </tr>
          </thead>
          <tbody>
            {evenings.map((e) => (
              <tr key={e.id} className={e.qualified ? '' : 'text-muted'}>
                <td>
                  <span className="num text-muted">{e.number}. </span>
                  <EveningLink e={e} className={e.qualified ? 'link' : 'underline underline-offset-2'} />
                  <span className="block text-xs text-muted">
                    {data.name(e.chooser)} · {plural(e.nScores, 'score')}
                    {e.owed.length > 0 && ` · ${e.owed.length} owed`}
                  </span>
                </td>
                <td className="r font-semibold"><Ranked value={e.average} rank={e.rank.circuit} /></td>
                <td className="r"><Ranked value={e.gymnastic} rank={e.rank.circuitGymnastic} /></td>
                <td className="r"><Ranked value={e.adjusted} rank={e.rank.circuitAdjusted} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Greyed evenings have fewer than 3 scores and are not ranked.</p>
      </Card>

      <Card title="Who scored what">
        <Heatmap evenings={evenings} />
      </Card>
    </>
  );
}

function range(evenings: EveningStats[]): string {
  const xs = evenings.filter((e) => e.qualified).map((e) => e.average as number);
  return xs.length ? `${fmt(Math.min(...xs))} to ${fmt(Math.max(...xs))}` : '–';
}

export function CircuitCompare() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const all = data.stats.circuits;
  const pick = (key: string, fallback: number) => data.circuit(Number(params.get(key))) ?? data.circuit(fallback) ?? all[0];
  const last = all[all.length - 1]?.circuit ?? 1;
  const a = pick('a', Math.max(1, last - 1));
  const b = pick('b', last);
  if (!a || !b) return <NotFound what="circuit" />;

  const options = all.map((c) => ({ value: String(c.circuit), label: `${ordinal(c.circuit)} circuit` }));
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };
  const evOf = (c: CircuitStats) => c.eveningIds.map((id) => data.evening(id)!);
  const ev = (id: string | null) => (id ? data.evening(id) : undefined);
  const place = (e: EveningStats | undefined) =>
    e ? (
      <>
        <EveningLink e={e} />
        <span className="num block text-xs text-muted">{fmt(e.average)}</span>
      </>
    ) : (
      '–'
    );

  const rows: { label: string; a: ReactNode; b: ReactNode }[] = [
    { label: 'Evenings', a: a.eveningIds.length, b: b.eveningIds.length },
    { label: 'Scores given', a: a.nScores, b: b.nScores },
    { label: 'Circuit average', a: fmt(a.mean), b: fmt(b.mean) },
    { label: 'Spread of scores (standard deviation)', a: fmt(a.sd), b: fmt(b.sd) },
    { label: 'Evening averages, lowest to highest', a: range(evOf(a)), b: range(evOf(b)) },
    { label: 'Attendance', a: pct(a.attendanceRate), b: pct(b.attendanceRate) },
    { label: 'Best evening', a: place(ev(a.best)), b: place(ev(b.best)) },
    { label: 'Worst evening', a: place(ev(a.worst)), b: place(ev(b.worst)) },
    {
      label: 'Winner',
      a: a.winner ? <>{data.name(a.winner.wizard)}{a.provisional && <span className="block text-xs text-muted">provisional</span>}</> : '–',
      b: b.winner ? <>{data.name(b.winner.wizard)}{b.provisional && <span className="block text-xs text-muted">provisional</span>}</> : '–',
    },
  ];

  return (
    <>
      <PageTitle title="Compare circuits" sub="Two circuits side by side." />
      <div className="mb-4 flex gap-3">
        <Select label="First circuit" value={String(a.circuit)} onChange={(v) => set('a', v)} options={options} />
        <Select label="Second circuit" value={String(b.circuit)} onChange={(v) => set('b', v)} options={options} />
      </div>
      <Card>
        <table className="tbl table-fixed">
          <thead>
            <tr>
              <th scope="col" className="w-[36%]">Measure</th>
              <th scope="col" className="r">{ordinal(a.circuit)}</th>
              <th scope="col" className="r">{ordinal(b.circuit)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="!border-b !border-line !py-2 !align-top !text-xs !font-normal !text-ink-2">{r.label}</th>
                <td className="r !whitespace-normal font-semibold">{r.a}</td>
                <td className="r !whitespace-normal font-semibold">{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Best and worst are among evenings with 3 or more scores.</p>
      </Card>
    </>
  );
}
