import { useMemo, useState } from 'react';
import { useElementWidth, useTip, ChartFrame, Legend, type TipRow } from './ChartBase';
import { linScale, linePath, areaPath } from '../../lib/chartMath';
import type { Decision } from '../../types';
import { VERDICT, withAlpha } from '../../lib/brand';
import { usd, signedPct, dateShort } from '../../lib/format';

const STOCK = '#4F46E5'; // indigo
const BENCH = '#94A3B8'; // slate

export interface PriceMarker { date: string; label: string }

interface Props {
  closes: Record<string, number>;
  bench?: Record<string, number> | null;
  benchName?: string;
  ticker: string;
  mentionDate: string;
  priceAtMention: number;
  decision: Decision;
  markers?: PriceMarker[];
  height?: number;
}

const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2-year price line for a called stock, with a verdict marker at the call date
 *  and an (optional) S&P line rebased to the same starting price — so you can
 *  literally see whether the call beat the market. */
export function PriceHistory({
  closes, bench, benchName, ticker, mentionDate, priceAtMention, decision, markers = [], height = 240,
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const [hoverX, setHoverX] = useState<number | null>(null);
  const v = VERDICT[decision];

  const stock = useMemo(
    () => Object.entries(closes).map(([d, p]) => ({ t: t(d), date: d, price: p })).sort((a, b) => a.t - b.t),
    [closes]
  );

  // Rebase the benchmark so bench(mentionDate) == priceAtMention.
  const benchPts = useMemo(() => {
    if (!bench) return null;
    const entries = Object.entries(bench).map(([d, p]) => ({ t: t(d), date: d, price: p })).sort((a, b) => a.t - b.t);
    if (!entries.length) return null;
    const mT = t(mentionDate);
    let anchor = entries[0];
    for (const e of entries) { if (e.t <= mT) anchor = e; else break; }
    const scale = priceAtMention / anchor.price;
    return entries.map((e) => ({ ...e, price: e.price * scale }));
  }, [bench, mentionDate, priceAtMention]);

  if (stock.length < 2) return <div className="py-6 text-center text-[12px] text-fdc-grey">No price history available.</div>;

  const padTop = 10, axisH = 22, yAxisW = 52;
  const plotLeft = yAxisW, plotRight = width - 10, plotW = Math.max(40, plotRight - plotLeft);
  const plotH = height - padTop - axisH, baseY = padTop + plotH;

  const tMin = stock[0].t, tMax = stock[stock.length - 1].t;
  const all = [...stock.map((s) => s.price), ...(benchPts ? benchPts.map((b) => b.price) : []), priceAtMention];
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const x = linScale(tMin, tMax, plotLeft, plotLeft + plotW);
  const y = linScale(lo - pad, hi + pad, baseY, padTop);

  const sPts: [number, number][] = stock.map((s) => [x(s.t), y(s.price)]);
  const bPts: [number, number][] | null = benchPts ? benchPts.map((b) => [x(b.t), y(b.price)]) : null;

  const mx = x(Math.max(tMin, Math.min(tMax, t(mentionDate))));
  const my = y(priceAtMention);

  // ~6 month/year x ticks
  const xticks: { x: number; label: string }[] = [];
  { const seen = new Set<string>();
    for (const s of stock) {
      const d = new Date(s.t); const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      if (!seen.has(key) && d.getUTCMonth() % 4 === 0) { seen.add(key); xticks.push({ x: x(s.t), label: `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}` }); }
    } }

  const yticks = [lo, (lo + hi) / 2, hi];

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect(); if (!rect) return;
    const px = e.clientX - rect.left;
    let best = stock[0], bd = Infinity;
    for (const s of stock) { const d = Math.abs(x(s.t) - px); if (d < bd) { bd = d; best = s; } }
    setHoverX(x(best.t));
    const b = benchPts?.find((z) => z.date === best.date);
    const rows: TipRow[] = [{ label: ticker, value: usd(best.price), color: STOCK }];
    if (b) rows.push({ label: benchName ?? 'S&P 500', value: usd(b.price), color: BENCH });
    rows.push({ label: 'vs call', value: signedPct((best.price / priceAtMention - 1) * 100) });
    show(x(best.t), y(best.price), { title: dateShort(best.date), color: STOCK, rows });
  };

  return (
    <div className="min-w-0">
      <ChartFrame innerRef={ref} tip={tip} width={width}>
        <svg width={width} height={height} role="img" onMouseMove={onMove} onMouseLeave={() => { hide(); setHoverX(null); }}>
          <defs>
            <linearGradient id="ph-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={STOCK} stopOpacity={0.18} />
              <stop offset="100%" stopColor={STOCK} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          {yticks.map((tk, i) => (
            <g key={i}>
              <line x1={plotLeft} x2={plotRight} y1={y(tk)} y2={y(tk)} stroke="#EEF0F3" strokeWidth={1} />
              <text x={plotLeft - 6} y={y(tk) + 3} textAnchor="end" className="tnum" fontSize={10} fill="#94A3B8">{usd(tk)}</text>
            </g>
          ))}
          {xticks.map((tk, i) => (
            <text key={i} x={tk.x} y={height - 6} textAnchor="middle" fontSize={10} fill="#94A3B8">{tk.label}</text>
          ))}

          {/* shade post-call region */}
          <rect x={mx} y={padTop} width={Math.max(0, plotLeft + plotW - mx)} height={plotH} fill={withAlpha(v.color, 0.05)} />

          {/* benchmark (rebased) */}
          {bPts && bPts.length > 1 && (
            <path className="anim-fade" d={linePath(bPts)} fill="none" stroke={BENCH} strokeWidth={1.6} strokeDasharray="4 3" strokeLinejoin="round" />
          )}
          {/* stock */}
          <path d={areaPath(sPts, baseY)} fill="url(#ph-grad)" />
          <path className="anim-fade" d={linePath(sPts)} fill="none" stroke={STOCK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* call marker */}
          <line x1={mx} x2={mx} y1={padTop} y2={baseY} stroke={v.color} strokeWidth={1.5} strokeDasharray="3 3" />
          <circle cx={mx} cy={my} r={5} fill={v.color} stroke="#fff" strokeWidth={2} />
          <text x={mx} y={padTop + 9} textAnchor={mx > plotLeft + plotW / 2 ? 'end' : 'start'} dx={mx > plotLeft + plotW / 2 ? -7 : 7} fontSize={10.5} fontWeight={700} fill={v.dark}>
            {v.label} · {usd(priceAtMention)}
          </text>

          {/* horizon markers */}
          {markers.map((m, i) => {
            const mt = Math.max(tMin, Math.min(tMax, t(m.date)));
            const px = x(mt);
            const pt = stock.reduce((a, b) => (Math.abs(b.t - mt) < Math.abs(a.t - mt) ? b : a), stock[0]);
            return (
              <g key={i}>
                <circle cx={px} cy={y(pt.price)} r={3} fill="#fff" stroke={STOCK} strokeWidth={1.6} />
                <text x={px} y={baseY - 4} textAnchor="middle" fontSize={9} fill="#94A3B8">{m.label}</text>
              </g>
            );
          })}

          {hoverX != null && <line x1={hoverX} x2={hoverX} y1={padTop} y2={baseY} stroke={STOCK} strokeWidth={1} strokeDasharray="2 2" opacity={0.4} />}
        </svg>
      </ChartFrame>
      <Legend
        className="mt-1.5 pl-1"
        items={[
          { label: ticker, color: STOCK },
          ...(bPts ? [{ label: `${benchName ?? 'S&P 500'} (rebased)`, color: BENCH }] : []),
          { label: `${v.label} call`, color: v.color },
        ]}
      />
    </div>
  );
}
