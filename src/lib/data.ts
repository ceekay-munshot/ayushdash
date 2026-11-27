// Data loading + all client-side aggregation. Every headline figure is
// computed here from names.json so the global toggles re-filter live.
import { useEffect, useState } from 'react';
import type {
  Episode, NameRow, EpisodeSummary, Metadata, Scorecard, Benchmarks, Transcript,
  Decision, AssetType, PerfLeg,
} from '../types';

const BASE = import.meta.env.BASE_URL;

export type Horizon = 'p3m' | 'p6m';
export type WindowKey = 'all' | 'y2025h2' | 'study' | 'last3';
export type AssetClass = 'all' | AssetType;

export interface Dataset {
  episodes: Episode[];
  names: NameRow[];
  summaries: Record<string, EpisodeSummary>;
  benchmarks: Benchmarks | null;
  scorecard: Scorecard | null;
  meta: Metadata | null;
}

export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: Dataset };

async function getJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${BASE}data/${path}`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export function useAppData(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [episodes, names, summaries, benchmarks, scorecard, meta] = await Promise.all([
          getJSON<Episode[]>('episodes.json', []),
          getJSON<NameRow[]>('names.json', []),
          getJSON<Record<string, EpisodeSummary>>('summaries.json', {}),
          getJSON<Benchmarks | null>('benchmarks.json', null),
          getJSON<Scorecard | null>('scorecard.json', null),
          getJSON<Metadata | null>('metadata.json', null),
        ]);
        if (!alive) return;
        if (!episodes.length) {
          setState({ status: 'error', error: 'No episode data found in /data. Run the pipeline first.' });
          return;
        }
        setState({ status: 'ready', data: { episodes, names, summaries, benchmarks, scorecard, meta } });
      } catch (e) {
        if (alive) setState({ status: 'error', error: (e as Error).message });
      }
    })();
    return () => { alive = false; };
  }, []);
  return state;
}

const transcriptCache = new Map<string, Transcript | null>();
export async function loadTranscript(id: string): Promise<Transcript | null> {
  if (transcriptCache.has(id)) return transcriptCache.get(id)!;
  const t = await getJSON<Transcript | null>(`transcripts/${id}.json`, null);
  transcriptCache.set(id, t);
  return t;
}

// 2-year weekly price history, lazy-loaded per symbol for the call-detail chart.
export interface PriceSeries { symbol: string; name: string; closes: Record<string, number>; generatedAt?: string }
export const safeSymbol = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
const priceCache = new Map<string, PriceSeries | null>();
export async function loadPrices(symbol: string): Promise<PriceSeries | null> {
  const key = safeSymbol(symbol);
  if (priceCache.has(key)) return priceCache.get(key)!;
  const s = await getJSON<PriceSeries | null>(`prices/${key}.json`, null);
  priceCache.set(key, s);
  return s;
}

// ---- windows ---------------------------------------------------------------
function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDaysISO(iso: string, d: number) {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + d);
  return dt.toISOString().slice(0, 10);
}

export function windowRange(w: WindowKey, meta: Metadata | null): { from: string; to: string; label: string } {
  const to = meta?.window?.to ?? todayISO();
  const from = meta?.window?.from ?? '2026-01-01';
  if (w === 'y2025h2') return { from: '2025-07-01', to: '2025-12-31', label: 'Jul–Dec 2025' };
  if (w === 'study') return { from: '2026-01-01', to: '2026-06-30', label: 'Jan–Jun 2026 study' };
  if (w === 'last3') return { from: addDaysISO(todayISO(), -92), to: todayISO(), label: 'Last 3 months' };
  return { from, to, label: 'All time' };
}

export const WINDOW_OPTIONS: { value: WindowKey; label: string }[] = [
  { value: 'all', label: 'All time (live)' },
  { value: 'y2025h2', label: '2025 (Jul–Dec)' },
  { value: 'study', label: 'Study: Jan–Jun 2026' },
  { value: 'last3', label: 'Last 3 months' },
];

export const ASSET_OPTIONS: { value: AssetClass; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'stock', label: 'Stocks' },
  { value: 'etf', label: 'ETFs' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'commodity', label: 'Commodities' },
];

// A "real call" is a caller question or a host opinion — NOT a market-recap
// mention. Rows without mentionType (pre-Phase-3 data) count as real calls.
export const isRealCall = (r: NameRow) => r.mentionType !== 'market_recap';
export const isRecap = (r: NameRow) => r.mentionType === 'market_recap';

// ---- filtering -------------------------------------------------------------
export function filterNames(
  names: NameRow[],
  assetClass: AssetClass,
  w: WindowKey,
  meta: Metadata | null,
  includeRecap = false
): NameRow[] {
  const { from, to } = windowRange(w, meta);
  return names.filter((n) => {
    if (!includeRecap && isRecap(n)) return false;
    if (n.date < from || n.date > to) return false;
    if (assetClass !== 'all' && n.assetType !== assetClass) return false;
    return true;
  });
}

export function filterEpisodes(
  episodes: Episode[],
  w: WindowKey,
  meta: Metadata | null
): Episode[] {
  const { from, to } = windowRange(w, meta);
  return episodes.filter((e) => e.date >= from && e.date <= to);
}

// ---- performance helpers ---------------------------------------------------
export const legOf = (n: NameRow, h: Horizon): PerfLeg | null | undefined => n.perf?.[h];
export const hasBench = (n: NameRow, leg: PerfLeg | null | undefined) =>
  !!n.perf?.benchmark && leg?.benchReturn != null && leg?.alpha != null;

/** DIRECTION: did the stock move the way the call implied? buy→up, avoid→down.
 *  The plain, intuitive measure. null for neutral / not-yet-closed. */
export function isDirectionHit(n: NameRow, h: Horizon): boolean | null {
  const leg = legOf(n, h);
  if (!leg || leg.status !== 'complete' || leg.return == null) return null;
  if (n.decision === 'buy') return leg.return > 0;
  if (n.decision === 'avoid') return leg.return < 0;
  return null;
}

/** BEAT THE MARKET: did the call beat its benchmark? buy→alpha>0, avoid→alpha<0.
 *  Falls back to raw-return sign when there's no benchmark (commodities). */
export function isBeatMarketHit(n: NameRow, h: Horizon): boolean | null {
  const leg = legOf(n, h);
  if (!leg || leg.status !== 'complete') return null;
  const bench = hasBench(n, leg);
  if (n.decision === 'buy') return bench ? (leg.alpha as number) > 0 : leg.return != null ? leg.return > 0 : null;
  if (n.decision === 'avoid') return bench ? (leg.alpha as number) < 0 : leg.return != null ? leg.return < 0 : null;
  return null;
}

/** The live "so far" return for a still-maturing call: taken from whichever
 *  window is still in-progress (that leg is priced at the latest close), plus
 *  how many days have elapsed since the mention. null once fully matured. */
export interface ToDate { return: number; alpha: number | null; days: number; benchmark: string | null }
export function toDateProgress(r: NameRow): ToDate | null {
  const p6 = r.perf?.p6m, p3 = r.perf?.p3m;
  const leg = p6?.status === 'in_progress' ? p6 : p3?.status === 'in_progress' ? p3 : null;
  if (!leg) return null;
  const days = Math.round(
    (Date.parse(`${leg.date}T00:00:00Z`) - Date.parse(`${r.date}T00:00:00Z`)) / 86400000
  );
  return { return: leg.return, alpha: leg.alpha, days, benchmark: r.perf?.benchmark ?? null };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

export interface BucketStat {
  decision: Decision | 'overall';
  total: number; // resolved rows in bucket (any status)
  complete: number;
  inProgress: number;
  avgReturn: number | null;
  avgBench: number | null;
  avgAlpha: number | null;
  // DIRECTION: stock moved the way they implied (buy↑ / avoid↓)
  dirHits: number;
  dirN: number;
  dirRate: number | null; // %
  // BEAT THE MARKET: beat/lagged the benchmark
  beatHits: number;
  beatN: number;
  beatRate: number | null; // %
}

const rate = (hits: number, n: number) => (n ? Math.round((hits / n) * 1000) / 10 : null);

function statFor(rows: NameRow[], decision: Decision | 'overall', h: Horizon): BucketStat {
  // Performance math is ALWAYS over real calls — recap mentions never count.
  const real = rows.filter(isRealCall);
  const inBucket = decision === 'overall' ? real : real.filter((r) => r.decision === decision);
  const resolved = inBucket.filter((r) => r.resolved && r.perf);
  const returns: number[] = [], benches: number[] = [], alphas: number[] = [];
  let complete = 0, inProgress = 0, dirHits = 0, dirN = 0, beatHits = 0, beatN = 0;
  for (const r of resolved) {
    const leg = legOf(r, h);
    if (!leg) continue;
    if (leg.status === 'in_progress') { inProgress++; continue; }
    complete++;
    returns.push(leg.return);
    if (leg.benchReturn != null) benches.push(leg.benchReturn);
    if (leg.alpha != null) alphas.push(leg.alpha);
    const dh = isDirectionHit(r, h); if (dh != null) { dirN++; if (dh) dirHits++; }
    const bh = isBeatMarketHit(r, h); if (bh != null) { beatN++; if (bh) beatHits++; }
  }
  return {
    decision,
    total: resolved.length,
    complete,
    inProgress,
    avgReturn: round2(avg(returns)),
    avgBench: round2(avg(benches)),
    avgAlpha: round2(avg(alphas)),
    dirHits, dirN, dirRate: rate(dirHits, dirN),
    beatHits, beatN, beatRate: rate(beatHits, beatN),
  };
}

export interface Scores {
  overall: BucketStat;
  buy: BucketStat;
  neutral: BucketStat;
  avoid: BucketStat;
}
export function computeScores(rows: NameRow[], h: Horizon): Scores {
  return {
    overall: statFor(rows, 'overall', h),
    buy: statFor(rows, 'buy', h),
    neutral: statFor(rows, 'neutral', h),
    avoid: statFor(rows, 'avoid', h),
  };
}

// ---- rankings / rollups ----------------------------------------------------
export interface RankedCall {
  row: NameRow;
  leg: PerfLeg;
  horizon: Horizon;
  edge: number; // decision-aware "how right the call was": buy→return, avoid→−return
  alpha: number | null;
}
// Best/worst = how RIGHT the call was, direction-aware. A Buy is good when the
// stock rose; an Avoid is good when it fell (so avoiding a crash is a WIN, and
// avoiding a rocket is a MISS). Neutral calls have no direction → excluded.
export function bestWorst(rows: NameRow[], h: Horizon, k = 5): { best: RankedCall[]; worst: RankedCall[] } {
  const scored: RankedCall[] = [];
  for (const r of rows) {
    if (!isRealCall(r) || (r.decision !== 'buy' && r.decision !== 'avoid')) continue;
    const leg = legOf(r, h);
    if (!r.resolved || !leg || leg.status !== 'complete' || leg.return == null) continue;
    const edge = r.decision === 'avoid' ? -leg.return : leg.return;
    scored.push({ row: r, leg, horizon: h, edge, alpha: leg.alpha });
  }
  const desc = [...scored].sort((a, b) => b.edge - a.edge);
  return { best: desc.slice(0, k), worst: desc.slice(-k).reverse() };
}

export interface CompanyRoll {
  ticker: string;
  company: string;
  assetType: AssetType;
  mentions: number;
  buy: number;
  neutral: number;
  avoid: number;
  latestDate: string;
  latestDecision: Decision;
  avgReturn: number | null;
  avgAlpha: number | null;
  resolvedAny: boolean;
}
export function rollupByCompany(rows: NameRow[], h: Horizon): CompanyRoll[] {
  const map = new Map<string, NameRow[]>();
  for (const r of rows) {
    const key = r.ticker || r.company || r.nameId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  const out: CompanyRoll[] = [];
  for (const [ticker, rs] of map) {
    const sorted = [...rs].sort((a, b) => (a.date < b.date ? 1 : -1));
    const latest = sorted[0];
    const returns: number[] = [], alphas: number[] = [];
    for (const r of rs) {
      if (!isRealCall(r)) continue; // recap mentions never enter perf averages
      const leg = legOf(r, h);
      if (leg && leg.status === 'complete') {
        returns.push(leg.return);
        if (leg.alpha != null) alphas.push(leg.alpha);
      }
    }
    out.push({
      ticker,
      company: latest.company || ticker,
      assetType: latest.assetType,
      mentions: rs.length,
      buy: rs.filter((r) => r.decision === 'buy').length,
      neutral: rs.filter((r) => r.decision === 'neutral').length,
      avoid: rs.filter((r) => r.decision === 'avoid').length,
      latestDate: latest.date,
      latestDecision: latest.decision,
      avgReturn: round2(avg(returns)),
      avgAlpha: round2(avg(alphas)),
      resolvedAny: rs.some((r) => r.resolved),
    });
  }
  return out.sort((a, b) => b.mentions - a.mentions);
}

/** Net-verdict colour key for a set of mentions (which bucket dominates). */
export function netVerdict(buy: number, neutral: number, avoid: number): Decision {
  if (buy >= neutral && buy >= avoid) return 'buy';
  if (avoid >= buy && avoid >= neutral) return 'avoid';
  return 'neutral';
}

export interface Discussed {
  ticker: string;
  company: string;
  mentions: number;
  net: Decision;
  buy: number;
  neutral: number;
  avoid: number;
}
export function mostDiscussed(rows: NameRow[], k = 15): Discussed[] {
  const rolls = rollupByCompany(rows, 'p6m');
  return rolls.slice(0, k).map((r) => ({
    ticker: r.ticker,
    company: r.company,
    mentions: r.mentions,
    net: netVerdict(r.buy, r.neutral, r.avoid),
    buy: r.buy, neutral: r.neutral, avoid: r.avoid,
  }));
}

export function assetMix(rows: NameRow[]): { type: AssetType; count: number }[] {
  const counts = new Map<AssetType, number>();
  for (const r of rows) counts.set(r.assetType, (counts.get(r.assetType) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

export function themeFrequency(
  summaries: Record<string, EpisodeSummary>,
  episodeIds: Set<string>,
  k = 12
): { theme: string; count: number }[] {
  // Group case-insensitively but DISPLAY the first-seen original spelling, so
  // canonical themes keep their acronym casing ("AI & datacenters", not "Ai …").
  const counts = new Map<string, number>();
  const display = new Map<string, string>();
  for (const [id, s] of Object.entries(summaries)) {
    if (!episodeIds.has(id)) continue;
    for (const raw of s.themes ?? []) {
      const t = raw.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!display.has(key)) display.set(key, t);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ theme: display.get(key) ?? key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, k);
}

const TONE_SCORE: Record<string, number> = { bullish: 100, mixed: 50, neutral: 50, bearish: 0 };
export function toneSeries(
  episodes: Episode[],
  summaries: Record<string, EpisodeSummary>
): { month: string; value: number | null; episodes: number }[] {
  const byMonth = new Map<string, number[]>();
  for (const e of episodes) {
    const s = summaries[e.id];
    if (!s) continue;
    const month = e.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(TONE_SCORE[s.tone] ?? 50);
  }
  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, vals]) => ({ month, value: round2(avg(vals)), episodes: vals.length }));
}

/** Count of real calls per episode id (recap mentions excluded). */
export function callsByEpisode(names: NameRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const n of names) {
    if (isRecap(n)) continue;
    m.set(n.episodeId, (m.get(n.episodeId) ?? 0) + 1);
  }
  return m;
}
