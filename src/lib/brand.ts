// Palette + colour helpers for every chart & table. Semantic colours drive
// readability: verdicts, returns (green=gain → red=loss), asset classes.
import type { AssetType, Decision } from '../types';

export const BRAND = {
  indigo: '#6366F1',
  violet: '#8B5CF6',
  pink: '#EC4899',
  dark: '#4338CA',
  ink: '#0F172A',
  slate: '#334155',
  grey: '#64748B',
  light: '#CBD5E1',
  // hero gradient (indigo → violet → pink)
  gradient: 'linear-gradient(120deg, #6366F1 0%, #8B5CF6 48%, #EC4899 100%)',
} as const;

export interface VerdictMeta {
  key: Decision;
  color: string;
  dark: string;
  soft: string;
  label: string; // plain-language verdict
  /** plain-language description of a "hit" for this bucket */
  hitLabel: string;
}

export const VERDICT: Record<Decision, VerdictMeta> = {
  buy: { key: 'buy', color: '#10B981', dark: '#059669', soft: '#D1FAE5', label: 'Buy', hitLabel: 'Beat the market' },
  neutral: { key: 'neutral', color: '#F59E0B', dark: '#D97706', soft: '#FEF3C7', label: 'Neutral', hitLabel: '—' },
  avoid: { key: 'avoid', color: '#F43F5E', dark: '#E11D48', soft: '#FFE4E6', label: 'Avoid', hitLabel: 'Right to avoid' },
};

export const DECISIONS: Decision[] = ['buy', 'neutral', 'avoid'];

// Bright categorical set for asset classes / themes.
export const CAT = ['#6366F1', '#3B82F6', '#14B8A6', '#F59E0B', '#F97316', '#A855F7', '#EC4899'];

export const ASSET_COLOR: Record<AssetType, string> = {
  stock: '#6366F1',
  etf: '#3B82F6',
  crypto: '#14B8A6',
  commodity: '#F59E0B',
  index: '#A855F7',
  other: '#94A3B8',
};

export const ASSET_LABEL: Record<AssetType, string> = {
  stock: 'Stocks',
  etf: 'ETFs',
  crypto: 'Crypto',
  commodity: 'Commodities',
  index: 'Indexes',
  other: 'Other',
};

export const BENCH_LABEL: Record<string, string> = {
  '^GSPC': 'S&P 500',
  'BTC-USD': 'Bitcoin',
};
export const benchLabel = (sym: string | null | undefined) =>
  sym ? BENCH_LABEL[sym] ?? sym : 'the market';

export const TONE_COLOR: Record<string, string> = {
  bullish: '#10B981',
  mixed: '#F59E0B',
  neutral: '#64748B',
  bearish: '#F43F5E',
};
export const TONE_LABEL: Record<string, string> = {
  bullish: 'Optimistic',
  mixed: 'Mixed',
  neutral: 'Neutral',
  bearish: 'Cautious',
};

// ---- colour maths ----------------------------------------------------------
export function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => (amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt)));
  const to2 = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Green (good=0) → gold (0.5) → red (bad=1) for intensity 0..1. */
export function rampGYR(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const stops: [number, [number, number, number]][] = [
    [0, [16, 185, 129]], // emerald
    [0.5, [245, 158, 11]], // amber
    [1, [244, 63, 94]], // rose
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (c >= stops[i][0] && c <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const span = b[0] - a[0] || 1;
  const f = (c - a[0]) / span;
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  const ch = [0, 1, 2].map((k) => to2(a[1][k] + (b[1][k] - a[1][k]) * f));
  return `#${ch.join('')}`;
}

/** Solid colour for a signed return %: green gain, red loss, grey flat. */
export function returnColor(pct: number | null | undefined): string {
  if (pct == null || !isFinite(pct)) return '#94A3B8';
  if (pct > 0.05) return '#10B981';
  if (pct < -0.05) return '#F43F5E';
  return '#94A3B8';
}

/** Heat intensity 0..1 for a return/alpha %: gain→0 (green), loss→1 (red). */
export function heatForReturn(pct: number | null | undefined, scale = 20): number | null {
  if (pct == null || !isFinite(pct)) return null;
  const clamped = Math.max(-scale, Math.min(scale, pct));
  return 0.5 - clamped / (2 * scale); // +scale -> 0, -scale -> 1, 0 -> 0.5
}
