#!/usr/bin/env node
// enrich-sectors.mjs
// Adds `sector` / `industry` to every row in names.json.
//
// Sector comes from Yahoo's KEYLESS search endpoint (GICS sector + industry for
// equities, e.g. XOM -> Energy / Oil & Gas Integrated). Results are cached in
// scripts/lib/sector-map.json so each symbol is looked up only ONCE — the daily
// run then only resolves brand-new tickers. ETFs / crypto / commodities / index
// have no company sector, so they fall back to an asset-class label.
//
// Keyless and idempotent; runs in the pipeline right after enrich-performance
// (it reads the resolved Yahoo symbol from each row's perf.symbol).

import { resolve } from 'node:path';
import { paths, ROOT, readJSON, writeJSON, sleep } from './lib/util.mjs';

const SECTOR_MAP_PATH = resolve(ROOT, 'scripts/lib/sector-map.json');
const DELAY_MS = 200;
const UA = 'Mozilla/5.0 (compatible; InvestTalkTracker/1.0)';

// Asset-class label when a row has no company sector (ETFs, crypto, …). Stocks
// with no match stay null (shown as "—").
const ASSET_FALLBACK = {
  etf: 'ETF', crypto: 'Crypto', commodity: 'Commodities', index: 'Index',
};

// Look up one symbol's sector/industry via the keyless search endpoint.
// Returns { sector, industry } (either may be null), or { error:true } on a
// transient failure (so we don't poison the cache and can retry next run).
async function lookupSector(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v1/finance/search` +
    `?q=${encodeURIComponent(symbol)}&quotesCount=6&newsCount=0&enableFuzzyQuery=false`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const quotes = (await r.json())?.quotes || [];
      const want = symbol.toUpperCase();
      // Prefer the exact-symbol quote; else the first quote that carries a sector.
      const exact = quotes.find((q) => String(q.symbol || '').toUpperCase() === want);
      const q = exact || quotes.find((x) => x.sector || x.sectorDisp) || quotes[0];
      if (!q) return { sector: null, industry: null };
      return {
        sector: q.sectorDisp || q.sector || null,
        industry: q.industryDisp || q.industry || null,
      };
    } catch (e) {
      if (a === 2) return { error: true };
      await sleep(500 * (a + 1));
    }
  }
  return { error: true };
}

async function main() {
  const names = await readJSON(paths.names, []);
  const cache = await readJSON(SECTOR_MAP_PATH, {});
  if (!names.length) {
    console.log('[sectors] no names — run extract-names/enrich-performance first');
    return;
  }

  // Only STOCK-type symbols are worth a company-sector lookup; ETFs / crypto /
  // commodities / index get an asset-class label with no API call.
  const todo = new Set();
  for (const r of names) {
    const sym = r.perf?.symbol;
    if (sym && r.assetType === 'stock' && !(sym in cache)) todo.add(sym);
  }
  console.log(
    `[sectors] ${names.length} rows; cache has ${Object.keys(cache).length} symbols; ` +
    `${todo.size} new to look up`
  );

  let i = 0, withSector = 0;
  for (const sym of todo) {
    i++;
    const res = await lookupSector(sym);
    if (!res.error) {
      cache[sym] = { sector: res.sector ?? null, industry: res.industry ?? null };
      if (res.sector) withSector++;
    } else {
      console.warn(`[sectors]   ${sym}: lookup failed (will retry next run)`);
    }
    if (i % 25 === 0 || i === todo.size) {
      console.log(`[sectors]   ${i}/${todo.size} looked up`);
    }
    await sleep(DELAY_MS);
  }

  // Assign sector/industry onto every row.
  let assigned = 0;
  for (const r of names) {
    const sym = r.perf?.symbol;
    const hit = sym ? cache[sym] : null;
    let sector = hit?.sector || null;
    const industry = hit?.industry || null;
    if (!sector) sector = ASSET_FALLBACK[r.assetType] || null;
    r.sector = sector;
    r.industry = industry;
    if (sector) assigned++;
  }

  await writeJSON(paths.names, names);
  await writeJSON(SECTOR_MAP_PATH, cache, { pretty: true });
  console.log(
    `[sectors] done: ${assigned}/${names.length} rows have a sector ` +
    `(${withSector} new equity lookups); cache now ${Object.keys(cache).length} symbols`
  );
}

main().catch((e) => {
  console.error('[sectors] FATAL', e);
  process.exit(1);
});
