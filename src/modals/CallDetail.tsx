import { Quote, ExternalLink, Headphones, Info } from 'lucide-react';
import type { NameRow } from '../types';
import { toDateProgress, type Dataset } from '../lib/data';
import { Modal } from '../components/ui/Modal';
import { Badge, MiniStat } from '../components/ui/Card';
import { VerdictPill } from '../components/ui/VerdictPill';
import { GroupedBars, type GGroup } from '../components/charts/GroupedBars';
import { VERDICT, ASSET_COLOR, ASSET_LABEL, returnColor, benchLabel } from '../lib/brand';
import { signedPct, usd, dateLabel } from '../lib/format';

const SLATE = '#64748B';
const MENTION_LABEL: Record<string, string> = {
  caller_question: 'Caller question', host_opinion: 'Host opinion', market_recap: 'Market recap',
};

export function CallDetail({ row, data, onClose }: { row: NameRow | null; data: Dataset; onClose: () => void }) {
  if (!row) return null;
  const ep = data.episodes.find((e) => e.id === row.episodeId);
  const perf = row.perf;
  const v = VERDICT[row.decision];
  const recap = row.mentionType === 'market_recap';
  const td = toDateProgress(row); // live "so far" return while a window is open

  // Only COMPLETED windows get a bar — an open window has no real 3-/6-month number yet.
  const groups: GGroup[] = perf
    ? (['p3m', 'p6m'] as const)
        .filter((h) => perf[h]?.status === 'complete')
        .map((h) => {
          const leg = perf[h]!;
          return {
            key: h,
            label: h === 'p3m' ? '+3 months' : '+6 months',
            bars: [
              { seriesKey: 'call', label: row.ticker, value: leg.return, color: v.color },
              { seriesKey: 'mkt', label: benchLabel(perf.benchmark), value: leg.benchReturn, color: SLATE },
            ],
            tipRows: [
              { label: row.ticker, value: signedPct(leg.return), color: v.color },
              { label: benchLabel(perf.benchmark), value: leg.benchReturn == null ? '—' : signedPct(leg.benchReturn), color: SLATE },
              { label: 'Difference', value: leg.alpha == null ? '—' : signedPct(leg.alpha) },
            ],
          };
        })
    : [];
  const horizonStat = (h: 'p3m' | 'p6m', label: string) => {
    const leg = perf?.[h];
    const complete = leg?.status === 'complete';
    return (
      <MiniStat
        label={label}
        value={complete ? signedPct(leg!.alpha) : '—'}
        color={complete ? returnColor(leg!.alpha) : SLATE}
        sub={complete ? signedPct(leg!.return) + ' raw' : leg ? 'window still open' : '—'}
      />
    );
  };

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      accent={v.color}
      title={<span className="flex items-center gap-2">{row.ticker || '—'} <span className="text-white/80">·</span> <span className="text-[14px] font-semibold text-white/90">{row.company}</span></span>}
      subtitle={<span className="flex items-center gap-2">{ASSET_LABEL[row.assetType]} · discussed {dateLabel(row.date)}</span>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {recap ? <Badge color="#94A3B8">market recap · not scored</Badge> : <VerdictPill decision={row.decision} />}
          <Badge color={ASSET_COLOR[row.assetType]}>{ASSET_LABEL[row.assetType]}</Badge>
          {row.mentionType && <Badge color={SLATE}>{MENTION_LABEL[row.mentionType] ?? row.mentionType}</Badge>}
          {row.confidence != null && <Badge color={SLATE}>confidence {(row.confidence * 100).toFixed(0)}%</Badge>}
          {perf?.symbol && perf.symbol !== row.ticker && <Badge color={SLATE}>priced as {perf.symbol}</Badge>}
          {!row.resolved && <Badge color="#94A3B8">unmatched ticker</Badge>}
        </div>

        {row.reasoning && <p className="text-[14px] font-medium leading-relaxed text-fdc-ink">{row.reasoning}</p>}

        {row.quote && (
          <div className="flex gap-2.5 rounded-xl border-l-[3px] bg-fdc-offwhite px-3.5 py-2.5" style={{ borderColor: v.color }}>
            <Quote size={16} className="mt-0.5 shrink-0" style={{ color: v.color }} />
            <p className="text-[13px] italic leading-relaxed text-fdc-slate">“{row.quote}”</p>
          </div>
        )}

        {row.context && (
          <div className="flex items-start gap-2 text-[12.5px] text-fdc-grey">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>{row.context}</span>
          </div>
        )}

        {/* performance */}
        {perf ? (
          <div className="rounded-xl border border-black/[0.06] p-3.5">
            <div className="mb-3 grid grid-cols-3 gap-2">
              <MiniStat label="Price at mention" value={usd(perf.priceAtMention)} color={SLATE} sub={dateLabel(perf.priceDate)} />
              {horizonStat('p3m', `+3mo vs ${benchLabel(perf.benchmark)}`)}
              {horizonStat('p6m', `+6mo vs ${benchLabel(perf.benchmark)}`)}
            </div>
            {td && (
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-fdc-offwhite px-3 py-2 text-[12.5px]">
                <span className="font-semibold text-fdc-slate">So far</span>
                <span className="tnum font-bold" style={{ color: returnColor(td.return) }}>{signedPct(td.return)}</span>
                <span className="text-fdc-grey">since the call · {td.days} day{td.days === 1 ? '' : 's'} in</span>
                {td.alpha != null && (
                  <span className="tnum" style={{ color: returnColor(td.alpha) }}>{signedPct(td.alpha)} vs {benchLabel(td.benchmark)}</span>
                )}
                <span className="text-fdc-grey">· {td.days < 91 ? '3-month' : '6-month'} window not closed yet</span>
              </div>
            )}
            {groups.length > 0 && (
              <GroupedBars
                groups={groups}
                format={(n) => signedPct(n, 1)}
                barSize={16}
                labelWidth={78}
                legend={[
                  { label: row.ticker, color: v.color },
                  { label: benchLabel(perf.benchmark), color: SLATE },
                ]}
              />
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-black/10 px-3.5 py-4 text-[12.5px] text-fdc-grey">
            No performance data — this ticker couldn't be matched to a market price.
          </div>
        )}

        {/* episode links */}
        {ep && (
          <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-3 text-[12.5px]">
            <span className="text-fdc-grey">From episode:</span>
            <span className="font-medium text-fdc-ink">{ep.title}</span>
            {ep.audioUrl && (
              <a href={ep.audioUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-fdc-green hover:underline">
                <Headphones size={13} /> Listen
              </a>
            )}
            {ep.link && (
              <a href={ep.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-fdc-green hover:underline">
                <ExternalLink size={13} /> Show page
              </a>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
