import { useMemo } from 'react';
import { Trophy, TrendingUp, TrendingDown, Target, ArrowRight } from 'lucide-react';
import type { Episode, NameRow } from '../types';
import type { Dataset, Horizon, AssetClass } from '../lib/data';
import { computeScores, bestWorst, type RankedCall } from '../lib/data';
import { PageHeader, Card, CardHeader, MiniStat } from '../components/ui/Card';
import { VerdictPill } from '../components/ui/VerdictPill';
import { GroupedBars, type GGroup } from '../components/charts/GroupedBars';
import { HBars } from '../components/charts/Bars';
import { Sparkline } from '../components/charts/Sparkline';
import { VERDICT, returnColor, shade } from '../lib/brand';
import { signedPct, pct } from '../lib/format';

const SLATE = '#64748B';

export default function ScorecardTab({
  rows, horizon, ctx, assetClass, onOpenCall,
}: {
  data: Dataset; rows: NameRow[]; episodes: Episode[]; horizon: Horizon; ctx: string;
  assetClass: AssetClass; onOpenCall: (n: NameRow) => void; onOpenEpisode: (e: Episode) => void;
}) {
  const scores = useMemo(() => computeScores(rows, horizon), [rows, horizon]);
  const { best, worst } = useMemo(() => bestWorst(rows, horizon, 5), [rows, horizon]);
  const hMonths = horizon === 'p3m' ? '3 months' : '6 months';

  // Benchmark label follows the selected asset class; alpha is always per-call.
  const marketLabel =
    assetClass === 'crypto' ? 'Bitcoin' :
    assetClass === 'stock' || assetClass === 'etf' || assetClass === 'index' ? 'S&P 500' :
    'the market';
  const benchNote =
    assetClass === 'all'
      ? 'Each call is compared to its own benchmark (S&P 500 for stocks/ETFs, Bitcoin for crypto)'
      : `vs. ${marketLabel} over the same window`;

  const hasData = scores.overall.complete > 0;

  // money chart
  const groups: GGroup[] = (['buy', 'neutral', 'avoid'] as const).map((d) => {
    const s = scores[d];
    return {
      key: d,
      label: VERDICT[d].label,
      bars: [
        { seriesKey: 'call', label: 'InvestTalk call', value: s.avgReturn, color: VERDICT[d].color },
        { seriesKey: 'mkt', label: marketLabel, value: s.avgBench, color: SLATE },
      ],
      tipRows: [
        { label: 'InvestTalk call', value: s.avgReturn == null ? '—' : signedPct(s.avgReturn), color: VERDICT[d].color },
        { label: marketLabel, value: s.avgBench == null ? '—' : signedPct(s.avgBench), color: SLATE },
        { label: 'Difference', value: s.avgAlpha == null ? '—' : signedPct(s.avgAlpha) },
        { label: 'Completed calls', value: String(s.complete) },
      ],
      note: s.inProgress ? `${s.inProgress} more still maturing` : undefined,
    };
  });

  // "Were they right?" — two measures per bucket: DIRECTION (went the right
  // way) and BEAT THE MARKET (vs the benchmark).
  const hitData = [
    scores.buy.dirRate != null && {
      key: 'buy-dir', label: 'Buy · went up', value: scores.buy.dirRate, color: VERDICT.buy.color,
      sublabel: `${scores.buy.dirHits}/${scores.buy.dirN} rose`, valueLabel: pct(scores.buy.dirRate, 0),
    },
    scores.buy.beatRate != null && {
      key: 'buy-beat', label: 'Buy · beat market', value: scores.buy.beatRate, color: shade(VERDICT.buy.color, 0.4),
      sublabel: `${scores.buy.beatHits}/${scores.buy.beatN} beat S&P`, valueLabel: pct(scores.buy.beatRate, 0),
    },
    scores.avoid.dirRate != null && {
      key: 'avoid-dir', label: 'Avoid · fell', value: scores.avoid.dirRate, color: VERDICT.avoid.color,
      sublabel: `${scores.avoid.dirHits}/${scores.avoid.dirN} fell`, valueLabel: pct(scores.avoid.dirRate, 0),
    },
    scores.avoid.beatRate != null && {
      key: 'avoid-beat', label: 'Avoid · lagged', value: scores.avoid.beatRate, color: shade(VERDICT.avoid.color, 0.4),
      sublabel: `${scores.avoid.beatHits}/${scores.avoid.beatN} lagged`, valueLabel: pct(scores.avoid.beatRate, 0),
    },
  ].filter(Boolean) as { key: string; label: string; value: number; color: string; sublabel: string; valueLabel: string }[];

  return (
    <div className="space-y-4 animate-fade-up">
      <PageHeader icon={Trophy} title="The scorecard" subtitle={ctx} />

      {/* hero line */}
      <Card className="relative overflow-hidden" pad={false}>
        <div className="absolute inset-0 opacity-[0.07]" style={{ background: 'linear-gradient(120deg,#6366F1,#8B5CF6,#EC4899)' }} />
        <div className="relative p-5 sm:p-6">
          {hasData ? (
            <p className="max-w-3xl text-[17px] font-semibold leading-relaxed text-fdc-ink sm:text-[19px]">
              Over the next {hMonths}, when the hosts said{' '}
              <span className="text-verdict-buy-dark">Buy</span>, the stock went{' '}
              <span className="tnum text-verdict-buy-dark">up {pct(scores.buy.dirRate, 0)} of the time</span>
              {scores.buy.avgReturn != null && (
                <> (<span className="tnum" style={{ color: returnColor(scores.buy.avgReturn) }}>{signedPct(scores.buy.avgReturn)}</span> on average)</>
              )}.{' '}
              When they said <span className="text-verdict-avoid-dark">Avoid</span>, it went{' '}
              <span className="tnum text-verdict-avoid-dark">down {pct(scores.avoid.dirRate, 0)} of the time</span>.
            </p>
          ) : (
            <p className="max-w-3xl text-[16px] font-medium leading-relaxed text-fdc-slate">
              No completed {hMonths} calls in this view yet. As episodes are analysed and the
              {' '}{hMonths} windows mature, the scorecard fills in automatically.
            </p>
          )}
        </div>
      </Card>

      {/* 3 headline stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MiniStat
          label={`Buy calls · avg return (${hMonths})`}
          value={signedPct(scores.buy.avgReturn)}
          color={returnColor(scores.buy.avgReturn)}
          sub={scores.buy.avgAlpha != null ? `${signedPct(scores.buy.avgAlpha)} vs the market` : 'vs market: —'}
        />
        <MiniStat
          label={`Avoid calls · avg return (${hMonths})`}
          value={signedPct(scores.avoid.avgReturn)}
          color={returnColor(scores.avoid.avgReturn)}
          sub={scores.avoid.avgAlpha != null ? `${signedPct(scores.avoid.avgAlpha)} vs the market` : 'vs market: —'}
        />
        <MiniStat
          label="Buy calls that went up"
          value={scores.buy.dirRate != null ? pct(scores.buy.dirRate, 0) : '—'}
          color={VERDICT.buy.dark}
          sub={scores.buy.beatRate != null ? `${pct(scores.buy.beatRate, 0)} beat the market` : 'direction hit rate'}
        />
      </div>

      {/* money chart + hit rate */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            icon={TrendingUp}
            title={`Average return by verdict — ${hMonths}`}
            subtitle={benchNote}
            accent={VERDICT.buy.color}
          />
          {hasData ? (
            <GroupedBars
              groups={groups}
              format={(n) => signedPct(n, 1)}
              legend={[
                { label: 'Buy', color: VERDICT.buy.color },
                { label: 'Neutral', color: VERDICT.neutral.color },
                { label: 'Avoid', color: VERDICT.avoid.color },
                { label: marketLabel, color: SLATE },
              ]}
            />
          ) : <Empty />}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            icon={Target}
            title="Were they right?"
            subtitle="Did the stock go the right way, and did it beat the market?"
            accent={VERDICT.neutral.dark}
          />
          {hitData.length ? (
            <HBars data={hitData} format={(n) => pct(n, 0)} maxValue={100} labelWidth={132} barSize={22} />
          ) : <Empty />}
        </Card>
      </div>

      {/* best & worst */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader icon={TrendingUp} title="Biggest wins" subtitle={`Most-right calls — a Buy that rose or an Avoid that fell (${hMonths})`} accent={VERDICT.buy.color} />
          <CallList calls={best} onOpenCall={onOpenCall} empty="No completed calls yet." />
        </Card>
        <Card>
          <CardHeader icon={TrendingDown} title="Biggest misses" subtitle={`Most-wrong calls — a Buy that fell or an Avoid that rose (${hMonths})`} accent={VERDICT.avoid.color} />
          <CallList calls={worst} onOpenCall={onOpenCall} empty="No completed calls yet." />
        </Card>
      </div>
    </div>
  );
}

function CallList({ calls, onOpenCall, empty }: { calls: RankedCall[]; onOpenCall: (n: NameRow) => void; empty: string }) {
  if (!calls.length) return <Empty label={empty} />;
  return (
    <div className="space-y-1">
      {calls.map(({ row, leg, edge }) => {
        // Sparkline tracks the CALL's value (up = call getting more right): for an
        // Avoid we flip the stock's return, so a falling stock = a rising good call.
        const sign = row.decision === 'avoid' ? -1 : 1;
        const spark = [{ label: 'At mention', value: 0 }];
        if (row.perf?.p3m?.status === 'complete') spark.push({ label: '+3 mo', value: sign * row.perf.p3m.return });
        if (row.perf?.p6m?.status === 'complete') spark.push({ label: '+6 mo', value: sign * row.perf.p6m.return });
        return (
          <button
            key={row.nameId}
            onClick={() => onOpenCall(row)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-fdc-offwhite"
          >
            <div className="w-[108px] shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="tnum text-[13px] font-bold text-fdc-ink">{row.ticker}</span>
                <VerdictPill decision={row.decision} size="sm" />
              </div>
              <div className="truncate text-[11px] text-fdc-grey">{row.company}</div>
            </div>
            <div className="h-10 flex-1 min-w-0">
              <Sparkline points={spark} color={returnColor(edge)} height={40} format={(n) => signedPct(n)} />
            </div>
            <div className="w-[92px] shrink-0 text-right">
              <div className="tnum text-[13px] font-bold" style={{ color: returnColor(edge) }}>{signedPct(edge)}</div>
              <div className="text-[10px] text-fdc-grey">stock {signedPct(leg.return)}</div>
            </div>
            <ArrowRight size={14} className="shrink-0 text-fdc-light" />
          </button>
        );
      })}
    </div>
  );
}

function Empty({ label = 'Nothing to show for this filter.' }: { label?: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-black/10 py-10 text-center text-[12.5px] text-fdc-grey">
      {label}
    </div>
  );
}
