import { useEffect, useState } from 'react';
import type { Episode, Metadata, NameRow } from './types';

const BASE = import.meta.env.BASE_URL; // "/" by default

async function getJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${BASE}data/${path}`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

const DECISION_STYLE: Record<string, string> = {
  buy: 'bg-green-100 text-green-700',
  neutral: 'bg-gray-100 text-gray-600',
  avoid: 'bg-red-100 text-red-700',
};

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '–';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

export default function App() {
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [names, setNames] = useState<NameRow[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [m, n, e] = await Promise.all([
        getJSON<Metadata | null>('metadata.json', null),
        getJSON<NameRow[]>('names.json', []),
        getJSON<Episode[]>('episodes.json', []),
      ]);
      setMeta(m);
      setNames(n);
      setEpisodes(e);
      setLoading(false);
    })();
  }, []);

  const episodeCount = meta?.episodeCount ?? episodes.length;
  const nameCount = meta?.nameCount ?? names.length;
  const updated = meta?.generatedAt
    ? new Date(meta.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const latestNames = names.slice(0, 15);

  return (
    <div className="min-h-screen font-sans">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Phase 1 · data engine
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            InvestTalk Stock-Call Tracker
          </h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Are the stock calls on the{' '}
            <span className="font-medium text-slate-700">InvestTalk</span> podcast any good?
            Every host verdict since Jan 2026, scored against the market at +3 and +6 months.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading ? (
          <p className="text-slate-400">Loading data…</p>
        ) : (
          <>
            {/* live counts */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label="Episodes" value={episodeCount.toLocaleString()} />
              <Stat label="Names tracked" value={nameCount.toLocaleString()} />
              <Stat label="Updated" value={updated} />
            </section>

            {/* preview */}
            <section className="mt-10">
              <h2 className="mb-3 text-lg font-semibold text-slate-800">
                {latestNames.length ? 'Latest 15 calls' : 'Latest episodes'}
              </h2>

              {latestNames.length ? (
                <PreviewTable rows={latestNames} />
              ) : (
                <>
                  <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No extracted calls yet. Episodes and transcripts are loaded; name
                    extraction runs in GitHub Actions once the <code>BEDROCK_API_KEY</code>{' '}
                    secret is configured.
                  </p>
                  <EpisodeTable rows={episodes.slice(0, 15)} />
                </>
              )}
            </section>

            <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-400">
              {meta?.source ?? 'InvestTalk podcast'} · window{' '}
              {meta?.window ? `${meta.window.from} → ${meta.window.to}` : '—'} · full UI in Phase 2
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function PreviewTable({ rows }: { rows: NameRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Ticker</th>
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Verdict</th>
            <th className="px-4 py-3 text-right">+3m</th>
            <th className="px-4 py-3 text-right">+6m α</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nameId} className="border-b border-slate-100 last:border-0">
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDate(r.date)}</td>
              <td className="px-4 py-3 font-mono font-medium text-slate-900">{r.ticker || '—'}</td>
              <td className="max-w-[16rem] truncate px-4 py-3 text-slate-700">{r.company}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_STYLE[r.decision] ?? ''}`}>
                  {r.decision}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtPct(r.perf?.p3m?.return)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmtPct(r.perf?.p6m?.alpha)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EpisodeTable({ rows }: { rows: Episode[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Episode</th>
            <th className="px-4 py-3 text-center">Transcript</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-b border-slate-100 last:border-0">
              <td className="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDate(e.date)}</td>
              <td className="max-w-[28rem] truncate px-4 py-3 text-slate-700">{e.title}</td>
              <td className="px-4 py-3 text-center">{e.hasTranscript ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
