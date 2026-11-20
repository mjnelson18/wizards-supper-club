import { BoxPlot, Columns, Legend, SequenceChart, TableView } from '../components/charts.tsx';
import { Card, EveningLink, PageTitle, Stat, StatGrid, WizardLink } from '../components/ui.tsx';
import { useData } from '../data.tsx';
import { fmt, fmtDate, ordinal, pct, plural, signed } from '../lib/format.ts';

/** Five harshness classes around zero. */
const divClass = (index: number) => (index <= -0.75 ? 0 : index <= -0.25 ? 1 : index < 0.25 ? 2 : index < 0.75 ? 3 : 4);

export function Trends() {
  const data = useData();
  const { stats } = data;
  const evenings = stats.evenings;
  const scored = evenings.filter((e) => e.average !== null);
  const lowest = scored.length ? Math.min(...scored.map((e) => e.average as number)) : 0;
  const floor = Math.max(0, Math.floor(lowest) - 1);
  const maxAttended = Math.max(1, ...evenings.map((e) => e.attended));
  const maxSlot = Math.max(1, ...stats.hostingOrder.slots.map((s) => s.mean));
  const { firstHalfMean, secondHalfMean } = stats.hostingOrder;
  const halfGap = firstHalfMean !== null && secondHalfMean !== null ? secondHalfMean - firstHalfMean : null;

  return (
    <>
      <PageTitle title="Trends" sub="The whole history in order, circuit by circuit. Tap or hover a chart for the detail." />

      <Card title="Evening averages">
        <Legend
          items={[
            { label: 'Evening average (colours alternate by circuit)', kind: 'dot', color: 'var(--series-1)' },
            { label: 'Circuit average', kind: 'line', color: 'var(--ink)' },
          ]}
        />
        <SequenceChart
          label="Evening averages across every circuit, with each circuit's average"
          mark="dot"
          domain={[floor, 10]}
          ticks={Array.from({ length: 10 - floor + 1 }, (_, i) => floor + i).filter((t) => (10 - t) % 2 === 0)}
          format={(v) => String(v)}
          steps={new Map(stats.circuits.map((c) => [c.circuit, c.mean]))}
          points={evenings.map((e) => ({
            circuit: e.circuit,
            value: e.average,
            title: e.restaurant,
            lines: [`${fmt(e.average)} from ${plural(e.nScores, 'score')}`, `${data.name(e.chooser)} · ${ordinal(e.circuit)} circuit, no. ${e.number}`, ...(e.date ? [fmtDate(e.date)] : [])],
          }))}
        />
        <p className="mt-1 text-xs text-muted">Numbers along the bottom are circuits. Evenings sit in hosting order, not by date.</p>
        <TableView
          head={['Evening', 'Circuit', 'Average']}
          rows={evenings.map((e) => [<EveningLink key={e.id} e={e} />, ordinal(e.circuit), fmt(e.average)])}
        />
      </Card>

      <Card title="Score inflation" aside="Spread of individual scores per circuit">
        <BoxPlot
          label="Spread of individual scores in each circuit"
          domain={[0, 10]}
          ticks={[0, 2, 4, 6, 8, 10]}
          groups={stats.circuits.map((c) => ({ name: String(c.circuit), box: c.box, n: c.nScores }))}
        />
        <p className="mt-1 text-xs text-muted">Each bar covers the middle half of the circuit's scores, the gap in it is the middle score, and the line runs from lowest to highest.</p>
        <TableView
          head={['Circuit', 'Average', 'Middle score', 'Lowest', 'Highest', 'Scores']}
          rows={stats.circuits.map((c) => [ordinal(c.circuit), fmt(c.mean), fmt(c.box?.median), c.box?.min ?? '–', c.box?.max ?? '–', c.nScores])}
        />
      </Card>

      <Card title="Attendance" aside="Wizards at each evening">
        <SequenceChart
          label="Number of wizards who attended each evening"
          mark="bar"
          height={180}
          domain={[0, maxAttended + 1]}
          ticks={Array.from({ length: Math.floor((maxAttended + 1) / 2) + 1 }, (_, i) => i * 2)}
          format={(v) => String(v)}
          points={evenings.map((e) => ({
            circuit: e.circuit,
            value: e.attended,
            title: e.restaurant,
            lines: [`${e.attended} attended, ${e.dna} did not${e.unk ? `, ${e.unk} unknown` : ''}`, `${ordinal(e.circuit)} circuit, no. ${e.number}`],
          }))}
        />
        <p className="mt-1 text-xs text-muted">Numbers along the bottom are circuits. Unknown attendance is left out, so early evenings may read low.</p>
        <TableView
          head={['Circuit', 'Attendance rate']}
          rows={stats.circuits.map((c) => [ordinal(c.circuit), pct(c.attendanceRate)])}
        />
      </Card>

      <Card title="Harshness by circuit" aside="Average given minus that circuit's average">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Harshness per wizard per circuit">
          <table className="border-separate border-spacing-0.5">
            <thead>
              <tr>
                <th scope="col" className="pr-1.5 text-left text-xs font-semibold text-muted">Wizard</th>
                {stats.circuits.map((c) => (
                  <th key={c.circuit} scope="col" className="text-center text-xs font-semibold text-muted">
                    <abbr title={`${ordinal(c.circuit)} circuit`} className="no-underline">{c.circuit}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.wizards.map((w) => (
                <tr key={w.sheetName}>
                  <th scope="row" className="pr-1.5 text-left text-sm font-normal">
                    <WizardLink name={w.sheetName} className="whitespace-nowrap underline underline-offset-2" />
                  </th>
                  {stats.circuits.map((c) => {
                    const pc = w.perCircuit.find((p) => p.circuit === c.circuit);
                    if (!pc || pc.index === null) {
                      return (
                        <td key={c.circuit} className="p-0">
                          <span className="flex h-8 w-[2.1rem] items-center justify-center text-xs text-muted" aria-label="No scores">·</span>
                        </td>
                      );
                    }
                    const k = divClass(pc.index);
                    return (
                      <td key={c.circuit} className="p-0">
                        <span className="num flex h-8 w-[2.1rem] items-center justify-center rounded text-[11px] font-semibold" style={{ background: `var(--div-${k})`, color: `var(--div-ink-${k})` }} title={`${plural(pc.n, 'score')}, average ${fmt(pc.mean)}`}>
                          {signed(pc.index, 1)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
          <span>Harsher</span>
          <span className="flex" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((k) => (
              <span key={k} className="h-3 w-5" style={{ background: `var(--div-${k})` }} />
            ))}
          </span>
          <span>More generous</span>
          <span className="text-muted">(steps of half a point around zero)</span>
        </p>
      </Card>

      <Card title="Hosting order" aside="Does going early or late change the score?">
        <StatGrid>
          <Stat label="First half of a circuit" value={fmt(firstHalfMean)} sub="average evening" />
          <Stat label="Second half" value={fmt(secondHalfMean)} sub={halfGap === null ? undefined : `${signed(halfGap)} against the first half`} />
        </StatGrid>
        <h3 className="mb-1 mt-4 text-sm">Average evening score by position in the circuit</h3>
        <Columns
          label="Average evening score by hosting position within a circuit"
          max={Math.min(10, Math.ceil(maxSlot))}
          ticks={[0, 2, 4, 6, 8, 10].filter((t) => t <= Math.ceil(maxSlot))}
          format={(v) => String(v)}
          bars={stats.hostingOrder.slots.map((s) => ({
            name: String(s.position),
            value: s.mean,
            title: `${ordinal(s.position)} evening of a circuit`,
            lines: [`Average ${fmt(s.mean)}`, `across ${plural(s.n, 'evening')}`],
          }))}
        />
        <p className="mt-1 text-xs text-muted">Evenings with 3 or more scores only. The halves leave out the middle evening of an odd-length circuit and a circuit still under way.</p>
        <TableView head={['Position', 'Average', 'Evenings']} rows={stats.hostingOrder.slots.map((s) => [ordinal(s.position), fmt(s.mean), s.n])} />
      </Card>
    </>
  );
}
