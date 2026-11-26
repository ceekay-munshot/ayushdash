// Claude via AWS Bedrock Converse API with FORCED TOOL USE, so the model must
// return JSON shaped exactly like SCHEMA. Keyed by the BEDROCK_API_KEY secret.

import { sleep } from './util.mjs';

const REGION = process.env.AWS_REGION || 'us-east-1';
const MODELS = (
  process.env.BEDROCK_MODEL_IDS ||
  'anthropic.claude-sonnet-5,us.anthropic.claude-sonnet-5,us.anthropic.claude-sonnet-4-5-20250929-v1:0'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function hasBedrockKey() {
  return Boolean(process.env.BEDROCK_API_KEY);
}

// Call Bedrock and return the tool input object (guaranteed-shaped JSON), or
// throw after exhausting retries across all configured models.
export async function bedrockJSON(system, user, schema) {
  const body = JSON.stringify({
    system: [{ text: system }],
    messages: [{ role: 'user', content: [{ text: user }] }],
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: 'emit',
            description: 'Emit the structured result.',
            inputSchema: { json: schema },
          },
        },
      ],
      toolChoice: { tool: { name: 'emit' } },
    },
    inferenceConfig: { temperature: 0, maxTokens: 16000 },
  });

  let last = '';
  for (let round = 0; round < 6; round++) {
    for (const model of MODELS) {
      try {
        const res = await fetch(
          `https://bedrock-runtime.${REGION}.amazonaws.com/model/${encodeURIComponent(model)}/converse`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.BEDROCK_API_KEY}`,
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body,
            signal: AbortSignal.timeout(180000),
          }
        );
        if (res.status === 429 || res.status >= 500) {
          last = `HTTP ${res.status}`;
          continue;
        }
        if ([400, 403, 404].includes(res.status)) {
          last = `HTTP ${res.status} ${(await res.text()).slice(0, 160)}`;
          continue;
        }
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const tool = (data?.output?.message?.content ?? []).find(
          (p) => p.toolUse?.name === 'emit'
        )?.toolUse;
        if (tool?.input) return tool.input;
        last = 'no tool use in response';
      } catch (e) {
        last = `net ${e.message}`;
      }
    }
    await sleep(20000); // wait a wave if every model is busy
  }
  throw new Error(`Bedrock failed: ${last}`);
}

export const CANONICAL_THEMES = [
  'AI & datacenters', 'Semiconductors', 'Interest rates', 'Inflation', 'Energy & oil',
  'Gold & precious metals', 'Crypto', 'Banks & financials', 'Housing & REITs',
  'Consumer & retail', 'Healthcare', 'Defense & aerospace', 'Dividends & income',
  'Bonds & fixed income', 'Volatility & risk', 'Earnings', 'Fed policy', 'Tariffs & trade',
  'EVs & autos', 'Retirement & planning', 'Valuations', 'International markets',
  'Jobs & economy', 'Taxes', 'Commodities',
];

export const SYSTEM = `You are a sharp equity-research analyst reading a transcript of InvestTalk, a daily US CALLER-DRIVEN investing podcast (hosts Justin Klein & Luke Guerrero). Most episodes OPEN with a fast market recap where the hosts rattle off many tickers and price moves — these are NOT investment verdicts. The real signal is CALLER QUESTIONS ("what do you think of X?") and moments where a host VOLUNTEERS a clear opinion on a specific name.

Extract EVERY specific, publicly-traded investment that is NAMED — stocks, ETFs, crypto, commodities, or indices. For EACH name, set "mentionType" to exactly one of:
- "caller_question": a caller asked about this name and a host answered with their view.
- "host_opinion": a host volunteered a clear opinion on this name (not prompted by a caller).
- "market_recap": a passing mention — a price move ("X is up 3% today"), a news item, or an example — with NO actionable opinion from the hosts.

CRITICAL RULES:
- Only caller_question and host_opinion are real "calls." For market_recap, do NOT invent a verdict from the price move.
- "decision" must come from WHAT THE HOST SAYS, never from the price direction:
  • "buy" = positive / likes it / would own (even while noting risks)
  • "neutral" = explicit hold / mixed / no conviction
  • "avoid" = negative / would not own / sell
  For a market_recap with no opinion, output decision "neutral" (it will be ignored downstream) and set mentionType "market_recap".
- "quote" MUST be the verbatim sentence where the host expresses the OPINION — not a price-recap sentence. If there is no opinion sentence, it is market_recap and the quote is the relevant mention.
- IGNORE generic personal-finance questions with no specific ticker (IRAs / taxes / budgeting).
- If a name comes up MORE THAN ONCE, MERGE into one entry and prefer the STRONGEST signal (a real call beats a recap; a conviction verdict beats neutral).

TICKER RESOLUTION (Yahoo Finance symbols):
- US names: plain symbol (Apple→AAPL, S&P 500 ETF→SPY).
- NON-US names: use the EXCHANGE-QUALIFIED Yahoo symbol — .PA Paris, .TO Toronto, .ST Stockholm, .L London, .HK Hong Kong, .NS India, .DE Germany, .SW Switzerland (Hermès→RMS.PA, Shopify on TSX→SHOP.TO).
- Commodities: Gold→GC=F, Silver→SI=F, Crude→CL=F. Crypto: Bitcoin→BTC-USD, Ethereum→ETH-USD.
- Known tricky names: Taiwan Semiconductor→TSM, Credo Technology→CRDO, VICI Properties→VICI, SanDisk→SNDK, Berkshire B→BRK-B.
- If unsure, give your best guess and LOWER the confidence.

FEW-SHOT (decision from the host's words, not the price):
- "We obviously like the company — it's a core holding." → decision "buy", mentionType "host_opinion".
- "A caller asked about Visa; it's reasonable to keep holding here, nothing exciting." → decision "neutral", mentionType "caller_question".
- "Honestly, I'd just sell it and move on." → decision "avoid", mentionType "host_opinion".
- "Micron is down today on memory-pricing news." → mentionType "market_recap", decision "neutral" (ignored — no opinion given).

Also write a short episode summary: a 2-3 sentence plain overview, the main THEMES, and overall tone (bullish/bearish/mixed/neutral).
For "themes", choose only from this fixed list where they apply, spelled EXACTLY as shown (keep acronyms AI/ETF/REIT uppercase), and add AT MOST ONE free-form theme if nothing fits:
${CANONICAL_THEMES.map((t) => `"${t}"`).join(', ')}.
Base everything only on the transcript.`;

export const SCHEMA = {
  type: 'object',
  required: ['summary', 'names'],
  properties: {
    summary: {
      type: 'object',
      required: ['overview', 'themes', 'tone'],
      properties: {
        overview: { type: 'string' },
        themes: { type: 'array', items: { type: 'string' } },
        tone: { type: 'string', enum: ['bullish', 'bearish', 'mixed', 'neutral'] },
      },
    },
    names: {
      type: 'array',
      items: {
        type: 'object',
        required: ['ticker', 'company', 'assetType', 'mentionType', 'decision', 'confidence', 'reasoning'],
        properties: {
          ticker: { type: 'string' },
          company: { type: 'string' },
          assetType: {
            type: 'string',
            enum: ['stock', 'etf', 'crypto', 'commodity', 'index', 'other'],
          },
          mentionType: {
            type: 'string',
            enum: ['caller_question', 'host_opinion', 'market_recap'],
          },
          decision: { type: 'string', enum: ['buy', 'neutral', 'avoid'] },
          confidence: { type: 'number' },
          reasoning: { type: 'string' },
          quote: { type: 'string' },
          context: { type: 'string' },
        },
      },
    },
  },
};
