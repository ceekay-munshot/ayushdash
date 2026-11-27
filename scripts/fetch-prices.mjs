#!/usr/bin/env node
// fetch-prices.mjs
// 2-year weekly price history per resolved symbol (+ benchmarks), for the
// call-detail price chart. Writes public/data/prices/<safe-symbol>.json, which
// the UI lazy-loads on demand. Yahoo can't be called from the browser (CORS),
// so we precompute here — same pattern as transcripts.
//
// Flags: --force  re-fetch even symbols whose file is still fresh.

import { resolve } from 'node:path';
import {
  DATA_DIR, paths, readJSON, writeJSON, ensureDir, fileExists,
  todayISO, addDays, sleep, parseArgs,
} from './lib/util.mjs';
import { yahooFetch } from './lib/yahoo.mjs';

const PRICES_DIR = resolve(DATA_DIR, 'prices');
const YEARS = 2;
const STALE_DAYS = 6;     // daily job skips symbols refreshed within this window
const DELAY_MS = 220;

// Yahoo symbols contain ^ = . - ; make a filesystem/URL-safe file name.
export const safeSymbol = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_');

// Keep ~1 point per trading week (every 5th close) + the latest, so a 2-year
// chart is ~100 points instead of ~500.
function downsample(closes, step = 5) {
  const entries = Object.entries(closes).sort(([a], [b]) => (a < b ? -1 : 1));
  const out = {};
  for (let i = 0; i < entries.length; i++) {
    if (i % step === 0 || i === entries.length - 1) out[entries[i][0]] = entries[i][1];
  }
  return out;
}

async function main() {
  const { flags } = parseArgs();
  const force = Boolean(flags.force);
  await ensureDir(PRICES_DIR);

  const names = await readJSON(paths.names, []);
  const symbols = new Set(['^GSPC', 'BTC-USD']); // benchmarks for overlay
  for (const r of names) if (r.resolved && r.perf?.symbol) symbols.add(r.perf.symbol);
  const list = [...symbols];

  const today = todayISO();
  const from = addDays(today, -(YEARS * 365 + 30));
  console.log(`[prices] ${list.length} symbols · window ${from}..${today}${force ? ' · FORCE' : ''}`);

  let written = 0, fresh = 0, failed = 0, i = 0;
  for (const sym of list) {
    i++;
    const file = resolve(PRICES_DIR, `${safeSymbol(sym)}.json`);
    if (!force && fileExists(file)) {
      const ex = await readJSON(file, null);
      if (ex?.generatedAt && (Date.parse(today) - Date.parse(ex.generatedAt.slice(0, 10))) / 86400000 < STALE_DAYS) {
        fresh++; continue;
      }
    }
    try {
      const { closes, name } = await yahooFetch(sym, from, today);
      await writeJSON(file, {
        symbol: sym, name, generatedAt: new Date().toISOString(), closes: downsample(closes, 5),
      }, { pretty: false });
      written++;
      if (written % 50 === 0) console.log(`[prices]   ${i}/${list.length} (${written} written, ${fresh} fresh, ${failed} fail)`);
    } catch (e) {
      failed++;
      console.warn(`[prices]   FAIL ${sym}: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }
  console.log(`[prices] done: ${written} written · ${fresh} fresh · ${failed} failed · ${list.length} symbols`);
}

main().catch((e) => { console.error('[prices] FATAL', e); process.exit(1); });
