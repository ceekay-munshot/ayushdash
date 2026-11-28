import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Search, Download, Clock } from 'lucide-react';
import type { NameRow, Decision, PerfLeg, AssetType } from '../types';
import type { Dataset, Horizon } from '../lib/data';
import { rollupByCompany, netVerdict, toDateProgress, isDirectionHit, sectorOptions, H_LABEL, H_SHORT, type CompanyRoll } from '../lib/data';
import { PageHeader, Card, Badge } from '../components/ui/Card';
import { SubTabs } from '../components/ui/Tabs';
import { Segmented, Toggle, Dropdown } from '../components/ui/Controls';
import { Table, type Column } from '../components/ui/Table';
import { VerdictPill } from '../components/ui/VerdictPill';
import { ASSET_COLOR, VERDICT, returnColor, heatForReturn } from '../lib/brand';
import { signedPct, dateShort } from '../lib/format';
import { exportToExcel } from '../lib/exportTable';

const ASSET_SHORT: Record<AssetType, string> = {
  stock: 'Stock', etf: 'ETF', crypto: 'Crypto', commodity: 'Commodity', index: 'Index', other: 'Other',
};
const VERDICT_ORDER: Record<Decision, number> = { buy: 0, neutral: 1, avoid: 2 };

type Sub = 'mention' | 'company';
type VFilter = 'all' | Decision;

export default function AllCallsTab({
  rows, horizon, ctx, recapCount, realCallsOnly, onOpenCall,
}: {
  data: Dataset; rows: NameRow[]; episodes: unknown; horizon: Horizon; ctx: string;
  recapCount: number; realCallsOnly: boolean;
  onOpenCall: (n: NameRow) => void; onOpenEpisode: unknown;
}) {
  const [sub, setSub] = useState<Sub>('mention');
  const [vf, setVf] = useState<VFilter>('all');
  const [sector, setSector] = useState<string>('all');
  const [q, setQ] = useState('');
  const [hideLow, setHideLow] = useState(false);

  const sectors = useMemo(() => sectorOptions(rows), [rows]);
  // If the active sector filter falls out of the current window, reset it.
  useEffect(() => {
    if (sector !== 'all' && !sectors.includes(sector)) setSector('all');
  }, [sectors, sector]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (vf !== 'all' && r.decision !== vf) return false;
      if (sector !== 'all' && r.sector !== sector) return false;
      if (hideLow && (r.confidence ?? 1) < 0.4) return false;
      if (needle && !(`${r.ticker} ${r.company}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [rows, vf, sector, q, hideLow]);

  const companies = useMemo(() => rollupByCompany(filtered, horizon), [filtered, horizon]);

  const exportNow = () => {
    if (sub === 'mention') {
      void exportToExcel(
        filtered.map((r) => {
          const td = toDateProgress(r);
          const done = (h: Horizon) => (r.perf?.[h]?.status === 'complete');
          const ret = (h: Horizon) => (done(h) ? r.perf![h]!.return : '');
          const alpha = (h: Horizon) => (done(h) ? (r.perf![h]!.alpha ?? '') : '');
          return {
            Date: r.date, Ticker: r.ticker, Company: r.company,
            Sector: r.sector ?? '', Industry: r.industry ?? '', Asset: ASSET_SHORT[r.assetType],
            Verdict: r.decision, Confidence: r.confidence,
            'To date %': td?.return ?? '', 'Days so far': td?.days ?? '',
            '+3mo return %': ret('p3m'), '+3mo vs market %': alpha('p3m'),
            '+6mo return %': ret('p6m'), '+6mo vs market %': alpha('p6m'),
            '+9mo return %': ret('p9m'), '+9mo vs market %': alpha('p9m'),
            '+12mo return %': ret('p12m'), '+12mo vs market %': alpha('p12m'),
            Status: r.resolved ? (r.perf?.[horizon]?.status ?? 'n/a') : 'unmatched', Reasoning: r.reasoning,
          };
        }),
        'investtalk-calls', 'Calls'
      );
    } else {
      void exportToExcel(
        companies.map((c) => ({
          Ticker: c.ticker, Company: c.company, Sector: c.sector ?? '', Asset: ASSET_SHORT[c.assetType], Mentions: c.mentions,
          Buy: c.buy, Neutral: c.neutral, Avoid: c.avoid, 'Latest verdict': c.latestDecision,
          'Avg return %': c.avgReturn ?? '', 'Avg vs market %': c.avgAlpha ?? '',
        })),
        'investtalk-by-company', 'Companies'
      );
    }
  };

  return (
    <div className="space-y-3 animate-fade-up">
      <PageHeader
        icon={ListChecks}
        title="All calls"
        subtitle={ctx}
        right={
          <button
            onClick={exportNow}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-[12.5px] font-semibold text-fdc-slate shadow-sm transition hover:border-fdc-green/40 hover:shadow"
          >
            <Download size={14} /> Export
          </button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SubTabs
          tabs={[{ key: 'mention', label: 'By mention (dated)' }, { key: 'company', label: 'By company' }]}
          active={sub}
          onChange={(k) => setSub(k as Sub)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={vf}
            options={[
              { value: 'all', label: 'All' },
              { value: 'buy', label: 'Buy', color: VERDICT.buy.color },
              { value: 'neutral', label: 'Neutral', color: VERDICT.neutral.color },
              { value: 'avoid', label: 'Avoid', color: VERDICT.avoid.color },
            ]}
            onChange={(v) => setVf(v as VFilter)}
            size="sm"
          />
          {sectors.length > 0 && (
            <Dropdown
              value={sector}
              options={[{ value: 'all', label: 'All sectors' }, ...sectors.map((s) => ({ value: s, label: s }))]}
              onChange={setSector}
              width={150}
            />
          )}
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fdc-grey" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search ticker or company"
              className="w-[210px] rounded-xl border border-black/10 bg-white py-1.5 pl-8 pr-3 text-[12.5px] shadow-sm outline-none focus:border-fdc-green/50"
            />
          </div>
          <Toggle checked={hideLow} onChange={setHideLow} label="Hide low confidence" />
        </div>
      </div>

      <Card pad={false} className="p-2 sm:p-2.5">
        {sub === 'mention' ? (
          <MentionTable rows={filtered} horizon={horizon} onOpenCall={onOpenCall} />
        ) : (
          <CompanyTable
            rows={companies}
            horizon={horizon}
            onPick={(ticker) => { setQ(ticker); setSub('mention'); }}
          />
        )}
      </Card>
      <p className="px-1 text-[11.5px] text-fdc-grey">
        {sub === 'mention' ? `${filtered.length} ${realCallsOnly ? 'calls' : 'rows'}` : `${companies.length} companies`} · <span className="font-medium text-fdc-slate">To date</span> = return so far (<Clock size={11} className="inline" /> live);
        <span className="font-medium text-fdc-slate"> +3/6/9/12mo</span> show “—” until that window closes · green = gain, red = loss · click a row for detail.
        {realCallsOnly && recapCount > 0 && (
          <> · <span className="font-medium text-fdc-slate">{recapCount} market-recap mention{recapCount === 1 ? '' : 's'} hidden</span> (toggle “Real calls only” off to show)</>
        )}
      </p>
    </div>
  );
}

/** A matured horizon cell: coloured signed %. While the window is still open
 *  (in-progress) it shows "—" — the real 3-/6-month number doesn't exist yet;
 *  the live number lives in the "To date" column instead. */
function Ret({ leg, kind }: { leg: PerfLeg | null | undefined; kind: 'return' | 'alpha' }) {
  if (!leg || leg.status === 'in_progress') {
    return <span className="text-fdc-light" title={leg ? 'window still open' : undefined}>—</span>;
  }
  const v = kind === 'return' ? leg.return : leg.alpha;
  if (v == null) return <span className="text-fdc-light">—</span>;
  return (
    <span className="tnum inline-flex items-center gap-1 font-semibold" style={{ color: returnColor(v) }}>
      {signedPct(v)}
    </span>
  );
}

/** The "so far" return since the call, with age in days. "matured" once both
 *  windows have closed; "—" when unmatched/unresolved. */
function ToDateCell({ row }: { row: NameRow }) {
  const td = toDateProgress(row);
  if (!td) {
    return <span className="text-fdc-light">{row.resolved && row.perf ? 'matured' : '—'}</span>;
  }
  return (
    <span className="tnum inline-flex items-center gap-1 font-semibold" style={{ color: returnColor(td.return) }}>
      <Clock size={10} className="opacity-60" />
      {signedPct(td.return)}
      <span className="text-[10px] font-normal text-fdc-grey">· {td.days}d</span>
    </span>
  );
}

function MentionTable({ rows, horizon, onOpenCall }: { rows: NameRow[]; horizon: Horizon; onOpenCall: (n: NameRow) => void }) {
  // Emphasise the header of the horizon selected by the global toggle.
  const mark = (label: string, h: Horizon) =>
    horizon === h ? <span className="border-b-2 border-white/70 pb-px">{label}</span> : <span className="opacity-70">{label}</span>;
  const retCol = (h: Horizon): Column<NameRow> => ({
    key: `ret_${h}`, header: mark(H_SHORT[h], h), align: 'right', sortable: true,
    headerHint: `Raw return ${H_LABEL[h].replace('+', '')} after the call — “—” until that window closes`,
    sortValue: (r) => (r.perf?.[h]?.status === 'complete' ? r.perf![h]!.return : -Infinity),
    heat: (r) => (r.perf?.[h]?.status === 'complete' ? heatForReturn(r.perf![h]!.return, 20) : null),
    render: (r) => <Ret leg={r.perf?.[h]} kind="return" />,
  });
  const cols: Column<NameRow>[] = [
    { key: 'date', header: 'Date', sortable: true, sortValue: (r) => r.date, render: (r) => <span className="whitespace-nowrap text-fdc-grey">{dateShort(r.date)}</span> },
    { key: 'ticker', header: 'Ticker', sortable: true, sortValue: (r) => r.ticker, render: (r) => <span className="tnum font-bold text-fdc-ink">{r.ticker || '—'}</span> },
    { key: 'company', header: 'Company', sortable: true, sortValue: (r) => r.company, width: 180, render: (r) => <span className="block max-w-[180px] truncate">{r.company}</span> },
    { key: 'sector', header: 'Sector', sortable: true, sortValue: (r) => r.sector || '~', width: 124, render: (r) => r.sector ? <span className="block max-w-[124px] truncate text-[12px] text-fdc-slate" title={r.industry || undefined}>{r.sector}</span> : <span className="text-fdc-light">—</span> },
    { key: 'asset', header: 'Type', render: (r) => <Badge color={ASSET_COLOR[r.assetType]}>{ASSET_SHORT[r.assetType]}</Badge> },
    { key: 'verdict', header: 'Verdict', sortable: true, sortValue: (r) => VERDICT_ORDER[r.decision], render: (r) => r.mentionType === 'market_recap' ? <Badge color="#94A3B8">recap</Badge> : <VerdictPill decision={r.decision} size="sm" /> },
    { key: 'result', header: 'Call', headerHint: 'Was the call right at the selected horizon? Buy↑ or Avoid↓ = right', sortable: true, sortValue: (r) => { const h = isDirectionHit(r, horizon); return h == null ? -1 : h ? 1 : 0; }, render: (r) => <CallResult row={r} horizon={horizon} /> },
    { key: 'todate', header: 'To date', align: 'right', sortable: true, headerHint: 'Return since the call, so far (live)', sortValue: (r) => toDateProgress(r)?.return ?? -Infinity, heat: (r) => heatForReturn(toDateProgress(r)?.return, 20), render: (r) => <ToDateCell row={r} /> },
    retCol('p3m'), retCol('p6m'), retCol('p9m'), retCol('p12m'),
    { key: 'status', header: 'Status', render: (r) => renderStatus(r) },
  ];
  return (
    <Table
      columns={cols}
      rows={rows}
      getKey={(r) => r.nameId}
      initialSort={{ key: 'date', dir: 'desc' }}
      onRowClick={onOpenCall}
      maxHeight={560}
      dense
    />
  );
}

// Decision-aware "was the call right?" at the selected horizon: a Buy is right
// if the stock rose, an Avoid is right if it fell. "—" for neutral / recap /
// not-yet-closed / unmatched.
function CallResult({ row, horizon }: { row: NameRow; horizon: Horizon }) {
  if (row.mentionType === 'market_recap') return <span className="text-fdc-light">—</span>;
  const hit = isDirectionHit(row, horizon);
  if (hit == null) return <span className="text-fdc-light">—</span>;
  return hit
    ? <Badge color={VERDICT.buy.color}>✓ right</Badge>
    : <Badge color={VERDICT.avoid.color}>✗ wrong</Badge>;
}

// Overall maturity — independent of the horizon toggle (both columns are shown).
function renderStatus(r: NameRow) {
  if (!r.resolved) return <Badge color="#94A3B8">unmatched</Badge>;
  const done = r.perf?.p3m?.status === 'complete' && r.perf?.p6m?.status === 'complete';
  return done
    ? <Badge color={VERDICT.buy.color}>complete</Badge>
    : <Badge color="#F59E0B"><Clock size={10} /> maturing</Badge>;
}

function CompanyTable({ rows, horizon, onPick }: { rows: CompanyRoll[]; horizon: Horizon; onPick: (ticker: string) => void }) {
  void horizon;
  const cols: Column<CompanyRoll>[] = [
    { key: 'ticker', header: 'Ticker', sortable: true, sortValue: (r) => r.ticker, render: (r) => <span className="tnum font-bold text-fdc-ink">{r.ticker}</span> },
    { key: 'company', header: 'Company', sortable: true, sortValue: (r) => r.company, width: 190, render: (r) => <span className="block max-w-[190px] truncate">{r.company}</span> },
    { key: 'sector', header: 'Sector', sortable: true, sortValue: (r) => r.sector || '~', width: 120, render: (r) => r.sector ? <span className="block max-w-[120px] truncate text-[12px] text-fdc-slate">{r.sector}</span> : <span className="text-fdc-light">—</span> },
    { key: 'mentions', header: 'Mentions', align: 'right', sortable: true, sortValue: (r) => r.mentions, render: (r) => <span className="tnum font-semibold">{r.mentions}</span> },
    { key: 'split', header: 'Bull / bear', width: 150, render: (r) => <BullBear c={r} /> },
    { key: 'latest', header: 'Latest', render: (r) => <VerdictPill decision={r.latestDecision} size="sm" /> },
    { key: 'ar', header: 'Avg return', align: 'right', sortable: true, sortValue: (r) => r.avgReturn ?? -Infinity, heat: (r) => heatForReturn(r.avgReturn, 20), render: (r) => r.avgReturn == null ? <span className="text-fdc-light">—</span> : <span className="tnum font-semibold" style={{ color: returnColor(r.avgReturn) }}>{signedPct(r.avgReturn)}</span> },
    { key: 'aa', header: 'Avg vs mkt', align: 'right', sortable: true, sortValue: (r) => r.avgAlpha ?? -Infinity, heat: (r) => heatForReturn(r.avgAlpha, 15), render: (r) => r.avgAlpha == null ? <span className="text-fdc-light">—</span> : <span className="tnum font-semibold" style={{ color: returnColor(r.avgAlpha) }}>{signedPct(r.avgAlpha)}</span> },
  ];
  return (
    <Table
      columns={cols}
      rows={rows}
      getKey={(r) => r.ticker}
      initialSort={{ key: 'mentions', dir: 'desc' }}
      onRowClick={(r) => onPick(r.ticker)}
      maxHeight={560}
      dense
    />
  );
}

function BullBear({ c }: { c: CompanyRoll }) {
  const total = c.buy + c.neutral + c.avoid || 1;
  const seg = (n: number, color: string) => (n ? <span className="h-2 rounded-sm" style={{ width: `${(n / total) * 100}%`, background: color }} /> : null);
  const net = netVerdict(c.buy, c.neutral, c.avoid);
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-2 w-[86px] overflow-hidden rounded-sm bg-slate-100">
        {seg(c.buy, VERDICT.buy.color)}{seg(c.neutral, VERDICT.neutral.color)}{seg(c.avoid, VERDICT.avoid.color)}
      </span>
      <span className="tnum text-[11px] font-semibold" style={{ color: VERDICT[net].dark }}>
        {c.buy}/{c.neutral}/{c.avoid}
      </span>
    </div>
  );
}
