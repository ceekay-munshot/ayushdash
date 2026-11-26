import { Radio } from 'lucide-react';
import type { Metadata } from '../types';
import { Segmented, Dropdown } from './ui/Controls';
import { ASSET_OPTIONS, WINDOW_OPTIONS, type AssetClass, type WindowKey, type Horizon } from '../lib/data';
import { ASSET_COLOR } from '../lib/brand';
import { datetimeLabel } from '../lib/format';

export interface GlobalControls {
  assetClass: AssetClass;
  setAssetClass: (v: AssetClass) => void;
  windowKey: WindowKey;
  setWindowKey: (v: WindowKey) => void;
  horizon: Horizon;
  setHorizon: (v: Horizon) => void;
}

const ASSET_SEG = ASSET_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
  color: o.value === 'all' ? '#6366F1' : ASSET_COLOR[o.value as Exclude<AssetClass, 'all'>],
}));

const HORIZON_SEG = [
  { value: 'p3m' as Horizon, label: '+3 months' },
  { value: 'p6m' as Horizon, label: '+6 months' },
];

export function Header({ meta, controls }: { meta?: Metadata | null; controls: GlobalControls }) {
  return (
    <header className="sticky top-0 z-40">
      {/* brand gradient bar */}
      <div className="text-white" style={{ background: 'linear-gradient(120deg, #6366F1 0%, #8B5CF6 48%, #EC4899 100%)' }}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/20 text-[15px] font-black">IT</span>
            <div className="leading-tight">
              <h1 className="text-[16px] font-extrabold tracking-tight sm:text-[17px]">InvestTalk Scorecard</h1>
              <p className="hidden text-[11px] font-medium text-white/80 sm:block">
                Are the podcast's stock calls any good?
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
            <Radio size={12} className="animate-pulse" />
            Live · updated {meta ? datetimeLabel(meta.generatedAt).replace(', ', ' · ') : '—'}
          </span>
        </div>
      </div>

      {/* controls strip */}
      <div className="border-b border-black/[0.06] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-end gap-x-5 gap-y-2.5 px-4 py-2.5 sm:px-6">
          <Control label="Asset class">
            <Segmented value={controls.assetClass} options={ASSET_SEG} onChange={controls.setAssetClass} />
          </Control>
          <Control label="Window">
            <Dropdown value={controls.windowKey} options={WINDOW_OPTIONS} onChange={controls.setWindowKey} width={200} />
          </Control>
          <Control label="Performance horizon">
            <Segmented value={controls.horizon} options={HORIZON_SEG} onChange={controls.setHorizon} />
          </Control>
        </div>
      </div>
    </header>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-fdc-grey">{label}</div>
      {children}
    </div>
  );
}
