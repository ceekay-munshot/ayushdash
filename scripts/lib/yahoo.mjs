// Yahoo Finance daily closes (keyless) + performance math.

import { sleep } from './util.mjs';

const UA = 'Mozilla/5.0 (compatible; InvestTalkTracker/1.0)';

// Fetch daily data for a symbol between two ISO dates.
// Returns { closes: { 'YYYY-MM-DD': price }, name } where price is the
// SPLIT-ADJUSTED close (adjclose) when available, else the raw close — so a
// split mid-window doesn't create a phantom jump. `name` is Yahoo's company
// name for the symbol (for match validation). Throws on hard failure.
export async function yahooFetch(symbol, fromISO, toISO) {
  const p1 = Math.floor(new Date(`${fromISO}T00:00:00Z`).getTime() / 1000);
  const p2 = Math.floor(new Date(`${toISO}T23:59:59Z`).getTime() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${p1}&period2=${p2}&interval=1d&events=split`;
  let lastErr;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const res = (await r.json())?.chart?.result?.[0];
      if (!res?.timestamp) throw new Error('no data');
      const adj = res.indicators?.adjclose?.[0]?.adjclose;
      const raw = res.indicators?.quote?.[0]?.close || [];
      const series = Array.isArray(adj) && adj.length === res.timestamp.length ? adj : raw;
      const closes = {};
      for (let i = 0; i < res.timestamp.length; i++) {
        const v = series[i] ?? raw[i];
        if (v == null) continue;
        closes[new Date(res.timestamp[i] * 1000).toISOString().slice(0, 10)] = Number(v.toFixed(4));
      }
      if (!Object.keys(closes).length) throw new Error('empty series');
      const name = res.meta?.longName || res.meta?.shortName || null;
      return { closes, name };
    } catch (e) {
      lastErr = e;
      if (a === 2) throw e;
      await sleep(800 * (a + 1));
    }
  }
  throw lastErr;
}

// Back-compat thin wrapper: just the {date:price} map.
export async function yahooCloses(symbol, fromISO, toISO) {
  return (await yahooFetch(symbol, fromISO, toISO)).closes;
}

// Benchmark symbol for an asset type (null = raw return only, no benchmark).
export function benchmarkFor(assetType) {
  switch (assetType) {
    case 'stock':
    case 'etf':
    case 'index':
      return '^GSPC'; // S&P 500
    case 'crypto':
      return 'BTC-USD';
    case 'commodity':
    case 'other':
    default:
      return null;
  }
}

// From a {date:close} map, the close on `iso` or the nearest EARLIER trading
// day (scan back up to `maxBack` days). Returns { date, price } or null.
export function closeOnOrBefore(map, iso, maxBack = 10) {
  let cur = iso;
  for (let i = 0; i <= maxBack; i++) {
    if (map[cur] != null) return { date: cur, price: map[cur] };
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cur = d.toISOString().slice(0, 10);
  }
  return null;
}

// From a {date:close} map, the close on `iso` or the nearest LATER trading day
// (scan forward up to `maxFwd` days). Returns { date, price } or null.
export function closeOnOrAfter(map, iso, maxFwd = 10) {
  let cur = iso;
  for (let i = 0; i <= maxFwd; i++) {
    if (map[cur] != null) return { date: cur, price: map[cur] };
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return null;
}

// The latest available close in the map (max date key). Returns {date, price}.
export function latestClose(map) {
  const keys = Object.keys(map).sort();
  if (!keys.length) return null;
  const date = keys[keys.length - 1];
  return { date, price: map[date] };
}

// Percentage return from `base` to `price`, 2dp.
export const pctReturn = (price, base) =>
  Number((((price / base) - 1) * 100).toFixed(2));
