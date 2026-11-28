import { Radio } from 'lucide-react';
import type { Metadata } from '../types';
import { Segmented, Dropdown, Toggle } from './ui/Controls';
import { ASSET_OPTIONS, WINDOW_OPTIONS, type AssetClass, type WindowKey, type Horizon } from '../lib/data';
import { ASSET_COLOR } from '../lib/brand';
import { datetimeLabel } from '../lib/format';

export interface GlobalControls {
  assetClass: AssetClass;
  setAssetClass: (v: AssetClass) => void;
  windowKey: WindowKey;
  setWindowKey: (v: WindowKey) => void;
  customRange: { from: string; to: string };
  setCustomRange: (v: { from: string; to: string }) => void;
  dataSpan: { from: string; to: string } | null;
  horizon: Horizon;
  setHorizon: (v: Horizon) => void;
  realCallsOnly: boolean;
  setRealCallsOnly: (v: boolean) => void;
}

const ASSET_SEG = ASSET_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
  color: o.value === 'all' ? '#6366F1' : ASSET_COLOR[o.value as Exclude<AssetClass, 'all'>],
}));

const HORIZON_SEG = [
  { value: 'p3m' as Horizon, label: '+3mo' },
  { value: 'p6m' as Horizon, label: '+6mo' },
  { value: 'p9m' as Horizon, label: '+9mo' },
  { value: 'p12m' as Horizon, label: '+12mo' },
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
            <div className="flex items-center gap-2">
              <Dropdown value={controls.windowKey} options={WINDOW_OPTIONS} onChange={controls.setWindowKey} width={168} />
              {controls.windowKey === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <DateInput
                    value={controls.customRange.from}
                    min={controls.dataSpan?.from}
                    max={controls.customRange.to || controls.dataSpan?.to}
                    onChange={(from) => controls.setCustomRange({ ...controls.customRange, from })}
                  />
                  <span className="text-[12px] font-semibold text-fdc-grey">→</span>
                  <DateInput
                    value={controls.customRange.to}
                    min={controls.customRange.from || controls.dataSpan?.from}
                    max={controls.dataSpan?.to}
                    onChange={(to) => controls.setCustomRange({ ...controls.customRange, to })}
                  />
                </div>
              )}
            </div>
          </Control>
          <Control label="Performance horizon">
            <Segmented value={controls.horizon} options={HORIZON_SEG} onChange={controls.setHorizon} />
          </Control>
          <Control label="Call type">
            <div className="flex h-[34px] items-center">
              <Toggle
                checked={controls.realCallsOnly}
                onChange={controls.setRealCallsOnly}
                label="Real calls only"
              />
            </div>
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

function DateInput({
  value, min, max, onChange,
}: { value: string; min?: string; max?: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="h-[34px] rounded-xl border border-black/10 bg-white px-2.5 text-[12.5px] font-medium text-fdc-ink shadow-sm outline-none focus:border-fdc-green/50"
    />
  );
}
