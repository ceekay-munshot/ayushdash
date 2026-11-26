import { useElementWidth, useTip, ChartFrame, Legend, type TipRow, type LegendItem } from './ChartBase';
import { niceTicks, linScale } from '../../lib/chartMath';

export interface GBar {
  seriesKey: string;
  label: string;
  value: number | null;
  color: string;
}
export interface GGroup {
  key: string;
  label: string;
  bars: GBar[];
  note?: string;
  tipRows?: TipRow[];
}

interface Props {
  groups: GGroup[];
  format: (n: number) => string;
  legend?: LegendItem[];
  barSize?: number;
  labelWidth?: number;
  axisTicks?: number;
}

/** Diverging grouped horizontal bars with a centred zero line — handles
 *  negative values (losses go left, gains go right). Two+ bars per group. */
export function GroupedBars({
  groups,
  format,
  legend,
  barSize = 18,
  labelWidth = 92,
  axisTicks = 4,
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();

  const innerGap = 5;
  const groupGap = 20;
  const rowH = barSize + innerGap;
  const padTop = 8;
  const axisH = 26;

  const groupH = (g: GGroup) => g.bars.length * rowH - innerGap + groupGap;
  const bodyH = groups.reduce((s, g) => s + groupH(g), 0);
  const chartH = padTop + bodyH + axisH;

  const plotLeft = labelWidth + 8;
  const plotRight = width - 44;
  const plotW = Math.max(60, plotRight - plotLeft);

  const allVals = groups.flatMap((g) => g.bars.map((b) => b.value)).filter((v): v is number => v != null);
  const absMax = Math.max(1, ...allVals.map((v) => Math.abs(v)));
  const { ticks, niceMax } = niceTicks(absMax, axisTicks);
  const x = linScale(-niceMax, niceMax, plotLeft, plotLeft + plotW);
  const zeroX = x(0);
  const signedTicks = [...ticks.slice().reverse().map((t) => -t), ...ticks.filter((t) => t > 0)];

  const moveTip = (e: React.MouseEvent, g: GGroup, cy: number) => {
    const rect = ref.current?.getBoundingClientRect();
    const px = rect ? e.clientX - rect.left : plotLeft;
    const rows: TipRow[] =
      g.tipRows ?? g.bars.map((b) => ({ label: b.label, value: b.value == null ? '—' : format(b.value), color: b.color }));
    show(px, cy, { title: g.label, color: g.bars[0]?.color, rows, note: g.note });
  };

  let yCursor = padTop;

  return (
    <div className="min-w-0">
      <ChartFrame innerRef={ref} tip={tip} width={width}>
        <svg width={width} height={chartH} role="img" className="overflow-visible">
          {/* gridlines + axis labels */}
          {signedTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={x(t)} x2={x(t)} y1={padTop} y2={padTop + bodyH}
                stroke={t === 0 ? '#94A3B8' : '#EEF0F3'} strokeWidth={t === 0 ? 1.5 : 1}
              />
              <text x={x(t)} y={padTop + bodyH + 16} textAnchor="middle" className="tnum" fontSize={10} fill="#94A3B8">
                {format(t)}
              </text>
            </g>
          ))}

          {groups.map((g) => {
            const blockTop = yCursor;
            const blockH = groupH(g);
            yCursor += blockH;
            const groupCy = blockTop + (blockH - groupGap) / 2;
            return (
              <g key={g.key} onMouseMove={(e) => moveTip(e, g, groupCy)} onMouseLeave={hide}>
                {/* group label */}
                <text x={0} y={groupCy + 4} fontSize={12.5} fontWeight={700} fill="#334155">
                  {g.label}
                </text>
                {g.bars.map((b, bi) => {
                  const y = blockTop + bi * rowH;
                  const v = b.value ?? 0;
                  const bx = v >= 0 ? zeroX : x(v);
                  const bw = Math.max(1, Math.abs(x(v) - zeroX));
                  const valX = v >= 0 ? x(v) + 5 : x(v) - 5;
                  return (
                    <g key={b.seriesKey}>
                      <rect
                        className="anim-bar-h"
                        style={{ animationDelay: `${bi * 60}ms`, transformOrigin: `${zeroX}px center` }}
                        x={bx} y={y} width={bw} height={barSize} rx={4} fill={b.color}
                        opacity={b.value == null ? 0.25 : 1}
                      />
                      <text
                        x={valX} y={y + barSize / 2 + 4} textAnchor={v >= 0 ? 'start' : 'end'}
                        className="tnum" fontSize={10.5} fontWeight={700} fill="#475569"
                      >
                        {b.value == null ? 'n/a' : format(b.value)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </ChartFrame>
      {legend && legend.length > 0 && <Legend items={legend} className="mt-2 pl-1" />}
    </div>
  );
}
