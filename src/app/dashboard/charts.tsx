"use client";

/**
 * Dashboard charts: plain SVG, no chart library.
 * Follows the house data-viz rules: thin marks (2px lines, <=24px bars with a 4px rounded data end),
 * 2px surface gaps between stacked segments, hairline recessive grid, one y-axis,
 * legend for 2+ series, hover tooltips on every chart, and a table view on the page.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

// ---------- tokens ----------
const C = {
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  s1: "#2a78d6", // blue
  s2: "#eb6834", // orange
  s3: "#1baf7a", // aqua
  s4: "#eda100", // yellow
  s5: "#e87ba4", // magenta
  up: "#2a78d6", // diverging pole: increase
  down: "#e34948", // diverging pole: decrease
  neutral: "#898781",
};
const RAMP = [
  "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
  "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
];
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// ---------- formatting ----------
const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const fullUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const axisMoney = (cents: number) => (Math.abs(cents) < 1_000_000 ? fullUsd : compactUsd).format(cents / 100);
const money = (cents: number) => fullUsd.format(cents / 100);
const signedMoney = (cents: number) => (cents > 0 ? "+" : cents < 0 ? "−" : "") + money(Math.abs(cents));
const pct = (x: number) => `${Math.round(x * 100)}%`;

// ---------- scale helpers ----------
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}
function linearDomain(min: number, max: number, target = 4) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const step = niceStep((hi - lo || 100) / target);
  const top = Math.max(step, Math.ceil(hi / step) * step);
  const bottom = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) ticks.push(Math.round(v));
  return { top, bottom, ticks };
}
function labelEvery(n: number, innerWidth: number, minGap = 64) {
  const fit = Math.max(2, Math.floor(innerWidth / minGap));
  return Math.max(1, Math.ceil(n / fit));
}
/** Bar path with a 4px rounded data end on one side and a square base. */
function barPath(x: number, y0: number, y1: number, w: number, round: "top" | "bottom" | "none") {
  const top = Math.min(y0, y1);
  const h = Math.abs(y1 - y0);
  if (h <= 0) return "";
  const r = round === "none" ? 0 : Math.min(4, h, w / 2);
  if (round === "top") {
    return `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`;
  }
  if (round === "bottom") {
    return `M${x},${top}H${x + w}V${top + h - r}Q${x + w},${top + h} ${x + w - r},${top + h}H${x + r}Q${x},${top + h} ${x},${top + h - r}Z`;
  }
  return `M${x},${top}H${x + w}V${top + h}H${x}Z`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ---------- shared pieces ----------
function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const boxW = 200;
  const left = Math.min(Math.max(x + 12, 0), Math.max(0, width - boxW));
  return (
    <div className="viz-tip" style={{ left, top: Math.max(0, y - 12), width: boxW }} role="status">
      {children}
    </div>
  );
}

function TipRow({ color, label, value, dot }: { color?: string; label: string; value: string; dot?: boolean }) {
  return (
    <div className="viz-tip-row">
      <span className="viz-key">
        {color && <span className={dot ? "viz-dot" : "viz-swatch"} style={{ background: color }} />}
        {label}
      </span>
      <span className="viz-num">{value}</span>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dot?: boolean }[] }) {
  return (
    <div className="viz-legend">
      {items.map((i) => (
        <span key={i.label} className="viz-key">
          <span className={i.dot ? "viz-dot" : "viz-swatch"} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function YAxis({ ticks, y, width, left }: { ticks: number[]; y: (v: number) => number; width: number; left: number }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={left + width} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.axis : C.grid} strokeWidth={1} />
          <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={C.muted} className="viz-tabular">
            {axisMoney(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

// ---------- 1. MRR trend ----------
export interface TrendPoint {
  month: string;
  label: string;
  mrr: number;
  netNew: number;
}

export function MrrTrendChart({ data }: { data: TrendPoint[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const H = 240;
  const m = { t: 16, r: 76, b: 28, l: 64 };
  const iw = Math.max(0, w - m.l - m.r);
  const ih = H - m.t - m.b;
  const n = data.length;
  const { top, bottom, ticks } = linearDomain(0, Math.max(...data.map((d) => d.mrr)));
  const x = (i: number) => m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => m.t + ih - ((v - bottom) / (top - bottom)) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.mrr)}`).join("");
  const area = `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const every = labelEvery(n, iw);
  const last = data[n - 1];
  const h = hi === null ? null : data[hi];

  return (
    <div ref={ref} className="viz-root" style={{ height: H }}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`MRR trend, ending at ${money(last.mrr)}`} style={{ fontFamily: FONT }}>
          <YAxis ticks={ticks} y={y} width={iw} left={m.l} />
          {data.map((d, i) =>
            i % every === 0 || i === n - 1 ? (
              <text key={d.month} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill={C.muted}>
                {d.label}
              </text>
            ) : null,
          )}
          <path d={area} fill={C.s1} opacity={0.1} />
          <path d={line} fill="none" stroke={C.s1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(n - 1)} cy={y(last.mrr)} r={4} fill={C.s1} stroke={C.surface} strokeWidth={2} />
          <text x={x(n - 1) + 10} y={y(last.mrr)} dy="0.32em" fontSize={12} fontWeight={600} fill={C.ink}>
            {compactUsd.format(last.mrr / 100)}
          </text>
          {h && hi !== null && (
            <g pointerEvents="none">
              <line x1={x(hi)} x2={x(hi)} y1={m.t} y2={m.t + ih} stroke={C.axis} strokeWidth={1} />
              <circle cx={x(hi)} cy={y(h.mrr)} r={5} fill={C.s1} stroke={C.surface} strokeWidth={2} />
            </g>
          )}
          <rect
            x={m.l - 8}
            y={m.t}
            width={iw + 16}
            height={ih}
            fill="transparent"
            onPointerMove={(e) => {
              const px = e.clientX - e.currentTarget.getBoundingClientRect().left - 8;
              setHi(Math.max(0, Math.min(n - 1, Math.round(n === 1 ? 0 : (px / iw) * (n - 1)))));
            }}
            onPointerLeave={() => setHi(null)}
          />
        </svg>
      )}
      {h && hi !== null && (
        <Tooltip x={x(hi)} y={y(h.mrr)} width={w}>
          <div className="viz-tip-title">{h.label}</div>
          <TipRow color={C.s1} label="MRR" value={money(h.mrr)} />
          <TipRow label="Net new" value={signedMoney(h.netNew)} />
        </Tooltip>
      )}
    </div>
  );
}

// ---------- 2. MRR movements (stacked, diverging around zero) ----------
export interface MovementPoint {
  month: string;
  label: string;
  newMrr: number;
  expansion: number;
  reactivation: number;
  contraction: number; // positive magnitude
  churn: number; // positive magnitude
  netNew: number;
}

const MOVES = [
  { key: "newMrr", label: "New", color: C.s1, sign: 1 },
  { key: "expansion", label: "Expansion", color: C.s2, sign: 1 },
  { key: "reactivation", label: "Reactivation", color: C.s3, sign: 1 },
  { key: "contraction", label: "Contraction", color: C.s4, sign: -1 },
  { key: "churn", label: "Churn", color: C.s5, sign: -1 },
] as const;

const MOVEMENT_LEGEND = [
  ...MOVES.map((s) => ({ label: s.label, color: s.color })),
  { label: "Net new MRR", color: C.ink, dot: true },
];

export function MrrMovementsChart({ data }: { data: MovementPoint[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const H = 260;
  const m = { t: 16, r: 16, b: 28, l: 64 };
  const iw = Math.max(0, w - m.l - m.r);
  const ih = H - m.t - m.b;
  const n = data.length;
  const pos = (d: MovementPoint) => d.newMrr + d.expansion + d.reactivation;
  const neg = (d: MovementPoint) => d.contraction + d.churn;
  const { top, bottom, ticks } = linearDomain(
    Math.min(...data.map((d) => Math.min(-neg(d), d.netNew))),
    Math.max(...data.map((d) => Math.max(pos(d), d.netNew))),
  );
  const y = (v: number) => m.t + ih - ((v - bottom) / (top - bottom)) * ih;
  const band = iw / Math.max(1, n);
  const bw = Math.max(4, Math.min(24, band * 0.6));
  const cx = (i: number) => m.l + band * i + band / 2;
  const every = labelEvery(n, iw, 56);
  const GAP = 2;

  const columns = data.map((d, i) => {
    const segs: { d: string; color: string; key: string }[] = [];
    for (const sign of [1, -1] as const) {
      const series = MOVES.filter((s) => s.sign === sign && d[s.key] > 0);
      let cum = 0;
      series.forEach((s, j) => {
        const v = d[s.key];
        const start = cum === 0 ? y(0) : y(sign * cum) - sign * GAP;
        const end = y(sign * (cum + v));
        const outermost = j === series.length - 1;
        if ((sign === 1 && end < start) || (sign === -1 && end > start)) {
          segs.push({
            key: s.key,
            color: s.color,
            d: barPath(cx(i) - bw / 2, start, end, bw, outermost ? (sign === 1 ? "top" : "bottom") : "none"),
          });
        }
        cum += v;
      });
    }
    return segs;
  });
  const h = hi === null ? null : data[hi];

  return (
    <>
    <Legend items={MOVEMENT_LEGEND} />
    <div ref={ref} className="viz-root" style={{ height: H }}>
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label="Monthly MRR movements" style={{ fontFamily: FONT }}>
          <YAxis ticks={ticks} y={y} width={iw} left={m.l} />
          {hi !== null && <rect x={m.l + band * hi} y={m.t} width={band} height={ih} fill={C.ink} opacity={0.04} />}
          {columns.map((segs, i) => (
            <g key={data[i].month}>
              {segs.map((s) => (
                <path key={s.key} d={s.d} fill={s.color} />
              ))}
            </g>
          ))}
          {data.map((d, i) => (
            <circle key={d.month} cx={cx(i)} cy={y(d.netNew)} r={4} fill={C.ink} stroke={C.surface} strokeWidth={2} />
          ))}
          {data.map((d, i) =>
            i % every === 0 || i === n - 1 ? (
              <text key={d.month} x={cx(i)} y={H - 8} textAnchor="middle" fontSize={11} fill={C.muted}>
                {d.label}
              </text>
            ) : null,
          )}
          {data.map((d, i) => (
            <rect
              key={d.month}
              x={m.l + band * i}
              y={m.t}
              width={band}
              height={ih}
              fill="transparent"
              onPointerEnter={() => setHi(i)}
              onPointerLeave={() => setHi(null)}
            />
          ))}
        </svg>
      )}
      {h && hi !== null && (
        <Tooltip x={cx(hi)} y={m.t + 8} width={w}>
          <div className="viz-tip-title">{h.label}</div>
          {MOVES.map((s) => (
            <TipRow key={s.key} color={s.color} label={s.label} value={signedMoney(s.sign * h[s.key])} />
          ))}
          <div className="viz-tip-sep" />
          <TipRow color={C.ink} dot label="Net new MRR" value={signedMoney(h.netNew)} />
        </Tooltip>
      )}
    </div>
    </>
  );
}

// ---------- 3. Net new MRR bridge (waterfall) for one month ----------
export function NetNewBridge({ data }: { data: (MovementPoint & { beginning: number; ending: number })[] }) {
  const [idx, setIdx] = useState(data.length - 1);
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const d = data[idx];
  const steps = [
    { label: "New", v: d.newMrr },
    { label: "Expand", v: d.expansion },
    { label: "Reactivate", v: d.reactivation },
    { label: "Contract", v: -d.contraction },
    { label: "Churn", v: -d.churn },
  ];
  let run = 0;
  const bars = steps.map((s) => {
    const from = run;
    run += s.v;
    return { ...s, from, to: run, total: false };
  });
  bars.push({ label: "Net new", v: d.netNew, from: 0, to: d.netNew, total: true });

  const H = 240;
  const m = { t: 24, r: 8, b: 36, l: 8 };
  const iw = Math.max(0, w - m.l - m.r);
  const ih = H - m.t - m.b;
  const values = bars.flatMap((b) => [b.from, b.to]);
  const { top, bottom } = linearDomain(Math.min(...values), Math.max(...values));
  const y = (v: number) => m.t + ih - ((v - bottom) / (top - bottom)) * ih;
  const band = iw / bars.length;
  const bw = Math.min(24, band * 0.6);
  const cx = (i: number) => m.l + band * i + band / 2;
  const colorOf = (b: (typeof bars)[number]) => (b.total ? C.neutral : b.v >= 0 ? C.up : C.down);
  const hb = hi === null ? null : bars[hi];

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span className="small muted">
          {money(d.beginning)} → {money(d.ending)}
        </span>
        <select
          className="viz-select"
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          aria-label="Month for the MRR bridge"
        >
          {data.map((p, i) => (
            <option key={p.month} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div ref={ref} className="viz-root" style={{ height: H }}>
        {w > 0 && (
          <svg width={w} height={H} role="img" aria-label={`Net new MRR bridge for ${d.label}`} style={{ fontFamily: FONT }}>
            <line x1={m.l} x2={m.l + iw} y1={y(0)} y2={y(0)} stroke={C.axis} strokeWidth={1} />
            {bars.map((b, i) => {
              const color = colorOf(b);
              const up = b.to >= b.from;
              const labelY = up ? y(b.to) - 6 : y(b.to) + 14;
              return (
                <g key={b.label}>
                  {i < bars.length - 2 && (
                    <line x1={cx(i) + bw / 2} x2={cx(i + 1) - bw / 2} y1={y(b.to)} y2={y(b.to)} stroke={C.axis} strokeWidth={1} />
                  )}
                  {b.v !== 0 && <path d={barPath(cx(i) - bw / 2, y(b.from), y(b.to), bw, up ? "top" : "bottom")} fill={color} />}
                  <text x={cx(i)} y={b.v === 0 ? y(b.from) - 6 : labelY} textAnchor="middle" fontSize={11} fontWeight={b.total ? 600 : 400} fill={C.ink2} className="viz-tabular">
                    {b.v === 0 ? "—" : compactUsd.format(b.v / 100).replace(/^(?=\$)/, b.v > 0 && !b.total ? "+" : "")}
                  </text>
                  <text x={cx(i)} y={H - 14} textAnchor="middle" fontSize={band < 64 ? 10 : 11} fill={C.muted}>
                    {b.label}
                  </text>
                  <rect
                    x={m.l + band * i}
                    y={m.t}
                    width={band}
                    height={ih}
                    fill="transparent"
                    onPointerEnter={() => setHi(i)}
                    onPointerLeave={() => setHi(null)}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {hb && hi !== null && (
          <Tooltip x={cx(hi)} y={y(Math.max(hb.from, hb.to))} width={w}>
            <div className="viz-tip-title">
              {d.label} · {hb.label}
            </div>
            <TipRow color={colorOf(hb)} label={hb.total ? "Net new MRR" : hb.label} value={signedMoney(hb.v)} />
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ---------- 4. Cohort retention heatmap ----------
export interface CohortView {
  cohort: string;
  label: string;
  customers: number;
  startingMrr: number;
  revenue: number[];
  logos: number[];
}

// Ramp spans 40%..120%: early-stage retention differences live in the 60-110% band.
const MIN_RETENTION = 0.4;
const MAX_RETENTION = 1.2;

function rampIndex(v: number) {
  const t = (Math.min(Math.max(v, MIN_RETENTION), MAX_RETENTION) - MIN_RETENTION) / (MAX_RETENTION - MIN_RETENTION);
  return Math.round(t * (RAMP.length - 1));
}

export function CohortHeatmap({ cohorts }: { cohorts: CohortView[] }) {
  const [mode, setMode] = useState<"revenue" | "logos">("revenue");
  const [hover, setHover] = useState<{ r: number; k: number } | null>(null);
  const maxAge = Math.max(...cohorts.map((c) => c.revenue.length));
  const hc = hover ? cohorts[hover.r] : null;
  const hv = hc && hover ? hc[mode][hover.k] : null;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="viz-seg" role="group" aria-label="Retention measure">
          <button type="button" aria-pressed={mode === "revenue"} onClick={() => setMode("revenue")}>
            Revenue
          </button>
          <button type="button" aria-pressed={mode === "logos"} onClick={() => setMode("logos")}>
            Customers
          </button>
        </div>
        <div className="viz-scale small muted">
          ≤40%
          <span className="viz-scale-bar" style={{ background: `linear-gradient(90deg, ${RAMP.join(",")})` }} />
          120%+
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 0, minHeight: 18 }}>
        {hc && hover && hv !== null && hv !== undefined
          ? `${hc.label} cohort, month ${hover.k}: ${pct(hv)} ${mode === "revenue" ? `of starting MRR (${money(Math.round(hv * hc.startingMrr))})` : `of ${hc.customers} customers still paying`}`
          : "Hover a cell for details. Month 0 is each cohort's first paying month."}
      </p>
      <div className="scroll">
        <table className="heat">
          <thead>
            <tr>
              <th>Cohort</th>
              <th>Customers</th>
              <th>Start MRR</th>
              {Array.from({ length: maxAge }, (_, k) => (
                <th key={k}>M{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c, r) => (
              <tr key={c.cohort}>
                <td className="heat-label">{c.label}</td>
                <td className="heat-label num">{c.customers}</td>
                <td className="heat-label num">{compactUsd.format(c.startingMrr / 100)}</td>
                {Array.from({ length: maxAge }, (_, k) => {
                  const v = c[mode][k];
                  if (v === undefined) return <td key={k} />;
                  const i = rampIndex(v);
                  return (
                    <td
                      key={k}
                      className="heat-cell"
                      style={{ background: RAMP[i], color: i >= 6 ? "#ffffff" : C.ink }}
                      onPointerEnter={() => setHover({ r, k })}
                      onPointerLeave={() => setHover(null)}
                    >
                      {pct(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- sparkline for stat tiles ----------
export function Sparkline({ values, width = 120, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => 2 + (i * (width - 6)) / (values.length - 1);
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  const li = values.length - 1;
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={C.axis} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(li)} cy={y(values[li])} r={3} fill={C.s1} stroke={C.surface} strokeWidth={1.5} />
    </svg>
  );
}
