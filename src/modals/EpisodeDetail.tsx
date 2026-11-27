import { useEffect, useMemo, useState, Fragment } from 'react';
import { Headphones, ExternalLink, Search, Loader2, FileText } from 'lucide-react';
import type { Episode, Transcript, TranscriptSegment } from '../types';
import type { Dataset } from '../lib/data';
import { loadTranscript } from '../lib/data';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Card';
import { VerdictPill } from '../components/ui/VerdictPill';
import { TONE_COLOR, TONE_LABEL, CAT } from '../lib/brand';
import { dateLabel, clock, durationLabel } from '../lib/format';

interface Turn { start: number; speaker: string | null; text: string }

function buildTurns(segments: TranscriptSegment[]): Turn[] {
  const turns: Turn[] = [];
  for (const s of segments) {
    const last = turns[turns.length - 1];
    if (last && last.speaker === s.speaker) last.text += ' ' + s.text;
    else turns.push({ start: s.start, speaker: s.speaker, text: s.text });
  }
  return turns;
}

function speakerLabel(s: string | null): string {
  if (!s) return 'Speaker';
  const m = s.match(/(\d+)/);
  return m ? `Speaker ${parseInt(m[1], 10)}` : s;
}

// Deterministic colour per speaker id.
function speakerColor(s: string | null): string {
  if (!s) return '#94A3B8';
  const m = s.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 0;
  return CAT[n % CAT.length];
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase()
          ? <mark key={i} className="rounded bg-amber-200 px-0.5">{p}</mark>
          : <Fragment key={i}>{p}</Fragment>
      )}
    </>
  );
}

export function EpisodeDetail({ episode, data, onClose }: { episode: Episode | null; data: Dataset; onClose: () => void }) {
  const [transcript, setTranscript] = useState<Transcript | null | undefined>(undefined);
  const [tq, setTq] = useState('');

  useEffect(() => {
    setTq('');
    if (!episode) return;
    if (!episode.hasTranscript) { setTranscript(null); return; }
    setTranscript(undefined);
    let alive = true;
    loadTranscript(episode.id).then((t) => { if (alive) setTranscript(t); });
    return () => { alive = false; };
  }, [episode]);

  const summary = episode ? data.summaries[episode.id] : undefined;
  const calls = useMemo(
    () => (episode ? data.names.filter((n) => n.episodeId === episode.id) : []),
    [episode, data.names]
  );

  const turns = useMemo(() => (transcript ? buildTurns(transcript.segments) : []), [transcript]);
  const shownTurns = useMemo(() => {
    const needle = tq.trim().toLowerCase();
    if (!needle) return turns;
    return turns.filter((t) => t.text.toLowerCase().includes(needle));
  }, [turns, tq]);

  if (!episode) return null;

  return (
    <Modal
      open={!!episode}
      onClose={onClose}
      title={episode.title}
      subtitle={<span>{dateLabel(episode.date)} · {durationLabel(episode.durationSec)}</span>}
      maxWidth={820}
    >
      <div className="space-y-4">
        {/* summary */}
        <div className="flex flex-wrap items-center gap-2">
          {summary ? <Badge color={TONE_COLOR[summary.tone]}>{TONE_LABEL[summary.tone]}</Badge> : null}
          {(() => {
            const real = calls.filter((c) => c.mentionType !== 'market_recap').length;
            return <Badge color="#6366F1">{real} {real === 1 ? 'call' : 'calls'}</Badge>;
          })()}
          {episode.audioUrl && (
            <a href={episode.audioUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fdc-green hover:underline">
              <Headphones size={13} /> Listen
            </a>
          )}
          {episode.link && (
            <a href={episode.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fdc-green hover:underline">
              <ExternalLink size={13} /> Show page
            </a>
          )}
        </div>

        {summary?.overview && <p className="text-[13.5px] leading-relaxed text-fdc-slate">{summary.overview}</p>}
        {summary?.themes?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {summary.themes.map((t, i) => (
              <span key={i} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${CAT[i % CAT.length]}18`, color: CAT[i % CAT.length] }}>{t}</span>
            ))}
          </div>
        ) : null}

        {/* the day's calls */}
        {calls.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-fdc-grey">Calls this episode</h4>
            <div className="fdc-scroll max-h-56 overflow-y-auto rounded-xl border border-black/[0.06]">
              <table className="w-full text-[12.5px]">
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.nameId} className="border-b border-black/[0.04] last:border-0 align-top">
                      <td className="whitespace-nowrap px-3 py-2 font-bold text-fdc-ink tnum">{c.ticker}</td>
                      <td className="px-2 py-2">{c.mentionType === 'market_recap' ? <Badge color="#94A3B8">recap</Badge> : <VerdictPill decision={c.decision} size="sm" />}</td>
                      <td className="px-3 py-2 text-fdc-slate">{c.quote ? `“${c.quote}”` : <span className="text-fdc-grey">{c.reasoning}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* transcript */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-fdc-grey">
              <FileText size={13} /> Transcript
            </h4>
            {transcript && (
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fdc-grey" />
                <input
                  value={tq}
                  onChange={(e) => setTq(e.target.value)}
                  placeholder="Search transcript"
                  className="w-[200px] rounded-lg border border-black/10 bg-white py-1.5 pl-7 pr-2 text-[12px] shadow-sm outline-none focus:border-fdc-green/50"
                />
              </div>
            )}
          </div>

          {transcript === undefined && (
            <div className="flex items-center gap-2 py-8 text-[12.5px] text-fdc-grey">
              <Loader2 size={16} className="animate-spin text-fdc-green" /> Loading transcript…
            </div>
          )}
          {transcript === null && (
            <div className="rounded-xl border border-dashed border-black/10 px-3.5 py-6 text-center text-[12.5px] text-fdc-grey">
              Transcript not available yet.
            </div>
          )}
          {transcript && (
            <>
              {tq && <p className="mb-1.5 text-[11.5px] text-fdc-grey">{shownTurns.length} matching passage{shownTurns.length === 1 ? '' : 's'}</p>}
              <div className="fdc-scroll max-h-[340px] space-y-2.5 overflow-y-auto rounded-xl border border-black/[0.06] bg-fdc-offwhite/50 p-3.5">
                {shownTurns.map((t, i) => (
                  <div key={i} className="text-[12.5px] leading-relaxed">
                    <span className="tnum mr-2 inline-block rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: `${speakerColor(t.speaker)}1A`, color: speakerColor(t.speaker) }}>
                      {speakerLabel(t.speaker)} · {clock(t.start)}
                    </span>
                    <span className="text-fdc-slate"><Highlight text={t.text} q={tq.trim()} /></span>
                  </div>
                ))}
                {shownTurns.length === 0 && <p className="py-6 text-center text-[12px] text-fdc-grey">No passages match “{tq}”.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
