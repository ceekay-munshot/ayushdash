// Shared types mirroring the on-disk JSON schemas in public/data/.
// Phase 2 UI builds on these.

export type Decision = 'buy' | 'neutral' | 'avoid';
export type AssetType = 'stock' | 'etf' | 'crypto' | 'commodity' | 'index' | 'other';
export type Tone = 'bullish' | 'bearish' | 'mixed' | 'neutral';
export type PerfStatus = 'complete' | 'in_progress';

export interface Episode {
  id: string;
  date: string; // YYYY-MM-DD (UTC)
  title: string;
  link: string;
  audioUrl: string;
  durationSec: number | null;
  transcriptUrl: string | null;
  hasTranscript: boolean;
}

export interface TranscriptSegment {
  start: number; // seconds
  speaker: string | null; // e.g. "SPEAKER_01"
  text: string;
}

export interface Transcript {
  id: string;
  text: string;
  segments: TranscriptSegment[];
}

export interface PerfLeg {
  date: string; // trading day actually used
  targetDate: string; // mentionDate + 91/183 days
  price: number;
  return: number; // % vs priceAtMention
  benchReturn: number | null; // % over the same two dates
  alpha: number | null; // return - benchReturn
  status: PerfStatus;
}

export interface Perf {
  benchmark: string | null; // "^GSPC" | "BTC-USD" | null
  priceAtMention: number;
  priceDate: string;
  p3m: PerfLeg | null;
  p6m: PerfLeg | null;
}

export interface NameRow {
  nameId: string;
  episodeId: string;
  date: string;
  ticker: string;
  company: string;
  assetType: AssetType;
  decision: Decision;
  confidence: number;
  reasoning: string;
  quote: string;
  context: string;
  perf?: Perf | null;
  resolved?: boolean;
}

export interface EpisodeSummary {
  overview: string;
  themes: string[];
  tone: Tone;
  nameCount: number;
}

export interface Metadata {
  generatedAt: string;
  window: { from: string; to: string };
  episodeCount: number;
  nameCount: number;
  source: string;
}

export interface PerfCell {
  n: number;
  inProgress: number;
  avgReturn: number | null;
  avgAlpha: number | null;
  winRate: number | null;
  winRateBasis: 'positive_alpha' | 'negative_return';
}

export interface Scorecard {
  generatedAt: string;
  window: { from: string; to: string };
  coverage: { episodes: number; withTranscript: number; extracted: number };
  totals: {
    names: number;
    resolved: number;
    unresolved: number;
    episodesWithNames: number;
    dateCoverage: { from: string; to: string } | null;
  };
  byDecision: Record<Decision, number>;
  byAssetType: Record<AssetType, number>;
  performance: Record<'overall' | Decision, { p3m: PerfCell; p6m: PerfCell }>;
  topCalls: { best: RankedCall[]; worst: RankedCall[] };
}

export interface RankedCall {
  nameId: string;
  episodeId: string;
  ticker: string;
  company: string;
  decision: Decision;
  assetType: AssetType;
  date: string;
  horizon: 'p3m' | 'p6m';
  return: number;
  alpha: number;
  benchmark: string | null;
}
