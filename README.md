# InvestTalk Stock-Call Tracker

A live dashboard answering one question: **are the stock calls on the
[InvestTalk](http://investtalk.com) podcast any good?**

InvestTalk is a daily US call-in investing show (hosts Justin Klein & Luke
Guerrero). For every episode since **1 Jan 2026** we pull out each specific
investment the hosts gave a view on — bucketed **BUY / NEUTRAL / AVOID** — and
measure how each call did **+3 months** and **+6 months** later, both as a raw
return and versus the S&P 500.

> **Status: Phase 1 — the automated data engine.** This repo contains the data
> pipeline, the committed JSON data, the automation, and a minimal site
> skeleton. The full dashboard UI is Phase 2.

## Architecture

No database. GitHub Actions run Node scripts on a schedule → they scrape the
podcast RSS feed, download free WebVTT transcripts, call Claude (via AWS
Bedrock) to extract names + verdicts, fetch prices from Yahoo, and write plain
JSON into `public/data/`. A static Vite/React site reads those JSON files.
Cloudflare Pages serves it and rebuilds on every commit (Vite copies `public/`
into `dist/`, so the committed data ships automatically).

```
RSS feed ─▶ fetch-episodes ─▶ episodes.json
           fetch-transcripts ─▶ transcripts/<id>.json
           extract-names (Claude/Bedrock) ─▶ names.json + summaries.json
           enrich-performance (Yahoo) ─▶ names.json[].perf + benchmarks.json
           build-scorecard ─▶ scorecard.json + metadata.json
```

## Pipeline scripts (`scripts/`, ES modules, Node 22)

Each script is **idempotent / incremental** and safe to re-run.

| Script | What it does | Keys |
|---|---|---|
| `fetch-episodes.mjs` | Parse the feed, keep `pubDate >= 2026-01-01`, write `episodes.json` (newest first). | none |
| `fetch-transcripts.mjs` | Download + parse each VTT to clean text + diarized segments; one file per episode. Skips ones already stored (`--force` to redo). | none |
| `extract-names.mjs` | Send each new transcript to Claude (Bedrock, forced tool use) → append rows to `names.json` and a summary to `summaries.json`. Flags: `--limit N`, `--sample N`, `--episodes a,b`, `--force`. | `BEDROCK_API_KEY` |
| `enrich-performance.mjs` | Fetch Yahoo closes around each mention; compute +3m/+6m return, benchmark return, alpha. Refreshes **all** rows each run so in-progress windows mature. | none |
| `build-scorecard.mjs` | Aggregate `names.json` → `scorecard.json` + `metadata.json`. | none |

Run the whole chain locally:

```bash
npm run pipeline
```

Or individually: `npm run fetch:episodes`, `fetch:transcripts`,
`extract:names`, `enrich:performance`, `build:scorecard`.

## Data files (`public/data/`)

**`episodes.json`** — array, newest first:

```jsonc
{ "id": "2026-11-26-67ad41b2", "date": "2026-11-26", "title": "...",
  "link": "http://investtalk.com", "audioUrl": "https://…/stream.mp3",
  "durationSec": 2706, "transcriptUrl": "https://…vtt" | null,
  "hasTranscript": true }
```

**`transcripts/<id>.json`** — one per episode:

```jsonc
{ "id": "...", "text": "clean prose, speaker turns on newlines",
  "segments": [ { "start": 1.094, "speaker": "SPEAKER_01", "text": "..." } ] }
```

**`names.json`** — one row per name-mention (`perf` / `resolved` added by enrich):

```jsonc
{ "nameId": "<episodeId>-n0", "episodeId": "...", "date": "2026-01-15",
  "ticker": "AAPL", "company": "Apple Inc.", "assetType": "stock",
  "decision": "buy", "confidence": 0.8, "reasoning": "...", "quote": "...",
  "context": "...",
  "resolved": true,
  "perf": {
    "benchmark": "^GSPC", "priceAtMention": 258.21, "priceDate": "2026-01-15",
    "p3m": { "date": "2026-04-16", "targetDate": "2026-04-16", "price": 263.4,
             "return": 2.01, "benchReturn": 1.39, "alpha": 0.62, "status": "complete" },
    "p6m": { "date": "2026-07-17", "targetDate": "2026-07-17", "price": 333.74,
             "return": 29.25, "benchReturn": 7.39, "alpha": 21.86, "status": "complete" }
  } }
```

- `assetType`: `stock|etf|crypto|commodity|index|other`; `decision`: `buy|neutral|avoid`.
- Benchmark map: stock/etf/index → `^GSPC`; crypto → `BTC-USD`; commodity/other → none (raw only).
- `status`: `complete` if the target date ≤ today, else `in_progress` (a to-date number is still computed and flagged).
- Unresolvable tickers are **kept** with `resolved:false, perf:null` (they were still discussed).

**`summaries.json`** — keyed by episode id: `{ overview, themes[], tone, nameCount }`.

**`benchmarks.json`** — `{ generatedAt, window, map, benchmarks: { "^GSPC": { symbol, name, closes:{date:close} }, "BTC-USD": {…} } }`.

**`scorecard.json`** — headline counts + performance. Performance stats are
computed over **complete** horizon legs only (in-progress excluded from
averages, counted separately). Per bucket × horizon:
`{ n, inProgress, avgReturn, avgAlpha, winRate, winRateBasis }` where win-rate =
% positive alpha for buy/neutral/overall, % negative return for avoid. Also
`byDecision`, `byAssetType`, `coverage`, `totals`, and `topCalls.best/worst`
(top 5 by alpha).

**`metadata.json`** — `{ generatedAt, window, episodeCount, nameCount, source }`.

## Automation (`.github/workflows/`)

- **`backfill.yml`** — `workflow_dispatch` only. Full run over the whole window, then commits `public/data/**`. Generous timeout. Optional input `extract_limit`.
- **`daily.yml`** — `schedule` `17 13 * * *` (13:17 UTC) + `workflow_dispatch`. Incremental: new episodes extracted, **all** performance refreshed, scorecard rebuilt, committed.

Both need these repo **secrets** (injected as env):

| Secret | Required | Notes |
|---|---|---|
| `BEDROCK_API_KEY` | yes (for extraction) | AWS Bedrock bearer token |
| `AWS_REGION` | optional | defaults to `us-east-1` |
| `BEDROCK_MODEL_IDS` | optional | comma-separated fallback list |
| `DEEPGRAM_API_KEY` | optional | only if transcribing the rare missing transcripts |

Workflows commit via `.github/scripts/commit-data.sh` (fetch + rebase + retry push).

## Local development

```bash
npm install
npm run dev      # Vite dev server
npm run build    # tsc --noEmit && vite build  → dist/
```

## Deployment (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `dist`
- Rebuilds automatically on every commit to the data files.
