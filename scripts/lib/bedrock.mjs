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

export const SYSTEM = `You are a sharp equity-research analyst reading a transcript of InvestTalk, a daily US call-in investing podcast (hosts Justin Klein & Luke Guerrero). The hosts discuss market themes and answer caller questions, giving their own verdict on specific investments.

Extract EVERY specific, publicly-traded investment the hosts express a view on — stocks, ETFs, crypto, commodities, or indices. For each:
- Resolve its correct Yahoo Finance ticker symbol (Apple→AAPL, S&P 500 ETF→SPY, Bitcoin→BTC-USD, Gold→GC=F, Crude→CL=F). If unsure, give your best guess and lower the confidence.
- Classify the hosts' verdict as exactly one of: "buy" (they like it / would own / interesting), "neutral" (hold / mixed / no strong conviction), or "avoid" (negative / would not own / sell).
- Give a one-line plain reason and a short verbatim quote of the verdict.
Rules: IGNORE general personal-finance questions with no specific ticker (IRA/taxes/budgeting). IGNORE names mentioned only in passing with no opinion. If a name comes up more than once, MERGE into one entry with the overall verdict. Only include where the hosts actually gave a view.
Also write a short episode summary: a 2-3 sentence plain overview, 3-6 short theme tags, and overall tone (bullish/bearish/mixed/neutral). Base everything only on the transcript.`;

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
        required: ['ticker', 'company', 'assetType', 'decision', 'confidence', 'reasoning'],
        properties: {
          ticker: { type: 'string' },
          company: { type: 'string' },
          assetType: {
            type: 'string',
            enum: ['stock', 'etf', 'crypto', 'commodity', 'index', 'other'],
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
