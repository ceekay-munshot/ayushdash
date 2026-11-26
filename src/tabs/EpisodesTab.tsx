import { useMemo, useState } from 'react';
import { Headphones, Search } from 'lucide-react';
import type { Episode } from '../types';
import type { Dataset } from '../lib/data';
import { callsByEpisode } from '../lib/data';
import { PageHeader, Card, Badge } from '../components/ui/Card';
import { Table, type Column } from '../components/ui/Table';
import { TONE_COLOR, TONE_LABEL } from '../lib/brand';
import { dateShort, num } from '../lib/format';

export default function EpisodesTab({
  data, episodes, ctx, onOpenEpisode,
}: {
  data: Dataset; rows: unknown; episodes: Episode[]; horizon: unknown; ctx: string;
  onOpenCall: unknown; onOpenEpisode: (e: Episode) => void;
}) {
  const [q, setQ] = useState('');
  const callCounts = useMemo(() => callsByEpisode(data.names), [data.names]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return episodes
      .filter((e) => !needle || e.title.toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [episodes, q]);

  const cols: Column<Episode>[] = [
    { key: 'date', header: 'Date', sortable: true, sortValue: (e) => e.date, render: (e) => <span className="whitespace-nowrap text-fdc-grey">{dateShort(e.date)}</span> },
    { key: 'title', header: 'Episode', sortable: true, sortValue: (e) => e.title, render: (e) => <span className="block max-w-[520px] truncate font-medium text-fdc-ink">{e.title}</span> },
    {
      key: 'tone', header: 'Tone', render: (e) => {
        const s = data.summaries[e.id];
        return s ? <Badge color={TONE_COLOR[s.tone]}>{TONE_LABEL[s.tone]}</Badge> : <span className="text-fdc-light">—</span>;
      },
    },
    {
      key: 'calls', header: 'Calls', align: 'right', sortable: true,
      sortValue: (e) => callCounts.get(e.id) ?? 0,
      render: (e) => {
        const n = callCounts.get(e.id) ?? 0;
        return n ? <span className="tnum font-semibold text-fdc-ink">{num(n)}</span> : <span className="text-[11px] text-fdc-grey">macro / Q&amp;A day</span>;
      },
    },
    {
      key: 'transcript', header: 'Transcript', align: 'center',
      render: (e) => e.hasTranscript ? <Badge color="#6366F1">available</Badge> : <span className="text-fdc-light">—</span>,
    },
  ];

  return (
    <div className="space-y-3 animate-fade-up">
      <PageHeader
        icon={Headphones}
        title="Episodes"
        subtitle={ctx}
        right={
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fdc-grey" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search episode titles"
              className="w-[240px] rounded-xl border border-black/10 bg-white py-2 pl-8 pr-3 text-[12.5px] shadow-sm outline-none focus:border-fdc-green/50"
            />
          </div>
        }
      />
      <Card pad={false} className="p-2 sm:p-2.5">
        <Table
          columns={cols}
          rows={filtered}
          getKey={(e) => e.id}
          initialSort={{ key: 'date', dir: 'desc' }}
          onRowClick={onOpenEpisode}
          maxHeight={600}
          dense
        />
      </Card>
      <p className="px-1 text-[11.5px] text-fdc-grey">{filtered.length} episodes · click any row for the summary, the day's calls, and the full transcript.</p>
    </div>
  );
}
