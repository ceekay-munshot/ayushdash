import { useMemo, useState } from 'react';
import { Trophy, ListChecks, Compass, Headphones, AlertTriangle, Loader2 } from 'lucide-react';
import type { Episode, NameRow } from './types';
import {
  useAppData, filterNames, filterEpisodes, windowRange,
  type AssetClass, type WindowKey, type Horizon,
} from './lib/data';
import { ASSET_OPTIONS } from './lib/data';
import { Header, type GlobalControls } from './components/Header';
import { Tabs, type TabDef } from './components/ui/Tabs';
import ScorecardTab from './tabs/ScorecardTab';
import AllCallsTab from './tabs/AllCallsTab';
import ThemesTab from './tabs/ThemesTab';
import EpisodesTab from './tabs/EpisodesTab';
import { CallDetail } from './modals/CallDetail';
import { EpisodeDetail } from './modals/EpisodeDetail';

type TabKey = 'scorecard' | 'calls' | 'themes' | 'episodes';

const TABS: TabDef<TabKey>[] = [
  { key: 'scorecard', label: 'Scorecard', icon: Trophy },
  { key: 'calls', label: 'All calls', icon: ListChecks },
  { key: 'themes', label: 'Themes & tone', icon: Compass },
  { key: 'episodes', label: 'Episodes', icon: Headphones },
];

export default function App() {
  const state = useAppData();
  const [tab, setTab] = useState<TabKey>('scorecard');
  const [assetClass, setAssetClass] = useState<AssetClass>('all');
  const [windowKey, setWindowKey] = useState<WindowKey>('all');
  const [horizon, setHorizon] = useState<Horizon>('p6m');
  const [callOpen, setCallOpen] = useState<NameRow | null>(null);
  const [epOpen, setEpOpen] = useState<Episode | null>(null);

  const controls: GlobalControls = {
    assetClass, setAssetClass, windowKey, setWindowKey, horizon, setHorizon,
  };

  const meta = state.status === 'ready' ? state.data.meta : null;

  const rows = useMemo(
    () => (state.status === 'ready' ? filterNames(state.data.names, assetClass, windowKey, meta) : []),
    [state, assetClass, windowKey, meta]
  );
  const episodes = useMemo(
    () => (state.status === 'ready' ? filterEpisodes(state.data.episodes, windowKey, meta) : []),
    [state, windowKey, meta]
  );

  const ctx = useMemo(() => {
    const win = windowRange(windowKey, meta).label;
    const asset = ASSET_OPTIONS.find((o) => o.value === assetClass)?.label ?? 'All';
    const h = horizon === 'p3m' ? '+3 months' : '+6 months';
    return `${win} · ${asset} · ${h}`;
  }, [windowKey, assetClass, horizon, meta]);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Header meta={meta} controls={controls} />

      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div className="sticky top-[112px] z-30 -mx-4 border-b border-black/[0.06] bg-[#f8fafc]/95 px-4 pt-1.5 backdrop-blur sm:-mx-6 sm:px-6">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
        </div>

        <main className="py-5">
          {state.status === 'loading' && <LoadingState />}
          {state.status === 'error' && <ErrorState message={state.error} />}
          {state.status === 'ready' && (
            <>
              {tab === 'scorecard' && (
                <ScorecardTab data={state.data} rows={rows} episodes={episodes} horizon={horizon} ctx={ctx} onOpenCall={setCallOpen} onOpenEpisode={setEpOpen} />
              )}
              {tab === 'calls' && (
                <AllCallsTab data={state.data} rows={rows} episodes={episodes} horizon={horizon} ctx={ctx} onOpenCall={setCallOpen} onOpenEpisode={setEpOpen} />
              )}
              {tab === 'themes' && (
                <ThemesTab data={state.data} rows={rows} episodes={episodes} horizon={horizon} ctx={ctx} onOpenCall={setCallOpen} onOpenEpisode={setEpOpen} />
              )}
              {tab === 'episodes' && (
                <EpisodesTab data={state.data} rows={rows} episodes={episodes} horizon={horizon} ctx={ctx} onOpenCall={setCallOpen} onOpenEpisode={setEpOpen} />
              )}
            </>
          )}
        </main>
      </div>

      {state.status === 'ready' && (
        <>
          <CallDetail row={callOpen} data={state.data} onClose={() => setCallOpen(null)} />
          <EpisodeDetail episode={epOpen} data={state.data} onClose={() => setEpOpen(null)} />
        </>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid place-items-center py-28 text-center">
      <Loader2 className="mb-3 animate-spin text-fdc-green" size={32} />
      <p className="text-[13px] font-medium text-fdc-grey">Loading InvestTalk data…</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-fdc-red/20 bg-fdc-red/[0.04] p-6 text-center">
      <AlertTriangle className="mx-auto mb-2 text-fdc-red" size={28} />
      <h3 className="text-[15px] font-bold text-fdc-ink">Couldn't load the data</h3>
      <p className="mt-1 text-[13px] text-fdc-grey">{message}</p>
    </div>
  );
}
