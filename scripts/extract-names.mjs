#!/usr/bin/env node
// extract-names.mjs
// For each episode that has a stored transcript but no extraction yet, send the
// transcript to Claude (via Bedrock, forced tool use) and append the extracted
// name-mentions to public/data/names.json and the episode summary to
// public/data/summaries.json. Idempotent: an episode is "done" once it has a
// summaries.json entry (so even 0-name episodes are not re-processed).
//
// Flags:
//   --limit N        process at most N pending episodes (oldest-first)
//   --sample N       process N pending episodes spread evenly across the window
//   --episodes a,b   process exactly these episode ids (comma separated)
//   --force          re-process even already-done episodes (replaces their rows)
//   --commit-every N commit+push names.json+summaries.json every N episodes
//                    (CI durability so each episode is paid for exactly once)

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  paths, ROOT, readJSON, writeJSON, fileExists, parseArgs, evenSample,
} from './lib/util.mjs';
import { bedrockJSON, hasBedrockKey, SYSTEM, SCHEMA } from './lib/bedrock.mjs';
import { diarizedText } from './lib/vtt.mjs';

const DECISIONS = new Set(['buy', 'neutral', 'avoid']);
const ASSET_TYPES = new Set(['stock', 'etf', 'crypto', 'commodity', 'index', 'other']);
const MENTION_TYPES = new Set(['caller_question', 'host_opinion', 'market_recap']);
const MAX_INPUT_CHARS = 180_000; // safety cap; real transcripts are ~50KB

function normName(raw, episode, idx) {
  const assetType = ASSET_TYPES.has(raw.assetType) ? raw.assetType : 'other';
  const decision = DECISIONS.has(raw.decision) ? raw.decision : 'neutral';
  // Default to a real call when missing/invalid so older data stays counted.
  const mentionType = MENTION_TYPES.has(raw.mentionType) ? raw.mentionType : 'host_opinion';
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
    mentionType,
    decision,
    confidence,
    reasoning: String(raw.reasoning || '').trim(),
    quote: String(raw.quote || '').trim(),
    context: String(raw.context || '').trim(),
  };
}

// Commit + push the two extraction files mid-run (best-effort; never aborts).
function batchCommit(label) {
  try {
    execFileSync('bash', [
      resolve(ROOT, '.github/scripts/commit-data.sh'), label,
      'public/data/names.json', 'public/data/summaries.json',
    ], { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.warn(`[extract]   batch commit skipped: ${e.message}`);
  }
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
  const commitEvery = Number(flags['commit-every'] ?? process.env.EXTRACT_COMMIT_EVERY ?? 0) || 0;

  // Candidates: episodes with a stored transcript.
  const withTranscript = episodes.filter((e) => fileExists(paths.transcript(e.id)));
  let candidates = withTranscript;

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

  const skipped = withTranscript.length - candidates.length;
  console.log(
    `[extract] ${withTranscript.length} transcripts · ${candidates.length} to extract · ` +
    `${skipped} skipped (already done)${force ? ' · FORCE' : ''}` +
    `${commitEvery ? ` · commit every ${commitEvery}` : ''}`
  );
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
      const real = rows.filter((r) => r.mentionType !== 'market_recap').length;
      console.log(`[extract]   ${ep.date} ${ep.id}: ${rows.length} names (${real} calls, ${rows.length - real} recap · tone ${summaries[ep.id].tone})`);

      if (commitEvery && done % commitEvery === 0) batchCommit(`extract ${done} eps`);
    } catch (e) {
      failed++;
      console.warn(`[extract]   FAIL ${ep.id} ${ep.date}: ${e.message}`);
    }
  }

  if (commitEvery && done % commitEvery !== 0) batchCommit(`extract final ${done} eps`);
  console.log(`[extract] done: extracted ${done} · ${totalNames} names · ${failed} failed · ${skipped} skipped`);
}

main().catch((e) => {
  console.error('[extract] FATAL', e);
  process.exit(1);
});
