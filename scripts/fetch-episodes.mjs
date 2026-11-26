#!/usr/bin/env node
// fetch-episodes.mjs
// Fetch the InvestTalk RSS feed, keep items with pubDate >= WINDOW_FROM, and
// write public/data/episodes.json (newest first). Idempotent.

import {
  FEED_URL, WINDOW_FROM, paths, writeJSON, fetchRetry,
  cleanText, decodeEntities, parsePubDate, isoDate, slugify,
} from './lib/util.mjs';

// Pull one tag's inner text out of an <item> block.
function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}

// Pull an attribute off the first matching self-closing/standalone tag.
function attrOf(block, tagName, attr) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'ig');
  const matches = block.match(re) || [];
  for (const t of matches) {
    const am = t.match(new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, 'i'));
    if (am) return am[1];
  }
  return null;
}

// Choose the best transcript URL: prefer text/vtt, else the first transcript.
function transcriptUrl(block) {
  const tags = block.match(/<podcast:transcript\b[^>]*>/ig) || [];
  if (!tags.length) return null;
  const vtt = tags.find((t) => /type\s*=\s*"text\/vtt"/i.test(t)) || tags[0];
  const m = vtt.match(/url\s*=\s*"([^"]*)"/i);
  return m ? decodeEntities(m[1]) : null;
}

// itunes:duration is seconds here, but some feeds use HH:MM:SS — handle both.
function durationSec(block) {
  const raw = (tag(block, 'itunes:duration') || '').trim();
  if (!raw) return null;
  if (raw.includes(':')) {
    const parts = raw.split(':').map(Number);
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function stableId(guid, date) {
  const head = slugify(guid || '').replace(/-/g, '').slice(0, 8) || 'na';
  return `${date}-${head}`;
}

async function main() {
  console.log(`[episodes] fetching feed ${FEED_URL}`);
  const res = await fetchRetry(
    FEED_URL,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestTalkTracker/1.0)' } },
    { tries: 4 }
  );
  const xml = await res.text();
  const blocks = xml.split('<item>').slice(1).map((s) => s.slice(0, s.indexOf('</item>')));
  console.log(`[episodes] feed has ${blocks.length} items total`);

  const episodes = [];
  const seen = new Set();
  for (const block of blocks) {
    const d = parsePubDate(tag(block, 'pubDate') || '');
    if (!d) continue;
    const date = isoDate(d);
    if (date < WINDOW_FROM) continue; // window filter (UTC)

    const guid = cleanText(tag(block, 'guid') || '');
    const id = stableId(guid, date);
    if (seen.has(id)) continue;
    seen.add(id);

    const tUrl = transcriptUrl(block);
    episodes.push({
      id,
      date,
      title: cleanText(tag(block, 'title') || '(untitled)'),
      link: cleanText(tag(block, 'link') || ''),
      audioUrl: decodeEntities(attrOf(block, 'enclosure', 'url') || ''),
      durationSec: durationSec(block),
      transcriptUrl: tUrl,
      hasTranscript: Boolean(tUrl),
    });
  }

  // Newest first, tie-break by id for determinism.
  episodes.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1)));

  await writeJSON(paths.episodes, episodes);
  const withT = episodes.filter((e) => e.hasTranscript).length;
  const dates = episodes.map((e) => e.date);
  console.log(
    `[episodes] wrote ${episodes.length} episodes ` +
    `(${dates[dates.length - 1]} .. ${dates[0]}), ${withT} with transcripts`
  );
}

main().catch((e) => {
  console.error('[episodes] FATAL', e);
  process.exit(1);
});
