import { useRef, useState } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import type { Scan, StrategyGroup } from '../domain/types';
import { useTooltip } from './ui';

/* Attack success rate by category: one series, status-colored against the category limit */
export function AsrBars({ rows, limit, scaleMax }: { rows: { name: string; value: number }[]; limit: number; scaleMax?: number }) {
  const tip = useTooltip();
  const max = scaleMax ?? Math.max(limit * 2, ...rows.map((r) => r.value)) * 1.05;
  return (
    <div className="barlist" role="list">
      {rows.map((r) => {
        const over = r.value > limit;
        return (
          <div className="barrow" key={r.name} role="listitem">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {over ? <CircleX size={14} color="var(--bad)" aria-label="Over limit" /> : <CircleCheck size={14} color="var(--good)" aria-label="Within limit" />}
              {r.name}
            </div>
            <div className="bartrack">
              <div className="barfill" style={{ width: `${Math.min(100, (r.value / max) * 100)}%`, background: over ? 'var(--bad)' : 'var(--good)' }} />
              <div className="barlimit" style={{ left: `${(limit / max) * 100}%` }} />
              <div className="bar-hit" onMouseEnter={(e) => tip.show(e, <><b>{r.name}</b><br />{r.value.toFixed(1)}% attack success <span className="tt-muted">· limit {limit}%</span></>)} onMouseLeave={tip.hide} />
            </div>
            <div className="mono" style={{ textAlign: 'right', fontWeight: 600, color: over ? 'var(--bad-text)' : 'var(--text)' }}>{r.value.toFixed(1)}%</div>
          </div>
        );
      })}
      <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 2, height: 12, background: 'var(--text)', display: 'inline-block' }} /> Category limit {limit}% · scale 0 to {max.toFixed(0)}%
      </div>
    </div>
  );
}

/* Heat map: sequential orange ramp, value printed in every cell */
export const heatLevel = (v: number) => (v === 0 ? 0 : v <= 2 ? 1 : v <= 5 ? 2 : v <= 10 ? 3 : 4);
const HEAT = [
  { bg: 'var(--heat-0)', fg: 'var(--heat-ink-0)' }, { bg: 'var(--heat-1)', fg: 'var(--heat-ink-1)' }, { bg: 'var(--heat-2)', fg: 'var(--heat-ink-2)' },
  { bg: 'var(--heat-3)', fg: 'var(--heat-ink-3)' }, { bg: 'var(--heat-4)', fg: 'var(--heat-ink-3)' },
];

export function HeatLegend() {
  const items = ['0%', 'up to 2%', '2 to 5%', '5 to 10%', 'over 10%'];
  return (
    <div className="legend" aria-label="Heat map legend">
      {items.map((l, i) => <span key={l}><span className="sw" style={{ background: HEAT[i].bg }} />{l}</span>)}
    </div>
  );
}

export function Heatmap({ scan, limit }: { scan: Scan; limit: number }) {
  const tip = useTooltip();
  const strategies = scan.strategies;
  const all: StrategyGroup[] = ['Baseline', 'Encoding', 'Jailbreak', 'Indirect', 'Multi-turn'];
  return (
    <div className="table-wrap">
      <table className="heat">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Category</th>
            {all.map((s) => <th key={s}>{s}</th>)}
            <th>Overall</th>
          </tr>
        </thead>
        <tbody>
          {scan.heat.map((h) => (
            <tr key={h.category}>
              <th scope="row" className="row">{h.category}</th>
              {all.map((s) => {
                const v = h.cells[s];
                if (!strategies.includes(s) || v === undefined) return <td key={s} className="cell na">—</td>;
                const c = HEAT[heatLevel(v)];
                return (
                  <td key={s} className="cell" style={{ background: c.bg, color: c.fg }}
                    onMouseEnter={(e) => tip.show(e, <><b>{h.category}</b> × <b>{s}</b><br />{v.toFixed(1)}% of attempts succeeded</>)} onMouseLeave={tip.hide}>
                    {v.toFixed(1)}%
                  </td>
                );
              })}
              <td className="total" style={{ color: h.overall > limit ? 'var(--bad-text)' : 'var(--text)' }}>
                {h.overall > limit && <CircleX size={13} style={{ verticalAlign: -2, marginRight: 4 }} aria-label="Over limit" />}
                {h.overall.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Single-series trend line with crosshair + tooltip, optional limit reference line */
export function TrendChart({ points, limit, height = 260, unit = '%', label }: { points: { x: string; y: number; sub?: string }[]; limit?: number; height?: number; unit?: string; label: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 40, R = 16, T = 14, B = 28;
  const maxY = Math.max(...points.map((p) => p.y), limit ?? 0) * 1.2 || 1;
  const x = (i: number) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / maxY);
  const ticks = [0, maxY / 2, maxY].map((v) => Math.round(v * 10) / 10);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.y)}`).join(' ');
  const area = `${path} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setHover(best);
  };
  const hp = hover !== null ? points[hover] : null;

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="trendfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--chart-line)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--chart-line)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)">{t}{unit}</text>
          </g>
        ))}
        {limit !== undefined && (
          <g>
            <line x1={L} x2={W - R} y1={y(limit)} y2={y(limit)} stroke="var(--bad)" strokeDasharray="5 4" strokeWidth="1.5" />
            <text x={L + 6} y={y(limit) - 6} fontSize="11" fill="var(--bad-text)">limit {limit}{unit}</text>
          </g>
        )}
        <path d={area} fill="url(#trendfill)" />
        <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.x}>
            <circle cx={x(i)} cy={y(p.y)} r={hover === i ? 5.5 : 4} fill="var(--surface)" stroke="var(--chart-line)" strokeWidth="2" />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-3)">{p.x}</text>
          </g>
        ))}
        {/* direct label on the latest value */}
        <text x={x(points.length - 1)} y={y(points[points.length - 1].y) - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)">
          {points[points.length - 1].y}{unit}
        </text>
        {hp && <line x1={x(hover!)} x2={x(hover!)} y1={T} y2={H - B} stroke="var(--text-3)" strokeDasharray="3 3" />}
      </svg>
      {hp && (
        <div className="tooltip" style={{ position: 'absolute', left: `${(x(hover!) / W) * 100}%`, top: `${(y(hp.y) / H) * 100}%` }}>
          <b>{hp.x}</b> · {hp.y}{unit}{hp.sub && <><br /><span className="tt-muted">{hp.sub}</span></>}
        </div>
      )}
    </div>
  );
}

/* Small horizontal bars for discrete counts (e.g. findings by severity) */
export function CountBars({ rows }: { rows: { name: string; value: number; color: string; note?: string }[] }) {
  const tip = useTooltip();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="barlist">
      {rows.map((r) => (
        <div key={r.name} className="barrow" style={{ gridTemplateColumns: '90px minmax(0,1fr) 36px' }}>
          <span>{r.name}</span>
          <div className="bartrack" style={{ height: 14 }} onMouseEnter={(e) => tip.show(e, <><b>{r.name}</b>: {r.value}{r.note && <><br /><span className="tt-muted">{r.note}</span></>}</>)} onMouseLeave={tip.hide}>
            <div className="barfill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </div>
          <span className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
