import { useMemo } from 'react';
import { Compass, Hash, PieChart, Activity, MessageSquare } from 'lucide-react';
import type { Episode, NameRow } from '../types';
import type { Dataset } from '../lib/data';
import { mostDiscussed, assetMix, themeFrequency, toneSeries } from '../lib/data';
import { PageHeader, Card, CardHeader } from '../components/ui/Card';
import { HBars, type HBarDatum } from '../components/charts/Bars';
import { Donut, type DonutDatum } from '../components/charts/Donut';
import { LineArea, type LinePoint } from '../components/charts/LineArea';
import { VERDICT, ASSET_COLOR, ASSET_LABEL, CAT, BRAND } from '../lib/brand';
import { num, monthLabel } from '../lib/format';

export default function ThemesTab({
  data, rows, episodes, ctx,
}: {
  data: Dataset; rows: NameRow[]; episodes: Episode[]; horizon: unknown; ctx: string;
  onOpenCall: unknown; onOpenEpisode: unknown;
}) {
  const discussed = useMemo<HBarDatum[]>(() =>
    mostDiscussed(rows, 15).map((d) => ({
      key: d.ticker || d.company,
      label: d.ticker || d.company,
      sublabel: d.company !== d.ticker ? d.company : undefined,
      value: d.mentions,
      color: VERDICT[d.net].color,
      valueLabel: num(d.mentions),
      tipRows: [
        { label: 'Mentions', value: num(d.mentions) },
        { label: 'Buy', value: num(d.buy), color: VERDICT.buy.color },
        { label: 'Neutral', value: num(d.neutral), color: VERDICT.neutral.color },
        { label: 'Avoid', value: num(d.avoid), color: VERDICT.avoid.color },
      ],
    })), [rows]);

  const mix = useMemo<DonutDatum[]>(() =>
    assetMix(rows).map((m) => ({ key: m.type, label: ASSET_LABEL[m.type], value: m.count, color: ASSET_COLOR[m.type] })),
    [rows]);

  const episodeIds = useMemo(() => new Set(episodes.map((e) => e.id)), [episodes]);
  const themes = useMemo<HBarDatum[]>(() =>
    themeFrequency(data.summaries, episodeIds, 12).map((t, i) => ({
      key: t.theme, label: t.theme, value: t.count, color: CAT[i % CAT.length], valueLabel: num(t.count),
    })), [data.summaries, episodeIds]);

  const tone = useMemo<LinePoint[]>(() =>
    toneSeries(episodes, data.summaries).map((p) => ({
      label: monthLabel(p.month),
      value: p.value,
      note: `${p.episodes} episode${p.episodes === 1 ? '' : 's'}`,
      tipRows: [{ label: 'Optimism', value: p.value == null ? '—' : `${p.value.toFixed(0)} / 100` }],
    })), [episodes, data.summaries]);

  const totalNames = rows.length;

  return (
    <div className="space-y-3 animate-fade-up">
      <PageHeader icon={Compass} title="Themes & tone" subtitle={ctx} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader icon={MessageSquare} title="Most-discussed names" subtitle="Top 15 by number of mentions · coloured by their overall verdict" accent={BRAND.indigo} />
          {discussed.length ? <HBars data={discussed} format={num} labelWidth={132} barSize={20} /> : <Empty />}
        </Card>
        <Card>
          <CardHeader icon={PieChart} title="Asset-class mix" subtitle={`${num(totalNames)} calls`} accent={BRAND.violet} />
          {mix.length ? (
            <Donut data={mix} format={num} centerTitle="calls" centerValue={num(totalNames)} height={236} />
          ) : <Empty />}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Hash} title="What they talked about" subtitle="Most common episode themes" accent={CAT[2]} />
          {themes.length ? <HBars data={themes} format={num} labelWidth={150} barSize={18} /> : <Empty label="Themes appear once episodes are analysed." />}
        </Card>
        <Card>
          <CardHeader icon={Activity} title="The show's optimism over time" subtitle="0 = cautious · 50 = neutral · 100 = optimistic (monthly average)" accent={BRAND.pink} />
          {tone.some((t) => t.value != null) ? (
            <LineArea points={tone} color={BRAND.violet} format={(n) => `${n.toFixed(0)}`} yFromZero height={240} yAxisFormat={(n) => `${n.toFixed(0)}`} />
          ) : <Empty label="Tone appears once episodes are analysed." />}
        </Card>
      </div>
    </div>
  );
}

function Empty({ label = 'No calls in this view.' }: { label?: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-black/10 py-12 text-center text-[12.5px] text-fdc-grey">
      {label}
    </div>
  );
}
