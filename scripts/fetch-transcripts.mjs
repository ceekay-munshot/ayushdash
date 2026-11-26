#!/usr/bin/env node
// fetch-transcripts.mjs
// For each episode with a transcriptUrl and no stored transcript yet, download
// the VTT, parse to clean text + diarized segments, and write
// public/data/transcripts/<id>.json. Skips episodes already fetched.
//
// Flags: --force  re-download even if a stored transcript exists.

import {
  paths, TRANSCRIPTS_DIR, readJSON, writeJSON, ensureDir, fileExists,
  fetchRetry, sleep, parseArgs,
} from './lib/util.mjs';
import { parseVtt } from './lib/vtt.mjs';

const UA = 'Mozilla/5.0 (compatible; InvestTalkTracker/1.0)';

async function main() {
  const { flags } = parseArgs();
  const force = Boolean(flags.force);
  await ensureDir(TRANSCRIPTS_DIR);

  const episodes = await readJSON(paths.episodes, []);
  const todo = episodes.filter(
    (e) => e.transcriptUrl && (force || !fileExists(paths.transcript(e.id)))
  );
  const skippable = episodes.filter((e) => e.transcriptUrl).length;
  console.log(
    `[transcripts] ${episodes.length} episodes, ${skippable} have a transcript URL, ` +
    `${todo.length} to fetch${force ? ' (force)' : ''}`
  );

  let ok = 0, fail = 0;
  for (let i = 0; i < todo.length; i++) {
    const ep = todo[i];
    try {
      const r = await fetchRetry(ep.transcriptUrl, { headers: { 'User-Agent': UA } }, { tries: 3 });
      const vtt = await r.text();
      const { text, segments } = parseVtt(vtt);
      if (!text) throw new Error('parsed transcript empty');
      await writeJSON(paths.transcript(ep.id), { id: ep.id, text, segments }, { pretty: false });
      ok++;
      if (ok % 25 === 0 || i === todo.length - 1) {
        console.log(`[transcripts]   ${i + 1}/${todo.length} (${ok} ok, ${fail} fail)`);
      }
    } catch (e) {
      fail++;
      console.warn(`[transcripts]   FAIL ${ep.id} ${ep.date}: ${e.message}`);
    }
    await sleep(120); // be polite to S3
  }

  console.log(`[transcripts] done: ${ok} fetched, ${fail} failed`);
  if (fail && !ok) process.exitCode = 1; // total failure is an error; partials are fine
}

main().catch((e) => {
  console.error('[transcripts] FATAL', e);
  process.exit(1);
});
