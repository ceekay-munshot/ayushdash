#!/usr/bin/env node
// extract-names.mjs
// For each episode that has a stored transcript but no extraction yet, send the
// transcript to Claude (via Bedrock, forced tool use) and append the extracted
// name-mentions to public/data/names.json and the episode summary to
// public/data/summaries.json. Idempotent: an episode is "done" once it has a
// summaries.json entry (so even 0-name episodes are not re-processed).
//
// Flags:
//   --limit N       process at most N pending episodes (oldest-first)
//   --sample N      process N pending episodes spread evenly across the window
//   --episodes a,b  process exactly these episode ids (comma separated)
//   --force         re-process even already-done episodes (replaces their rows)

import {
  paths, readJSON, writeJSON, fileExists, parseArgs, evenSample,
} from './lib/util.mjs';
import { bedrockJSON, hasBedrockKey, SYSTEM, SCHEMA } from './lib/bedrock.mjs';
import { diarizedText } from './lib/vtt.mjs';

const DECISIONS = new Set(['buy', 'neutral', 'avoid']);
const ASSET_TYPES = new Set(['stock', 'etf', 'crypto', 'commodity', 'index', 'other']);
const MAX_INPUT_CHARS = 180_000; // safety cap; real transcripts are ~50KB

function normName(raw, episode, idx) {
  const assetType = ASSET_TYPES.has(raw.assetType) ? raw.assetType : 'other';
  const decision = DECISIONS.has(raw.decision) ? raw.decision : 'neutral';
  let confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence));
  return {
    nameId: `${episode.id}-n${idx}`,
    episodeId: episode.id,
    date: episode.date,
    ticker: String(raw.ticker || '').trim().toUpperCase(),
    company: String(raw.company || '').trim(),
    assetType,
    decision,
    confidence,
    reasoning: String(raw.reasoning || '').trim(),
    quote: String(raw.quote || '').trim(),
    context: String(raw.context || '').trim(),
  };
}

async function main() {
  const { flags } = parseArgs();

  if (!hasBedrockKey()) {
    console.warn(
      '[extract] BEDROCK_API_KEY not set — skipping extraction. ' +
      '(Scripts are ready; run in GitHub Actions with the secret.)'
    );
    // Ensure the files at least exist so downstream + the site have valid shapes.
    if (!fileExists(paths.names)) await writeJSON(paths.names, []);
    if (!fileExists(paths.summaries)) await writeJSON(paths.summaries, {});
    return;
  }

  const episodes = await readJSON(paths.episodes, []);
  const names = await readJSON(paths.names, []);
  const summaries = await readJSON(paths.summaries, {});
  const force = Boolean(flags.force);

  // Candidates: episodes with a stored transcript.
  let candidates = episodes.filter((e) => fileExists(paths.transcript(e.id)));

  if (flags.episodes) {
    const want = new Set(String(flags.episodes).split(',').map((s) => s.trim()));
    candidates = candidates.filter((e) => want.has(e.id));
  } else if (!force) {
    candidates = candidates.filter((e) => !(e.id in summaries));
  }

  // Oldest-first so partial backfills advance chronologically.
  candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));

  if (flags.sample) candidates = evenSample(candidates, Number(flags.sample));
  if (flags.limit) candidates = candidates.slice(0, Number(flags.limit));

  console.log(`[extract] ${candidates.length} episode(s) to extract${force ? ' (force)' : ''}`);
  if (!candidates.length) return;

  let done = 0, failed = 0, totalNames = 0;
  for (const ep of candidates) {
    const t = await readJSON(paths.transcript(ep.id), null);
    if (!t) { console.warn(`[extract]   no transcript for ${ep.id}, skip`); continue; }

    let input = diarizedText(t);
    if (input.length > MAX_INPUT_CHARS) input = input.slice(0, MAX_INPUT_CHARS);
    const user = `Episode: ${ep.title} (${ep.date})\n\nTranscript:\n${input}`;

    try {
      const out = await bedrockJSON(SYSTEM, user, SCHEMA);
      const rawNames = Array.isArray(out?.names) ? out.names : [];
      const rows = rawNames.map((n, i) => normName(n, ep, i));

      // Replace any existing rows for this episode (relevant with --force).
      for (let i = names.length - 1; i >= 0; i--) {
        if (names[i].episodeId === ep.id) names.splice(i, 1);
      }
      names.push(...rows);

      const s = out?.summary || {};
      summaries[ep.id] = {
        overview: String(s.overview || '').trim(),
        themes: Array.isArray(s.themes) ? s.themes.map((x) => String(x).trim()).filter(Boolean) : [],
        tone: ['bullish', 'bearish', 'mixed', 'neutral'].includes(s.tone) ? s.tone : 'neutral',
        nameCount: rows.length,
      };

      // Persist after each episode so a crash mid-backfill keeps progress.
      // Keep names sorted newest-first for stable diffs.
      names.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.nameId < b.nameId ? 1 : -1));
      await writeJSON(paths.names, names);
      await writeJSON(paths.summaries, summaries);

      done++; totalNames += rows.length;
      console.log(`[extract]   ${ep.date} ${ep.id}: ${rows.length} names (tone ${summaries[ep.id].tone})`);
    } catch (e) {
      failed++;
      console.warn(`[extract]   FAIL ${ep.id} ${ep.date}: ${e.message}`);
    }
  }

  console.log(`[extract] done: ${done} episodes, ${totalNames} names, ${failed} failed`);
}

main().catch((e) => {
  console.error('[extract] FATAL', e);
  process.exit(1);
});
