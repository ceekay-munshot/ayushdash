#!/usr/bin/env node
// build-scorecard.mjs
// Read names.json (+ episodes/summaries for coverage) and write:
//   public/data/scorecard.json  — headline counts & performance aggregates
//   public/data/metadata.json   — { generatedAt, window, episodeCount, nameCount, source }
//
// Performance stats are computed over COMPLETE horizon legs only (target date
// already reached); in-progress legs are counted separately but excluded from
// averages/win-rates so the headline numbers aren't skewed by immature windows.

import {
  paths, readJSON, writeJSON, todayISO, WINDOW_FROM, SOURCE,
} from './lib/util.mjs';

const DECISIONS = ['buy', 'neutral', 'avoid'];
const ASSET_TYPES = ['stock', 'etf', 'crypto', 'commodity', 'index', 'other'];
const HORIZONS = ['p3m', 'p6m'];

const round2 = (n) => (n == null ? null : Number(n.toFixed(2)));
const mean = (arr) => (arr.length ? round2(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
const pctRate = (num, den) => (den ? round2((num / den) * 100) : null);

// Build a stats cell for a set of rows at one horizon. Computes two hit rates:
// DIRECTION (buy went up / avoid fell) and BEAT-MARKET (beat/lagged benchmark).
function cell(rows, horizon) {
  let complete = 0, inProgress = 0;
  const returns = [], alphas = [];
  let dirWins = 0, dirN = 0, beatWins = 0, beatN = 0;

  for (const r of rows) {
    const leg = r.perf?.[horizon];
    if (!leg) continue;
    if (leg.status === 'in_progress') { inProgress++; continue; }
    complete++;
    if (leg.return != null) returns.push(leg.return);
    if (leg.alpha != null) alphas.push(leg.alpha);
    if (r.decision !== 'buy' && r.decision !== 'avoid') continue;

    // direction — did the stock move the way they implied?
    if (leg.return != null) {
      dirN++; const up = leg.return > 0; if (r.decision === 'buy' ? up : !up) dirWins++;
    }
    // beat the market — alpha sign, raw-return fallback with no benchmark
    const hasBench = leg.benchReturn != null && leg.alpha != null;
    const metric = hasBench ? leg.alpha : leg.return;
    if (metric != null) {
      beatN++; const good = r.decision === 'buy' ? metric > 0 : metric < 0; if (good) beatWins++;
    }
  }

  return {
    n: complete,
    inProgress,
    avgReturn: mean(returns),
    avgAlpha: mean(alphas),
    dirHits: dirWins, dirN, dirRate: pctRate(dirWins, dirN),
    beatHits: beatWins, beatN, beatRate: pctRate(beatWins, beatN),
  };
}

function perfBlock(rows) {
  const out = {};
  for (const h of HORIZONS) out[h] = cell(rows, h);
  return out;
}

function countBy(rows, field, keys) {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) if (r[field] in out) out[r[field]]++;
  return out;
}

// Best/worst complete calls by alpha (prefer p6m, fall back to p3m).
function rankCalls(rows) {
  const scored = [];
  for (const r of rows) {
    let leg = r.perf?.p6m, horizon = 'p6m';
    if (!leg || leg.status !== 'complete' || leg.alpha == null) {
      leg = r.perf?.p3m; horizon = 'p3m';
    }
    if (!leg || leg.status !== 'complete' || leg.alpha == null) continue;
    scored.push({
      nameId: r.nameId, episodeId: r.episodeId, ticker: r.ticker, company: r.company,
      decision: r.decision, assetType: r.assetType, date: r.date,
      horizon, return: leg.return, alpha: leg.alpha, benchmark: r.perf.benchmark,
    });
  }
  const byAlphaDesc = [...scored].sort((a, b) => b.alpha - a.alpha);
  return {
    best: byAlphaDesc.slice(0, 5),
    worst: byAlphaDesc.slice(-5).reverse(),
  };
}

async function main() {
  const names = await readJSON(paths.names, []);
  const episodes = await readJSON(paths.episodes, []);
  const summaries = await readJSON(paths.summaries, {});
  const today = todayISO();

  // Real calls only (caller questions + host opinions) drive every stat;
  // market-recap mentions are counted separately but never scored.
  const real = names.filter((r) => r.mentionType !== 'market_recap');
  const recapMentions = names.length - real.length;
  const resolved = real.filter((r) => r.resolved);
  const dates = real.map((r) => r.date).sort();

  const byDecisionRows = Object.fromEntries(
    DECISIONS.map((d) => [d, resolved.filter((r) => r.decision === d)])
  );

  const scorecard = {
    generatedAt: new Date().toISOString(),
    window: { from: WINDOW_FROM, to: today },
    coverage: {
      episodes: episodes.length,
      withTranscript: episodes.filter((e) => e.hasTranscript).length,
      extracted: Object.keys(summaries).length,
    },
    totals: {
      names: names.length,
      realCalls: real.length,
      recapMentions,
      resolved: resolved.length,
      unresolved: real.length - resolved.length,
      episodesWithNames: new Set(real.map((r) => r.episodeId)).size,
      dateCoverage: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    },
    byDecision: countBy(real, 'decision', DECISIONS),
    byAssetType: countBy(real, 'assetType', ASSET_TYPES),
    performance: {
      overall: perfBlock(resolved),
      buy: perfBlock(byDecisionRows.buy),
      neutral: perfBlock(byDecisionRows.neutral),
      avoid: perfBlock(byDecisionRows.avoid),
    },
    topCalls: rankCalls(resolved),
  };

  await writeJSON(paths.scorecard, scorecard);

  await writeJSON(paths.metadata, {
    generatedAt: scorecard.generatedAt,
    window: scorecard.window,
    episodeCount: episodes.length,
    nameCount: names.length,
    source: SOURCE,
  });

  console.log(
    `[scorecard] names=${names.length} (real=${real.length} recap=${recapMentions}) resolved=${resolved.length} ` +
    `buy=${scorecard.byDecision.buy} neutral=${scorecard.byDecision.neutral} avoid=${scorecard.byDecision.avoid}`
  );
  console.log(`[scorecard] wrote scorecard.json + metadata.json`);
}

main().catch((e) => {
  console.error('[scorecard] FATAL', e);
  process.exit(1);
});
