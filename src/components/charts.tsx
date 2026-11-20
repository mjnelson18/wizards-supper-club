// Small hand-drawn SVG charts. One measure per chart, thin marks, hairline
// grid, a tooltip on hover or tap, and a table twin for every chart so no value
// is reachable by hover alone.

import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import type { FiveNumber } from '../lib/types.ts';

const M = { top: 12, right: 8, bottom: 24, left: 28 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const scale = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

/** A column with a rounded data end and a square baseline. */
function column(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  const w = Math.min(190, width);
  const left = Math.max(0, Math.min(width - w, tip.x - w / 2));
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs shadow-lg"
      style={{ left, top: Math.max(0, tip.y - 8), width: w, transform: 'translateY(-100%)' }}
    >
      <div className="font-semibold text-ink">{tip.title}</div>
      {tip.lines.map((l) => (
        <div key={l} className="text-ink-2">
          {l}
        </div>
      ))}
    </div>
  );
}

function Axis({ ticks, y, width, format }: { ticks: number[]; y: (v: number) => number; width: number; format: (v: number) => string }) {
  return (
    <g aria-hidden="true">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
          <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Hover with a mouse, tap or drag on touch; the nearest band wins. */
function useBandHover(count: number, width: number) {
  const [index, setIndex] = useState<number | null>(null);
  const band = (width - M.left - M.right) / Math.max(1, count);
  const locate = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - M.left) / band);
    setIndex(Math.max(0, Math.min(count - 1, i)));
  };
  const handlers = {
    onPointerMove: locate,
    onPointerDown: locate,
    onPointerLeave: (e: PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === 'mouse') setIndex(null);
    },
  };
  return { index, band, handlers, clear: () => setIndex(null) };
}

/** The table twin of a chart. */
export function TableView({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="inline-block rounded py-1 text-xs text-ink-2 underline underline-offset-2">Show as a table</summary>
      <div className="mt-2 max-h-80 overflow-y-auto">
        <table className="tbl">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} scope="col" className={i > 0 ? 'r' : ''}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td key={i} className={i > 0 ? 'r' : ''}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function Legend({ items }: { items: { label: string; kind: 'dot' | 'line' | 'bar'; color: string }[] }) {
  return (
    <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <svg width="14" height="10" aria-hidden="true">
            {it.kind === 'dot' && <circle cx="7" cy="5" r="4" fill={it.color} />}
            {it.kind === 'line' && <line x1="0" x2="14" y1="5" y2="5" stroke={it.color} strokeWidth="2" strokeLinecap="round" />}
            {it.kind === 'bar' && <rect x="3" y="0" width="8" height="10" rx="2" fill={it.color} />}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}

// ---------- One mark per evening, across the whole history ----------

export interface SeqPoint {
  circuit: number;
  value: number | null;
  title: string;
  lines: string[];
}

/**
 * Every evening in order along the bottom, grouped by circuit. Neighbouring
 * circuits alternate between two colours and each carries its number, so a
 * circuit is never identified by colour alone.
 */
export function SequenceChart({
  points,
  mark,
  domain,
  ticks,
  format,
  steps,
  label,
  height = 220,
}: {
  points: SeqPoint[];
  mark: 'dot' | 'bar';
  domain: [number, number];
  ticks: number[];
  format: (v: number) => string;
  /** A level drawn across each circuit's span (e.g. the circuit average). */
  steps?: Map<number, number | null>;
  label: string;
  height?: number;
}) {
  const [ref, width] = useWidth();
  const { index, band, handlers, clear } = useBandHover(points.length, width);
  const y = scale(domain[0], domain[1], height - M.bottom, M.top);
  const cx = (i: number) => M.left + (i + 0.5) * band;

  const circuits: { circuit: number; from: number; to: number }[] = [];
  points.forEach((p, i) => {
    const last = circuits[circuits.length - 1];
    if (last && last.circuit === p.circuit) last.to = i;
    else circuits.push({ circuit: p.circuit, from: i, to: i });
  });
  const color = (circuit: number) => (circuits.findIndex((c) => c.circuit === circuit) % 2 === 0 ? 'var(--series-1)' : 'var(--series-2)');

  const hovered = index !== null ? points[index] : null;
  const tip: Tip | null =
    hovered && index !== null
      ? { x: cx(index), y: hovered.value !== null ? y(hovered.value) : height / 2, title: hovered.title, lines: hovered.lines }
      : null;
  const barW = Math.max(1, Math.min(24, band - 2));

  return (
    <div ref={ref} className="relative" onBlur={clear}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block touch-pan-y select-none" {...handlers}>
          <Axis ticks={ticks} y={y} width={width} format={format} />
          <g aria-hidden="true">
            {circuits.map((c, i) => (
              <g key={c.circuit}>
                {i > 0 && <line x1={M.left + c.from * band} x2={M.left + c.from * band} y1={M.top} y2={height - M.bottom + 4} stroke="var(--axis)" strokeWidth="1" />}
                <text x={M.left + ((c.from + c.to + 1) / 2) * band} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                  {c.circuit}
                </text>
              </g>
            ))}
            <line x1={M.left} x2={width - M.right} y1={height - M.bottom} y2={height - M.bottom} stroke="var(--axis)" strokeWidth="1" />
            {index !== null && <line x1={cx(index)} x2={cx(index)} y1={M.top} y2={height - M.bottom} stroke="var(--muted)" strokeWidth="1" />}
            {points.map((p, i) => {
              if (p.value === null) return null;
              if (mark === 'bar') {
                const top = y(p.value);
                return <path key={i} d={column(cx(i) - barW / 2, top, barW, height - M.bottom - top)} fill={color(p.circuit)} opacity={index === null || index === i ? 1 : 0.55} />;
              }
              return <circle key={i} cx={cx(i)} cy={y(p.value)} r={index === i ? 6 : 4} fill={color(p.circuit)} stroke="var(--surface)" strokeWidth="2" />;
            })}
            {steps &&
              circuits.map((c) => {
                const v = steps.get(c.circuit);
                if (v === null || v === undefined) return null;
                return <line key={c.circuit} x1={M.left + c.from * band + 1} x2={M.left + (c.to + 1) * band - 1} y1={y(v)} y2={y(v)} stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />;
              })}
          </g>
        </svg>
      )}
      {tip && <Tooltip tip={tip} width={width} />}
    </div>
  );
}

// ---------- Spread per group ----------

export function BoxPlot({
  groups,
  domain,
  ticks,
  label,
  height = 220,
}: {
  groups: { name: string; box: FiveNumber | null; n: number }[];
  domain: [number, number];
  ticks: number[];
  label: string;
  height?: number;
}) {
  const [ref, width] = useWidth();
  const { index, band, handlers, clear } = useBandHover(groups.length, width);
  const y = scale(domain[0], domain[1], height - M.bottom, M.top);
  const cx = (i: number) => M.left + (i + 0.5) * band;
  const boxW = Math.max(6, Math.min(24, band - 8));
  const g = index !== null ? groups[index] : null;
  const tip: Tip | null =
    g && index !== null
      ? {
          x: cx(index),
          y: g.box ? y(g.box.max) : height / 2,
          title: g.name,
          lines: g.box
            ? [`Middle score ${g.box.median.toFixed(2)}`, `Half of scores ${g.box.q1.toFixed(2)} to ${g.box.q3.toFixed(2)}`, `Range ${g.box.min} to ${g.box.max}`, `${g.n} scores`]
            : ['No scores'],
        }
      : null;

  return (
    <div ref={ref} className="relative" onBlur={clear}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block touch-pan-y select-none" {...handlers}>
          <Axis ticks={ticks} y={y} width={width} format={(v) => String(v)} />
          <g aria-hidden="true">
            <line x1={M.left} x2={width - M.right} y1={height - M.bottom} y2={height - M.bottom} stroke="var(--axis)" strokeWidth="1" />
            {groups.map((grp, i) => (
              <g key={grp.name} opacity={index === null || index === i ? 1 : 0.55}>
                {grp.box && (
                  <>
                    <line x1={cx(i)} x2={cx(i)} y1={y(grp.box.max)} y2={y(grp.box.min)} stroke="var(--series-1)" strokeWidth="2" strokeLinecap="round" />
                    <rect x={cx(i) - boxW / 2} y={y(grp.box.q3)} width={boxW} height={Math.max(2, y(grp.box.q1) - y(grp.box.q3))} rx="3" fill="var(--series-1)" />
                    <line x1={cx(i) - boxW / 2} x2={cx(i) + boxW / 2} y1={y(grp.box.median)} y2={y(grp.box.median)} stroke="var(--surface)" strokeWidth="2" />
                  </>
                )}
                <text x={cx(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                  {grp.name}
                </text>
              </g>
            ))}
          </g>
        </svg>
      )}
      {tip && <Tooltip tip={tip} width={width} />}
    </div>
  );
}

// ---------- Plain columns ----------

export function Columns({
  bars,
  max,
  ticks,
  format,
  label,
  height = 180,
}: {
  bars: { name: string; value: number | null; title: string; lines: string[] }[];
  max: number;
  ticks: number[];
  format: (v: number) => string;
  label: string;
  height?: number;
}) {
  const [ref, width] = useWidth();
  const { index, band, handlers, clear } = useBandHover(bars.length, width);
  const y = scale(0, max, height - M.bottom, M.top);
  const cx = (i: number) => M.left + (i + 0.5) * band;
  const barW = Math.max(2, Math.min(24, band - 2));
  const b = index !== null ? bars[index] : null;
  const tip: Tip | null = b && index !== null ? { x: cx(index), y: b.value !== null ? y(b.value) : height / 2, title: b.title, lines: b.lines } : null;

  return (
    <div ref={ref} className="relative" onBlur={clear}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block touch-pan-y select-none" {...handlers}>
          <Axis ticks={ticks} y={y} width={width} format={format} />
          <g aria-hidden="true">
            <line x1={M.left} x2={width - M.right} y1={height - M.bottom} y2={height - M.bottom} stroke="var(--axis)" strokeWidth="1" />
            {bars.map((bar, i) => (
              <g key={bar.name} opacity={index === null || index === i ? 1 : 0.55}>
                {bar.value !== null && bar.value > 0 && <path d={column(cx(i) - barW / 2, y(bar.value), barW, height - M.bottom - y(bar.value))} fill="var(--series-1)" />}
                <text x={cx(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                  {bar.name}
                </text>
              </g>
            ))}
          </g>
        </svg>
      )}
      {tip && <Tooltip tip={tip} width={width} />}
    </div>
  );
}
