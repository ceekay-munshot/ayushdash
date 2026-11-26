#!/usr/bin/env node
// enrich-performance.mjs
// For every row in names.json with a trackable ticker, fetch Yahoo daily closes
// around the mention date and compute +3m / +6m raw return, benchmark return,
// and alpha. Adds a `perf` object (and `resolved` flag) to each row IN PLACE,
// and writes public/data/benchmarks.json. Re-run daily: recomputes ALL rows so
// in-progress windows mature.
//
// Benchmark map: stock/etf/index -> ^GSPC ; crypto -> BTC-USD ; commodity/other -> none.

import { paths, readJSON, writeJSON, todayISO, addDays, sleep } from './lib/util.mjs';
import {
  yahooCloses, benchmarkFor, closeOnOrBefore, closeOnOrAfter, latestClose, pctReturn,
} from './lib/yahoo.mjs';

const TICKER_DELAY_MS = 250;
const BENCH_NAMES = { '^GSPC': 'S&P 500', 'BTC-USD': 'Bitcoin (USD)' };
const HORIZONS = [
  { key: 'p3m', days: 91 },
  { key: 'p6m', days: 183 },
];

// Is this a plausible, price-trackable Yahoo symbol?
function isTrackable(ticker) {
  if (!ticker) return false;
  const t = ticker.trim().toUpperCase();
  if (!t || t.length > 12) return false;
  if (/\s/.test(t)) return false;
  if (['N/A', 'NA', 'NONE', 'CASH', '-', '--', 'TBD', 'UNKNOWN', 'PRIVATE'].includes(t)) return false;
  // letters/digits plus the symbol chars Yahoo uses: ^ (index) = (futures) - . (classes/pairs)
  return /^[A-Z0-9.\-=^]+$/.test(t);
}

// Compute one horizon leg for a stock series (+ optional benchmark legs).
function legFor(series, benchSeries, mentionDate, priceAtMention, targetDate, status) {
  // Stock price at the horizon: on-or-after target if complete; else to-date.
  let point = status === 'complete'
    ? closeOnOrAfter(series, targetDate, 14)
    : latestClose(series);
  if (!point) point = latestClose(series);
  if (!point) return null;

  const ret = pctReturn(point.price, priceAtMention.price);

  let benchReturn = null, alpha = null;
  if (benchSeries) {
    const bMention = closeOnOrBefore(benchSeries, mentionDate, 14);
    const bTarget = closeOnOrBefore(benchSeries, point.date, 14);
    if (bMention && bTarget) {
      benchReturn = pctReturn(bTarget.price, bMention.price);
      alpha = Number((ret - benchReturn).toFixed(2));
    }
  }

  return {
    date: point.date,
    targetDate,
    price: point.price,
    return: ret,
    benchReturn,
    alpha,
    status,
  };
}

async function main() {
  const names = await readJSON(paths.names, []);
  const today = todayISO();
  console.log(`[perf] ${names.length} rows; today=${today}`);

  if (!names.length) {
    await writeJSON(paths.benchmarks, {
      generatedAt: new Date().toISOString(),
      map: { stock: '^GSPC', etf: '^GSPC', index: '^GSPC', crypto: 'BTC-USD', commodity: null, other: null },
      benchmarks: {},
      note: 'No names yet — run extract-names first.',
    });
    console.log('[perf] no names; wrote empty benchmarks.json');
    return;
  }

  // Global window for benchmark fetches.
  const dates = names.map((r) => r.date).sort();
  const globalFrom = addDays(dates[0], -7);

  // Fetch benchmarks once each over the full span.
  const benchSeries = {};
  for (const sym of ['^GSPC', 'BTC-USD']) {
    try {
      benchSeries[sym] = await yahooCloses(sym, globalFrom, today);
      console.log(`[perf] benchmark ${sym}: ${Object.keys(benchSeries[sym]).length} closes`);
    } catch (e) {
      benchSeries[sym] = null;
      console.warn(`[perf] benchmark ${sym} FAILED: ${e.message} (alpha will be null for its rows)`);
    }
    await sleep(TICKER_DELAY_MS);
  }

  // Group rows by ticker to fetch each symbol once.
  const byTicker = new Map();
  for (const row of names) {
    if (!isTrackable(row.ticker)) { row.resolved = false; row.perf = null; continue; }
    const key = row.ticker.trim().toUpperCase();
    if (!byTicker.has(key)) byTicker.set(key, []);
    byTicker.get(key).push(row);
  }
  console.log(`[perf] ${byTicker.size} unique trackable tickers`);

  let resolved = 0, unresolved = 0, i = 0;
  for (const [ticker, rows] of byTicker) {
    i++;
    const mentionDates = rows.map((r) => r.date).sort();
    const from = addDays(mentionDates[0], -7);
    // Fetch through today (Yahoo clamps the future automatically).
    let series = null;
    try {
      series = await yahooCloses(ticker, from, today);
    } catch (e) {
      series = null;
    }
    if (!series) {
      for (const r of rows) { r.resolved = false; r.perf = null; }
      unresolved += rows.length;
      console.warn(`[perf]   (${i}/${byTicker.size}) ${ticker}: no data -> ${rows.length} rows unresolved`);
      await sleep(TICKER_DELAY_MS);
      continue;
    }

    for (const row of rows) {
      const benchSym = benchmarkFor(row.assetType);
      const bench = benchSym ? benchSeries[benchSym] : null;
      const anchor = closeOnOrBefore(series, row.date, 14);
      if (!anchor) { row.resolved = false; row.perf = null; unresolved++; continue; }

      const perf = {
        benchmark: benchSym,
        priceAtMention: anchor.price,
        priceDate: anchor.date,
      };
      for (const h of HORIZONS) {
        const targetDate = addDays(row.date, h.days);
        const status = targetDate <= today ? 'complete' : 'in_progress';
        perf[h.key] = legFor(series, bench, row.date, anchor, targetDate, status);
      }
      row.perf = perf;
      row.resolved = true;
      resolved++;
    }
    console.log(`[perf]   (${i}/${byTicker.size}) ${ticker}: ${rows.length} row(s) resolved`);
    await sleep(TICKER_DELAY_MS);
  }

  // Persist enriched names (keep newest-first order already in file).
  await writeJSON(paths.names, names);

  // Benchmarks file (includes closes for Phase-2 charting).
  await writeJSON(paths.benchmarks, {
    generatedAt: new Date().toISOString(),
    window: { from: globalFrom, to: today },
    map: { stock: '^GSPC', etf: '^GSPC', index: '^GSPC', crypto: 'BTC-USD', commodity: null, other: null },
    benchmarks: Object.fromEntries(
      Object.entries(benchSeries)
        .filter(([, s]) => s)
        .map(([sym, s]) => [sym, { symbol: sym, name: BENCH_NAMES[sym] || sym, closes: s }])
    ),
  });

  console.log(`[perf] done: ${resolved} resolved, ${unresolved} unresolved`);
}

main().catch((e) => {
  console.error('[perf] FATAL', e);
  process.exit(1);
});
