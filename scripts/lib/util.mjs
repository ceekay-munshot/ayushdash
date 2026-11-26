// Shared utilities for the InvestTalk data pipeline.
// ES module, Node 22. No external deps.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- paths -----------------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..', '..'); // repo root (scripts/lib -> repo)
export const DATA_DIR = resolve(ROOT, 'public', 'data');
export const TRANSCRIPTS_DIR = resolve(DATA_DIR, 'transcripts');

export const paths = {
  episodes: resolve(DATA_DIR, 'episodes.json'),
  names: resolve(DATA_DIR, 'names.json'),
  summaries: resolve(DATA_DIR, 'summaries.json'),
  benchmarks: resolve(DATA_DIR, 'benchmarks.json'),
  scorecard: resolve(DATA_DIR, 'scorecard.json'),
  metadata: resolve(DATA_DIR, 'metadata.json'),
  transcript: (id) => resolve(TRANSCRIPTS_DIR, `${id}.json`),
};

// ---- config ----------------------------------------------------------------
// Pipeline window: everything on or after this date (UTC).
export const WINDOW_FROM = '2026-01-01';
export const SOURCE = 'InvestTalk podcast (RedCircle RSS)';
export const FEED_URL =
  'https://feeds.redcircle.com/6fb1e853-719d-44d9-8b9e-9d4af81d7a89';

// ---- json io ---------------------------------------------------------------
export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export async function readJSON(file, fallback) {
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`Failed to read/parse ${file}: ${e.message}`);
  }
}

// Write JSON atomically (write temp then rename) so a crash never leaves a
// half-written data file in the repo. Pretty by default for readable diffs;
// pass { pretty:false } for bulky machine-only files (e.g. transcripts).
export async function writeJSON(file, value, { pretty = true } = {}) {
  await ensureDir(dirname(file));
  const tmp = `${file}.tmp-${process.pid}`;
  const body = pretty ? JSON.stringify(value, null, 2) + '\n' : JSON.stringify(value) + '\n';
  await writeFile(tmp, body, 'utf8');
  await rename(tmp, file);
}

export function fileExists(file) {
  return existsSync(file);
}

// ---- misc helpers ----------------------------------------------------------
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Decode the handful of XML/HTML entities that appear in the RedCircle feed,
// including numeric (&#43; -> +, &#x2F; -> /).
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};
export function decodeEntities(str = '') {
  return String(str)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in NAMED ? NAMED[name] : m));
}

// Strip a CDATA wrapper if present.
export function stripCDATA(str = '') {
  const m = String(str).match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : str;
}

// Clean a feed text field: strip CDATA, decode entities, collapse whitespace.
export function cleanText(str = '') {
  return decodeEntities(stripCDATA(str)).replace(/\s+/g, ' ').trim();
}

// Lowercase alphanumeric slug (hyphen separated).
export function slugify(str = '') {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ---- dates -----------------------------------------------------------------
// Today's date as YYYY-MM-DD (UTC).
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Parse an RFC-822 pubDate (entities already possible) into a JS Date.
export function parsePubDate(raw) {
  const d = new Date(decodeEntities(String(raw).trim()));
  return isNaN(d) ? null : d;
}

// A Date -> YYYY-MM-DD (UTC). We work in UTC throughout so counts are stable
// and reproducible (matches the feed's +0000 pubDates).
export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Add days to a YYYY-MM-DD string, return YYYY-MM-DD (UTC arithmetic).
export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Compare YYYY-MM-DD strings lexically (valid because zero-padded ISO).
export const dateLTE = (a, b) => a <= b;
export const dateLT = (a, b) => a < b;

// Simple CLI flag parsing: --limit 5  --sample 6  --episodes a,b,c  --force
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out.flags[key] = true;
      } else {
        out.flags[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// Pick n items evenly spread across an array (for a representative sample).
export function evenSample(arr, n) {
  if (n >= arr.length) return arr.slice();
  if (n <= 0) return [];
  const out = [];
  const step = (arr.length - 1) / (n - 1 || 1);
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]);
  return [...new Set(out)];
}

// fetch with retry/backoff for transient network/5xx errors.
export async function fetchRetry(url, opts = {}, { tries = 3, baseDelay = 600 } = {}) {
  let last;
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) {
        last = new Error(`HTTP ${r.status}`);
        // 4xx (except 429) are not worth retrying.
        if (r.status >= 400 && r.status < 500 && r.status !== 429) throw last;
      } else {
        return r;
      }
    } catch (e) {
      last = e;
    }
    if (a < tries - 1) await sleep(baseDelay * (a + 1));
  }
  throw last;
}
