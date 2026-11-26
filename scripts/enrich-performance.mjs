#!/usr/bin/env node
// enrich-performance.mjs
// For every row in names.json with a trackable ticker, fetch Yahoo daily closes
// around the mention date and compute +3m / +6m raw return, benchmark return,
// and alpha. Adds a `perf` object (and `resolved` flag) to each row IN PLACE,
// and writes public/data/benchmarks.json. Re-run daily: recomputes ALL rows so
// in-progress windows mature.
//
// Benchmark map: stock/etf/index -> ^GSPC ; crypto -> BTC-USD ; commodity/other -> none.

import { resolve } from 'node:path';
import { paths, ROOT, readJSON, writeJSON, todayISO, addDays, sleep } from './lib/util.mjs';
import {
  yahooFetch, yahooCloses, benchmarkFor, closeOnOrBefore, closeOnOrAfter, latestClose, pctReturn,
} from './lib/yahoo.mjs';

const TICKER_DELAY_MS = 250;
const BENCH_NAMES = { '^GSPC': 'S&P 500', 'BTC-USD': 'Bitcoin (USD)' };
const HORIZONS = [
  { key: 'p3m', days: 91 },
  { key: 'p6m', days: 183 },
];

const OVERRIDES = await readJSON(resolve(ROOT, 'scripts/lib/ticker-overrides.json'), { bySymbol: {}, byCompany: {} });

// Is this a plausible, price-trackable Yahoo symbol?
function isTrackable(ticker) {
  if (!ticker) return false;
  const t = ticker.trim().toUpperCase();
  if (!t || t.length > 15) return false;
  if (/\s/.test(t)) return false;
  if (['N/A', 'NA', 'NONE', 'CASH', '-', '--', 'TBD', 'UNKNOWN', 'PRIVATE'].includes(t)) return false;
  // letters/digits plus the symbol chars Yahoo uses: ^ index, = futures, - pairs/classes, . exchange suffix
  return /^[A-Z0-9.\-=^]+$/.test(t);
}

// Resolve the Yahoo symbol to actually price: a manual override wins, else the
// model's ticker as-is.
function resolveSymbol(row) {
  const t = String(row.ticker || '').trim().toUpperCase();
  if (OVERRIDES.bySymbol?.[t]) return OVERRIDES.bySymbol[t];
  const comp = String(row.company || '').toLowerCase();
  for (const [key, sym] of Object.entries(OVERRIDES.byCompany || {})) {
    if (comp.includes(key)) return sym;
  }
  return t;
}

const SUFFIXES = new Set(['inc', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'plc', 'sa', 'nv', 'ag', 'holdings', 'holding', 'group', 'the', 'etf', 'trust', 'fund', 'class', 'common', 'stock', 'shares', 'adr', 'international', 'technologies', 'technology']);
const normTokens = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !SUFFIXES.has(w));
const despace = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function commonPrefixLen(a, b) {
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i;
}
function trigramSim(a, b) {
  const g = (s) => { const set = new Set(); for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3)); return set; };
  const A = g(a), B = g(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

// Does the Yahoo company name plausibly match the extracted company? Very
// LENIENT — we only reject a CLEAR mismatch (the model's ticker resolved to an
// unrelated company), never a mere formatting/brand difference:
//  - single-word / acronym extracted names are trusted (can't validate by words)
//  - a shared significant word, concatenation ("Exxon Mobil"↔"ExxonMobil"),
//    a long common prefix ("United Healthcare"↔"UnitedHealth Group"), or decent
//    fuzzy similarity all pass.
function companyMatches(extracted, yahooName) {
  if (!yahooName || !extracted) return true;
  const eTok = normTokens(extracted);
  if (eTok.length <= 1) return true; // acronym / single brand word → trust the ticker
  const yTok = new Set(normTokens(yahooName));
  for (const w of eTok) if (yTok.has(w)) return true;
  const ed = despace(extracted), yd = despace(yahooName);
  if (ed.length >= 5 && (yd.includes(ed) || ed.includes(yd))) return true;
  if (commonPrefixLen(ed, yd) >= 6) return true;
  if (trigramSim(ed, yd) >= 0.34) return true;
  return false;
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

  // Group rows by the RESOLVED symbol (after overrides) to fetch each once.
  const bySymbol = new Map();
  for (const row of names) {
    const symbol = resolveSymbol(row);
    if (!isTrackable(symbol)) { row.resolved = false; row.perf = null; continue; }
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(row);
  }
  console.log(`[perf] ${bySymbol.size} unique trackable symbols`);

  let resolved = 0, unresolved = 0, mismatched = 0, i = 0;
  for (const [symbol, rows] of bySymbol) {
    i++;
    const mentionDates = rows.map((r) => r.date).sort();
    const from = addDays(mentionDates[0], -7);
    // Fetch through today (Yahoo clamps the future automatically).
    let series = null, yahooName = null;
    try {
      const res = await yahooFetch(symbol, from, today);
      series = res.closes;
      yahooName = res.name;
    } catch { series = null; }
    if (!series) {
      for (const r of rows) { r.resolved = false; r.perf = null; }
      unresolved += rows.length;
      console.warn(`[perf]   (${i}/${bySymbol.size}) ${symbol}: no data -> ${rows.length} unresolved`);
      await sleep(TICKER_DELAY_MS);
      continue;
    }

    for (const row of rows) {
      // Guard against silently pricing the WRONG company.
      if (!companyMatches(row.company, yahooName)) {
        row.resolved = false; row.perf = null; mismatched++;
        console.warn(`[perf]     mismatch: "${row.company}" (${row.ticker}) != Yahoo "${yahooName}" [${symbol}] -> unresolved`);
        continue;
      }
      const benchSym = benchmarkFor(row.assetType);
      const bench = benchSym ? benchSeries[benchSym] : null;
      const anchor = closeOnOrBefore(series, row.date, 14);
      if (!anchor) { row.resolved = false; row.perf = null; unresolved++; continue; }

      const perf = {
        benchmark: benchSym,
        symbol,
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

  console.log(`[perf] done: ${resolved} resolved · ${unresolved} no-data · ${mismatched} name-mismatch`);
}

main().catch((e) => {
  console.error('[perf] FATAL', e);
  process.exit(1);
});
