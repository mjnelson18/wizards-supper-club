import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge, Card, CircuitLink, NotFound, PageTitle, RankList, ScoreBar, Select, Stat, StatGrid, WizardLink } from '../components/ui.tsx';
import { useData } from '../data.tsx';
import { fmt, fmtDate, fmtScore, list, ordinal, plural, signed } from '../lib/format.ts';
import { leaderboard } from '../lib/stats.ts';

export function Restaurants() {
  const data = useData();
  const { stats } = data;
  const [query, setQuery] = useState('');
  const [circuit, setCircuit] = useState('all');
  const [chooser, setChooser] = useState('all');
  const searchId = useId();

  const filtered = stats.evenings.filter(
    (e) => (circuit === 'all' || e.circuit === Number(circuit)) && (chooser === 'all' || e.chooser === chooser),
  );
  const q = query.trim().toLowerCase();
  const matches = q ? filtered.filter((e) => e.restaurant.toLowerCase().includes(q)) : [];
  const { qualified, unqualified } = leaderboard(filtered);
  const split = qualified.length > 20;
  const top = split ? qualified.slice(0, 10) : qualified;
  const bottom = split ? qualified.slice(-10).reverse() : [];
  const isFiltered = circuit !== 'all' || chooser !== 'all';

  return (
    <>
      <PageTitle title="Hall of fame" sub={`Every restaurant the Council has visited: ${stats.evenings.length} evenings, ${qualified.length} with enough scores to rank in this view.`} />

      <div className="mb-4 space-y-3">
        <div>
          <label htmlFor={searchId} className="mb-1 block text-xs text-ink-2">
            Search restaurants
          </label>
          <input id={searchId} type="search" className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Barrafina" autoComplete="off" />
        </div>
        <div className="flex gap-3">
          <Select
            label="Circuit"
            value={circuit}
            onChange={setCircuit}
            options={[{ value: 'all', label: 'All circuits' }, ...stats.circuits.map((c) => ({ value: String(c.circuit), label: ordinal(c.circuit) }))]}
          />
          <Select
            label="Chosen by"
            value={chooser}
            onChange={setChooser}
            options={[{ value: 'all', label: 'Anyone' }, ...stats.wizards.map((w) => ({ value: w.sheetName, label: w.displayName }))]}
          />
        </div>
      </div>

      {q ? (
        <Card title="Search results" aside={plural(matches.length, 'match', 'matches')}>
          <RankList evenings={[...matches].sort((a, b) => a.restaurant.localeCompare(b.restaurant))} rank={(e) => e.rank.allTime} />
        </Card>
      ) : (
        <>
          <Card title={split ? 'Top 10' : 'Ranked'} aside={isFiltered ? 'Rank within this filter' : 'All time'}>
            <RankList evenings={top} />
          </Card>
          {split && (
            <Card title="Bottom 10" aside="Lowest first">
              <RankList evenings={bottom} rank={(_, i) => qualified.length - i} />
            </Card>
          )}
          {unqualified.length > 0 && (
            <Card title="Not enough scores to rank" aside="Fewer than 3 scores">
              <RankList evenings={unqualified} />
            </Card>
          )}
        </>
      )}
    </>
  );
}

export function EveningDetail() {
  const data = useData();
  const { id } = useParams();
  const e = id ? data.evening(id) : undefined;
  if (!e) return <NotFound what="evening" />;

  const all = data.stats.evenings;
  const prev = all[e.seq - 1];
  const next = all[e.seq + 1];
  const scored = e.entries.filter((x) => x.score !== null).sort((a, b) => (b.score as number) - (a.score as number));
  const names = (status: string) => e.entries.filter((x) => x.status === status).map((x) => data.name(x.wizard));
  const average = names('Average');
  const dna = names('DNA');
  const unk = names('UNK');
  const hasImputed = scored.some((x) => x.status === 'Imputed');

  return (
    <>
      <PageTitle
        title={e.restaurant}
        sub={
          <>
            Chosen by <WizardLink name={e.chooser} /> · <CircuitLink n={e.circuit} />, evening {e.number} · {fmtDate(e.date)}
          </>
        }
      />

      <Card>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="text-xs text-ink-2">Evening average</div>
            <div className="text-5xl font-semibold leading-none">{fmt(e.average)}</div>
            <div className="mt-1 text-xs text-muted">from {plural(e.nScores, 'score')}</div>
          </div>
          <div className="text-right text-sm">
            {e.qualified ? (
              <>
                <div>
                  <span className="num font-semibold">{ordinal(e.rank.allTime as number)}</span> <span className="text-ink-2">of {e.rank.allTimeOf} all time</span>
                </div>
                <div>
                  <span className="num font-semibold">{ordinal(e.rank.circuit as number)}</span> <span className="text-ink-2">of {e.rank.circuitOf} in the circuit</span>
                </div>
              </>
            ) : (
              <Badge>Needs 3 scores to rank</Badge>
            )}
          </div>
        </div>
        <StatGrid>
          <Stat label="Gymnastic score" value={fmt(e.gymnastic)} sub={e.rank.circuitGymnastic ? `${ordinal(e.rank.circuitGymnastic)} in circuit` : 'Needs 3 scores'} />
          <Stat label="Absentee-adjusted" value={fmt(e.adjusted)} sub={e.rank.circuitAdjusted ? `${ordinal(e.rank.circuitAdjusted)} in circuit` : undefined} />
          <Stat label="Divisiveness" value={fmt(e.sd)} sub={e.sd === null ? 'Needs 3 scores' : 'Standard deviation'} />
        </StatGrid>
      </Card>

      <Card title="Scores" aside={`${e.attended} attended`}>
        {scored.length ? (
          <div>
            {scored.map((x) => (
              <ScoreBar
                key={x.wizard}
                label={<WizardLink name={x.wizard} className="underline underline-offset-2" />}
                value={x.score as number}
                note={`${fmtScore(x.score)}${x.status === 'Imputed' ? '*' : ''}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No scores yet.</p>
        )}
        {hasImputed && <p className="mt-2 text-xs text-muted">* Imputed: an average entered in place of a missing score.</p>}
        <dl className="mt-3 space-y-1 text-sm">
          {e.owed.length > 0 && (
            <div>
              <dt className="inline"><Badge tone="amber">Score owed</Badge> </dt>
              <dd className="inline text-ink-2">{list(e.owed.map(data.name))}</dd>
            </div>
          )}
          {average.length > 0 && (
            <div>
              <dt className="inline text-ink-2">Took the evening average: </dt>
              <dd className="inline">{list(average)}</dd>
            </div>
          )}
          {dna.length > 0 && (
            <div>
              <dt className="inline text-ink-2">Did not attend: </dt>
              <dd className="inline">{list(dna)}</dd>
            </div>
          )}
          {unk.length > 0 && (
            <div>
              <dt className="inline text-ink-2">Attendance unknown: </dt>
              <dd className="inline">{list(unk)}</dd>
            </div>
          )}
        </dl>
        {e.selfScore && (
          <p className="mt-3 text-sm text-ink-2">
            {data.name(e.chooser)} gave their own choice <span className="num font-semibold text-ink">{fmtScore(e.selfScore.own)}</span>; the others averaged{' '}
            <span className="num font-semibold text-ink">{fmt(e.selfScore.others)}</span> (self-score bias <span className="num font-semibold text-ink">{signed(e.selfScore.bias)}</span>).
          </p>
        )}
      </Card>

      <nav aria-label="Neighbouring evenings" className="mb-4 flex justify-between gap-4 text-sm">
        <span>{prev && <Link to={`/evenings/${prev.id}`} className="link">← {prev.restaurant}</Link>}</span>
        <span className="text-right">{next && <Link to={`/evenings/${next.id}`} className="link">{next.restaurant} →</Link>}</span>
      </nav>
    </>
  );
}
