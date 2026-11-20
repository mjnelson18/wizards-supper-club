import { Link } from 'react-router';
import { Badge, Card, CircuitLink, EveningLink, PageTitle, Provisional, RankList, Stat, WizardLink } from '../components/ui.tsx';
import { useData } from '../data.tsx';
import { fmt, fmtDate, list, ordinal, plural, today } from '../lib/format.ts';
import { daysBetween, latestEvening } from '../lib/stats.ts';
import type { CircuitStats } from '../lib/types.ts';

/** How long a finished circuit's result stays on the home page. */
const RESULT_DAYS = 60;

const REASONS: Record<string, string> = {
  TBC: 'scores are still owed',
  UNK: "some attendance is unknown",
  due: 'not everyone has hosted',
};

export function whyProvisional(c: CircuitStats): string {
  return list(c.provisionalReasons.map((r) => REASONS[r] ?? r));
}

export function Home() {
  const data = useData();
  const { stats } = data;
  const now = today();
  const current = data.circuit(stats.currentCircuit);
  const previous = data.circuit(stats.currentCircuit - 1);
  const latest = latestEvening(stats.evenings, now);
  const upcoming = stats.evenings.filter((e) => e.date !== null && e.date > now);
  const daysSince = latest?.date ? daysBetween(latest.date, now) : null;
  const owing = stats.wizards.filter((w) => w.owed.length > 0).sort((a, b) => b.owed.length - a.owed.length);
  const totalOwed = owing.reduce((n, w) => n + w.owed.length, 0);
  const { batonHolder, nextDate, nextRestaurant } = stats.status;
  const hasNext = Boolean(batonHolder || nextDate || nextRestaurant);

  if (!current) {
    return <PageTitle title="The Council chamber" sub="No evenings have been recorded yet." />;
  }

  const active = stats.wizards.filter((w) => w.active && w.memberFrom <= current.circuit);
  const board = [...current.leaderboard, ...current.unqualified].map((id) => data.evening(id)!);
  const showPrevious =
    previous &&
    (previous.provisional || (previous.resultDate !== null && daysBetween(previous.resultDate, now) <= RESULT_DAYS));
  const previousWinner = previous?.winner?.eveningId ? data.evening(previous.winner.eveningId) : undefined;

  return (
    <>
      <PageTitle title="The Council chamber" sub={`${ordinal(current.circuit)} circuit · ${current.choosers.length} of ${active.length} have hosted`} />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Stat
          label="Days since the last Council"
          value={daysSince ?? '–'}
          sub={latest?.date ? fmtDate(latest.date) : 'No dated evening yet'}
        />
        <Stat label="Scores still owed" value={totalOwed} sub={totalOwed ? `by ${plural(owing.length, 'wizard')}` : 'All square'} />
      </div>

      {(hasNext || upcoming.length > 0) && (
        <Card title="Next Council">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {batonHolder && (
              <>
                <dt className="text-ink-2">Baton holder</dt>
                <dd><WizardLink name={batonHolder} /></dd>
              </>
            )}
            {nextDate && (
              <>
                <dt className="text-ink-2">Date</dt>
                <dd>{fmtDate(nextDate)}</dd>
              </>
            )}
            {nextRestaurant && (
              <>
                <dt className="text-ink-2">Restaurant</dt>
                <dd>{nextRestaurant}</dd>
              </>
            )}
            {!hasNext &&
              upcoming.map((e) => (
                <div key={e.id} className="col-span-2">
                  {fmtDate(e.date)}: {e.restaurant}, chosen by {data.name(e.chooser)}
                </div>
              ))}
          </dl>
        </Card>
      )}

      <Card title="Who has hosted" aside={<CircuitLink n={current.circuit} />}>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {active.map((w) => {
            const hosted = current.eveningIds.map((id) => data.evening(id)!).filter((e) => e.chooser === w.sheetName);
            const done = hosted.length > 0;
            const baton = !done && batonHolder === w.sheetName;
            return (
              <li key={w.sheetName} className={`rounded-lg border px-3 py-2 ${done ? 'border-transparent bg-raised' : baton ? 'border-[var(--gold)]' : 'border-dashed border-line'}`}>
                <div className="flex items-center justify-between gap-2">
                  <WizardLink name={w.sheetName} className="font-semibold underline-offset-2 hover:underline" />
                  {done ? (
                    <span className="text-sm font-semibold text-gold" aria-label="Has hosted">✓</span>
                  ) : (
                    <span className="text-xs text-muted">{baton ? 'Baton' : 'Due'}</span>
                  )}
                </div>
                {hosted.map((e) => (
                  <div key={e.id} className="mt-0.5 text-xs text-ink-2">
                    <EveningLink e={e} className="underline underline-offset-2" /> <span className="num font-semibold text-ink">{fmt(e.average)}</span>
                  </div>
                ))}
                {!done && <div className="mt-0.5 text-xs text-muted">{baton ? 'Choosing next' : 'Yet to choose'}</div>}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={`${ordinal(current.circuit)} circuit standings`} aside={current.provisional ? <Provisional /> : <Badge tone="gold">Final</Badge>}>
        {board.length ? <RankList evenings={board} showCircuit={false} rank={(e) => e.rank.circuit} /> : <p className="text-sm text-muted">No evenings yet.</p>}
        {current.provisional && <p className="mt-2 text-xs text-muted">Provisional while {whyProvisional(current)}.</p>}
      </Card>

      {showPrevious && previous && (
        <Card
          title={previous.provisional ? `${ordinal(previous.circuit)} circuit, still open` : `${ordinal(previous.circuit)} circuit winner`}
          aside={previous.provisional ? <Provisional /> : previous.official ? <Badge tone="gold">Official</Badge> : undefined}
        >
          {previous.winner ? (
            <p className="text-sm">
              <span className="text-ink-2">{previous.provisional ? 'Leading: ' : ''}</span>
              <WizardLink name={previous.winner.wizard} />
              {previousWinner && (
                <>
                  {' '}with <EveningLink e={previousWinner} /> on <span className="num font-semibold">{fmt(previous.winner.average)}</span>
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted">No scores yet.</p>
          )}
          {previous.provisional && (
            <p className="mt-1 text-xs text-muted">
              Provisional while {whyProvisional(previous)}
              {previous.due.length > 0 && ` (${list(previous.due.map(data.name))} still to host)`}.
            </p>
          )}
          <p className="mt-2 text-sm">
            <CircuitLink n={previous.circuit} />
          </p>
        </Card>
      )}

      {latest && (
        <Card title="Latest evening" aside={fmtDate(latest.date)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold leading-snug">
                <EveningLink e={latest} />
              </div>
              <div className="mt-0.5 text-sm text-ink-2">
                Chosen by <WizardLink name={latest.chooser} /> · <CircuitLink n={latest.circuit} />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-3xl font-semibold leading-none">{fmt(latest.average)}</div>
              <div className="mt-1 text-xs text-muted">from {plural(latest.nScores, 'score')}</div>
            </div>
          </div>
          {latest.owed.length > 0 && (
            <p className="mt-3 text-sm">
              <Badge tone="amber">Scores owed</Badge> <span className="text-ink-2">{list(latest.owed.map(data.name))}</span>
            </p>
          )}
        </Card>
      )}

      {owing.length > 0 && (
        <Card title="Scores still owed">
          <ul className="flex flex-wrap gap-2 text-sm">
            {owing.map((w) => (
              <li key={w.sheetName} className="rounded-full bg-raised px-3 py-1">
                <WizardLink name={w.sheetName} className="underline underline-offset-2" /> <span className="num font-semibold">{w.owed.length}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Evenings attended with a score yet to give. Each wizard's page lists which. <Link to="/wizards" className="link">All wizards</Link>
          </p>
        </Card>
      )}
    </>
  );
}
