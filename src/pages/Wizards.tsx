import { Link, useParams, useSearchParams } from 'react-router';
import { Columns, TableView } from '../components/charts.tsx';
import { Badge, Card, CircuitLink, Empty, EveningLink, NotFound, PageTitle, Select, Stat, StatGrid, WizardLink } from '../components/ui.tsx';
import { useData } from '../data.tsx';
import { fmt, fmtScore, list, ordinal, pct, plural, signed } from '../lib/format.ts';
import { headToHead } from '../lib/stats.ts';
import type { WizardStats } from '../lib/types.ts';

const membership = (w: WizardStats) =>
  w.memberUntil === null ? `Member since the ${ordinal(w.memberFrom)} circuit` : `Member from the ${ordinal(w.memberFrom)} to the ${ordinal(w.memberUntil)} circuit`;

export function WizardsIndex() {
  const { stats } = useData();
  const first = stats.wizards.filter((w) => w.active);
  return (
    <>
      <PageTitle title="Wizards" sub="Attendance, how each wizard marks, and how their own choices have fared." />
      {first.length >= 2 && (
        <p className="mb-4 text-sm">
          <Link to={`/wizards/head-to-head?a=${first[0].sheetName}&b=${first[1].sheetName}`} className="link">
            Head-to-head: compare two wizards
          </Link>
        </p>
      )}
      <Card>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Wizard</th>
              <th scope="col" className="r">Attended</th>
              <th scope="col" className="r">Avg given</th>
              <th scope="col" className="r"><abbr title="Score index: average given minus the overall average. Negative is a harsh marker.">Index</abbr></th>
              <th scope="col" className="r">Wins</th>
            </tr>
          </thead>
          <tbody>
            {stats.wizards.map((w) => (
              <tr key={w.sheetName}>
                <td>
                  <WizardLink name={w.sheetName} />
                  {!w.active && <span className="block text-xs text-muted">Former member</span>}
                </td>
                <td className="r">{pct(w.attendanceRate)}</td>
                <td className="r">{fmt(w.meanGiven)}</td>
                <td className="r">{signed(w.index)}</td>
                <td className="r">{w.circuitWins.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Overall average score: <span className="num">{fmt(stats.overallMean)}</span> from {stats.totalScores} scores. Wins count finished circuits only.</p>
      </Card>
    </>
  );
}

export function WizardProfile() {
  const data = useData();
  const { name } = useParams();
  const w = name ? data.wizard(name) : undefined;
  if (!w) return <NotFound what="wizard" />;
  const ev = (id: string) => data.evening(id)!;
  const hosted = w.hosted.map(ev);
  const maxCount = Math.max(1, ...w.histogram);
  const tickStep = maxCount <= 5 ? 1 : maxCount <= 12 ? 2 : maxCount <= 30 ? 5 : 10;
  const top = Math.ceil(maxCount / tickStep) * tickStep;
  const others = data.stats.wizards.filter((o) => o.sheetName !== w.sheetName);
  const rival = others.find((o) => o.active) ?? others[0];
  const places = (ids: string[]) => {
    const shown = ids.slice(0, 4).map(ev);
    return (
      <>
        {shown.map((e, i) => (
          <span key={e.id}>
            {i > 0 && ', '}
            <EveningLink e={e} />
          </span>
        ))}
        {ids.length > shown.length && ` and ${ids.length - shown.length} more`}
      </>
    );
  };

  return (
    <>
      <PageTitle title={w.displayName} sub={`${w.fullName} · ${membership(w)}`}>
        {!w.active && <p className="mt-2"><Badge>Former member</Badge></p>}
      </PageTitle>

      <Card title="At the table">
        <StatGrid>
          <Stat label="Attendance" value={pct(w.attendanceRate)} sub={`${w.attended} attended, ${w.dna} missed${w.unk ? `, ${w.unk} unknown` : ''}`} />
          <Stat label="Longest streak" value={w.longestStreak} sub="evenings in a row" />
          {w.active && <Stat label="Current streak" value={w.currentStreak} sub="evenings in a row" />}
          <Stat label="Circuit wins" value={w.circuitWins.length} sub={w.circuitWins.length ? list(w.circuitWins.map(ordinal)) : 'None yet'} />
        </StatGrid>
      </Card>

      <Card title="As a marker">
        <StatGrid>
          <Stat label="Average score given" value={fmt(w.meanGiven)} sub={plural(w.nScores, 'score')} />
          <Stat label="Score index" value={signed(w.index)} sub={w.index === null ? undefined : w.index < 0 ? 'Harsher than the room' : 'More generous than the room'} />
          <Stat label="Self-score bias" value={signed(w.meanSelfBias)} sub={w.selfScores.length ? `over ${plural(w.selfScores.length, 'own evening')}` : 'No own evening scored'} />
        </StatGrid>

        {w.nScores > 0 ? (
          <>
            <h3 className="mb-1 mt-4 text-sm">Scores given, by whole number</h3>
            <Columns
              label={`${w.displayName}'s scores by whole number, 0 to 10`}
              max={top}
              ticks={Array.from({ length: top / tickStep + 1 }, (_, i) => i * tickStep)}
              format={(v) => String(v)}
              bars={w.histogram.map((count, score) => ({
                name: String(score),
                value: count,
                title: score === 10 ? 'A 10' : `${score} to ${score}.99`,
                lines: [plural(count, 'score')],
              }))}
            />
            <TableView head={['Score', 'Times given']} rows={w.histogram.map((count, score) => [score === 10 ? '10' : `${score}–${score}.99`, count])} />
            <dl className="mt-3 space-y-1 text-sm">
              {w.highest && (
                <div>
                  <dt className="inline text-ink-2">Highest given: </dt>
                  <dd className="inline"><span className="num font-semibold">{fmtScore(w.highest.score)}</span> for {places(w.highest.eveningIds)}</dd>
                </div>
              )}
              {w.lowest && (
                <div>
                  <dt className="inline text-ink-2">Lowest given: </dt>
                  <dd className="inline"><span className="num font-semibold">{fmtScore(w.lowest.score)}</span> for {places(w.lowest.eveningIds)}</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">No scores given yet.</p>
        )}
      </Card>

      <Card title="Hosting record" aside={plural(hosted.length, 'evening')}>
        {hosted.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Evening</th>
                <th scope="col" className="r">Avg</th>
                <th scope="col" className="r">In circuit</th>
                <th scope="col" className="r">All time</th>
              </tr>
            </thead>
            <tbody>
              {hosted.map((e) => {
                const c = data.circuit(e.circuit)!;
                const won = !c.provisional && c.winner?.eveningId === e.id;
                return (
                  <tr key={e.id} className={e.qualified ? '' : 'text-muted'}>
                    <td>
                      <EveningLink e={e} className={e.qualified ? 'link' : 'underline underline-offset-2'} />
                      <span className="block text-xs text-muted">
                        {ordinal(e.circuit)} circuit {won && <Badge tone="gold">Won</Badge>}
                      </span>
                    </td>
                    <td className="r font-semibold">{fmt(e.average)}</td>
                    <td className="r">{e.rank.circuit ? `${ordinal(e.rank.circuit)} of ${e.rank.circuitOf}` : '–'}</td>
                    <td className="r">{e.rank.allTime ? ordinal(e.rank.allTime) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">Has not hosted yet.</p>
        )}
      </Card>

      {w.owed.length > 0 && (
        <Card title="Scores owed" aside={<Badge tone="amber">{w.owed.length}</Badge>}>
          <ul className="space-y-1 text-sm">
            {w.owed.map(ev).map((e) => (
              <li key={e.id}>
                <EveningLink e={e} /> <span className="text-muted">· <CircuitLink n={e.circuit} className="underline underline-offset-2" /></span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rival && (
        <p className="mb-4 text-sm">
          <Link to={`/wizards/head-to-head?a=${w.sheetName}&b=${rival.sheetName}`} className="link">
            Compare {w.displayName} with another wizard
          </Link>
        </p>
      )}
    </>
  );
}

export function HeadToHead() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const wizards = data.stats.wizards;
  const a = data.wizard(params.get('a') ?? '') ?? wizards[0];
  const b = data.wizard(params.get('b') ?? '') ?? wizards.find((w) => w.sheetName !== a?.sheetName);
  if (!a || !b) return <NotFound what="wizard" />;

  const options = wizards.map((w) => ({ value: w.sheetName, label: w.displayName }));
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };
  const h = headToHead(data.stats.evenings, a.sheetName, b.sheetName);
  const same = a.sheetName === b.sheetName;
  const gap = h.biggestGap ? data.evening(h.biggestGap) : undefined;
  const gapRow = h.shared.find((s) => s.eveningId === h.biggestGap);
  const higher = h.meanDiff === null || Math.abs(h.meanDiff) < 0.005 ? null : h.meanDiff > 0 ? a : b;

  return (
    <>
      <PageTitle title="Head-to-head" sub="How far apart two wizards' scores are on evenings both scored." />
      <div className="mb-4 flex gap-3">
        <Select label="First wizard" value={a.sheetName} onChange={(v) => set('a', v)} options={options} />
        <Select label="Second wizard" value={b.sheetName} onChange={(v) => set('b', v)} options={options} />
      </div>

      {same ? (
        <Empty>Pick two different wizards.</Empty>
      ) : h.shared.length === 0 ? (
        <Empty>
          {a.displayName} and {b.displayName} have never both scored the same evening.
        </Empty>
      ) : (
        <>
          <Card title={`${a.displayName} and ${b.displayName}`} aside={`${plural(h.shared.length, 'evening')} both scored`}>
            <StatGrid>
              <Stat label="Typical gap" value={fmt(h.meanAbsDiff)} sub="points apart per evening" />
              <Stat label={`${a.displayName}'s average`} value={fmt(h.meanA)} />
              <Stat label={`${b.displayName}'s average`} value={fmt(h.meanB)} />
            </StatGrid>
            <p className="mt-3 text-sm text-ink-2">
              {higher ? (
                <>
                  {higher.displayName} scores <span className="num font-semibold text-ink">{fmt(Math.abs(h.meanDiff as number))}</span> higher on average.{' '}
                </>
              ) : (
                <>Their averages are level. </>
              )}
              {a.displayName} was higher {plural(h.aHigher, 'time')}, {b.displayName} {plural(h.bHigher, 'time')}, and they agreed exactly {plural(h.same, 'time')}.
            </p>
            {gap && gapRow && (
              <p className="mt-1 text-sm text-ink-2">
                Biggest disagreement: <EveningLink e={gap} /> ({a.displayName} {fmtScore(gapRow.a)}, {b.displayName} {fmtScore(gapRow.b)}).
              </p>
            )}
          </Card>

          <Card title="Evening by evening">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Evening</th>
                  <th scope="col" className="r">{a.displayName}</th>
                  <th scope="col" className="r">{b.displayName}</th>
                  <th scope="col" className="r">Gap</th>
                </tr>
              </thead>
              <tbody>
                {h.shared.map((s) => {
                  const e = data.evening(s.eveningId)!;
                  return (
                    <tr key={s.eveningId}>
                      <td>
                        <EveningLink e={e} />
                        <span className="block text-xs text-muted">{ordinal(e.circuit)} circuit</span>
                      </td>
                      <td className="r">{fmtScore(s.a)}</td>
                      <td className="r">{fmtScore(s.b)}</td>
                      <td className="r font-semibold">{signed(s.diff, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Gap is {a.displayName}'s score minus {b.displayName}'s.</p>
          </Card>
        </>
      )}
    </>
  );
}
