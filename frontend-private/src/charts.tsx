import { useEffect, useRef, useState, type ReactNode } from 'react';

// Small SVG charts for the tracker and repository pages: thin marks, hairline
// grid, a legend for two or more series, and a hover/focus tooltip. Colors
// come from the --series-* and --chart-* tokens in portal.css (validated for
// both themes); text always uses the text tokens.

const PAD = { top: 12, right: 12, bottom: 26, left: 40 };

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** About `count` round tick values covering 0..max. */
function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

export const formatNumber = (n: number) =>
  Math.abs(n) >= 10_000 ? `${(n / 1000).toFixed(Math.abs(n) >= 100_000 ? 0 : 1)}k` : n.toLocaleString();

function Legend({ items }: { items: { label: string; color: string; shape: 'line' | 'rect' }[] }) {
  if (items.length < 2) return null;
  return (
    <div className="chart-legend">
      {items.map((it) => (
        <span key={it.label}>
          <span className={`chart-key ${it.shape}`} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, flip, children }: { x: number; flip: boolean; children: ReactNode }) {
  return (
    <div className="chart-tooltip" style={flip ? { right: `calc(100% - ${x - 8}px)` } : { left: x + 8 }} role="status">
      {children}
    </div>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  /** A CSS color, normally var(--series-n). */
  color: string;
  /** A reference line (target) drawn quieter. */
  reference?: boolean;
}

interface LineChartProps {
  points: { label: string; values: Record<string, number> }[];
  series: LineSeries[];
  height?: number;
  /** Fill under the first series with a light wash. */
  area?: boolean;
  ariaLabel: string;
}

/** Lines over an ordinal x axis, with a crosshair that snaps to the nearest point. */
export function LineChart({ points, series, height = 220, area = false, ariaLabel }: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const max = Math.max(1, ...points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0)));
  const yTicks = ticks(max);
  const yMax = yTicks[yTicks.length - 1];
  const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 70))));

  const nearest = (clientX: number, rect: DOMRect) => {
    if (points.length === 0) return null;
    const px = clientX - rect.left - PAD.left;
    return Math.max(0, Math.min(points.length - 1, Math.round(points.length <= 1 ? 0 : (px / innerW) * (points.length - 1))));
  };

  return (
    <div className="chart" ref={ref}>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color, shape: 'line' }))} />
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onPointerMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
            if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? points.length) - 1));
          }}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <text key={i} className="chart-tick" x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
                {p.label}
              </text>
            ) : null,
          )}
          {area && series[0] && points.length > 1 && (
            <path
              d={`M${x(0)},${y(0)} ${points.map((p, i) => `L${x(i)},${y(p.values[series[0].key] ?? 0)}`).join(' ')} L${x(points.length - 1)},${y(0)} Z`}
              fill={series[0].color}
              opacity={0.1}
            />
          )}
          {series.map((s) => (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={s.reference ? 1.5 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={s.reference ? 0.7 : 1}
              points={points.map((p, i) => `${x(i)},${y(p.values[s.key] ?? 0)}`).join(' ')}
            />
          ))}
          {points.length > 0 &&
            series
              .filter((s) => !s.reference)
              .map((s) => (
                <circle key={s.key} className="chart-dot" cx={x(points.length - 1)} cy={y(points[points.length - 1].values[s.key] ?? 0)} r={4} fill={s.color} />
              ))}
          {hover !== null && (
            <g>
              <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} />
              {series.map((s) => (
                <circle key={s.key} className="chart-dot" cx={x(hover)} cy={y(points[hover].values[s.key] ?? 0)} r={4} fill={s.color} />
              ))}
            </g>
          )}
        </svg>
      )}
      {hover !== null && points[hover] && (
        <Tooltip x={x(hover)} flip={x(hover) > width * 0.6}>
          <div className="chart-tooltip-title">{points[hover].label}</div>
          {series.map((s) => (
            <div key={s.key} className="chart-tooltip-row">
              <span className="chart-key line" style={{ background: s.color }} />
              <strong>{formatNumber(points[hover].values[s.key] ?? 0)}</strong>
              <span className="muted">{s.label}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

interface DivergingBarsProps {
  bars: { label: string; up: number; down: number }[];
  upLabel: string;
  downLabel: string;
  height?: number;
  ariaLabel: string;
}

/** Columns above (up) and below (down) a shared baseline, e.g. lines added vs removed. */
export function DivergingBars({ bars, upLabel, downLabel, height = 220, ariaLabel }: DivergingBarsProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const maxUp = Math.max(1, ...bars.map((b) => b.up));
  const maxDown = Math.max(0, ...bars.map((b) => b.down));
  const total = maxUp + maxDown || 1;
  const zero = PAD.top + (maxUp / total) * innerH;
  const scale = innerH / total;
  const slot = bars.length ? innerW / bars.length : innerW;
  const barW = Math.max(1, Math.min(24, slot - 2));
  const r = Math.min(4, barW / 2);
  const labelEvery = Math.max(1, Math.ceil(bars.length / Math.max(1, Math.floor(innerW / 70))));

  // A column with its data end rounded and its baseline end square.
  const column = (cx: number, h: number, upward: boolean) => {
    const left = cx - barW / 2;
    const rr = Math.min(r, h);
    if (h <= 0) return '';
    return upward
      ? `M${left},${zero - 1} V${zero - h + rr} Q${left},${zero - h} ${left + rr},${zero - h} H${left + barW - rr} Q${left + barW},${zero - h} ${left + barW},${zero - h + rr} V${zero - 1} Z`
      : `M${left},${zero + 1} V${zero + h - rr} Q${left},${zero + h} ${left + rr},${zero + h} H${left + barW - rr} Q${left + barW},${zero + h} ${left + barW},${zero + h - rr} V${zero + 1} Z`;
  };

  return (
    <div className="chart" ref={ref}>
      <Legend
        items={[
          { label: upLabel, color: 'var(--series-1)', shape: 'rect' },
          { label: downLabel, color: 'var(--series-2)', shape: 'rect' },
        ]}
      />
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
          <line className="chart-axis" x1={PAD.left} x2={width - PAD.right} y1={zero} y2={zero} />
          <text className="chart-tick" x={PAD.left - 6} y={PAD.top} dy="0.32em" textAnchor="end">
            +{formatNumber(maxUp)}
          </text>
          {maxDown > 0 && (
            <text className="chart-tick" x={PAD.left - 6} y={PAD.top + innerH} dy="0.32em" textAnchor="end">
              −{formatNumber(maxDown)}
            </text>
          )}
          {bars.map((b, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            return (
              <g
                key={i}
                className={hover === i ? 'chart-bar hover' : 'chart-bar'}
                tabIndex={0}
                aria-label={`${b.label}: +${b.up} / −${b.down}`}
                onPointerEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                {/* Hit area: the whole slot, not just the painted column. */}
                <rect x={cx - slot / 2} y={PAD.top} width={slot} height={innerH} fill="transparent" />
                <path d={column(cx, b.up * scale, true)} fill="var(--series-1)" />
                <path d={column(cx, b.down * scale, false)} fill="var(--series-2)" />
                {(i % labelEvery === 0 || i === bars.length - 1) && (
                  <text className="chart-tick" x={cx} y={height - 8} textAnchor="middle">
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && bars[hover] && (
        <Tooltip x={PAD.left + slot * hover + slot / 2} flip={PAD.left + slot * hover > width * 0.6}>
          <div className="chart-tooltip-title">{bars[hover].label}</div>
          <div className="chart-tooltip-row">
            <span className="chart-key line" style={{ background: 'var(--series-1)' }} />
            <strong>+{bars[hover].up.toLocaleString()}</strong>
            <span className="muted">{upLabel}</span>
          </div>
          <div className="chart-tooltip-row">
            <span className="chart-key line" style={{ background: 'var(--series-2)' }} />
            <strong>−{bars[hover].down.toLocaleString()}</strong>
            <span className="muted">{downLabel}</span>
          </div>
        </Tooltip>
      )}
    </div>
  );
}

/** Week-start unix seconds -> "Oct 20". */
export const weekLabel = (week: number) => new Date(week * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
