// WebVTT -> clean text + diarized segments.
//
// Input cues look like:
//   00:01.087 --> 00:10.294
//   [SPEAKER_02]: This is Invest Talk...
// Timestamps may be MM:SS.mmm or HH:MM:SS.mmm. Some files also carry numeric
// cue identifiers and inline <...> tags; both are stripped.

// "HH:MM:SS.mmm" or "MM:SS.mmm" -> seconds (number, 3dp).
export function timestampToSeconds(ts) {
  const parts = ts.trim().split(':');
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) {
    [h, m, s] = parts;
  } else if (parts.length === 2) {
    [m, s] = parts;
  } else {
    s = parts[0];
  }
  const sec = Number(h) * 3600 + Number(m) * 60 + Number(s);
  return Number.isFinite(sec) ? Number(sec.toFixed(3)) : 0;
}

const SPEAKER_RE = /^\[([A-Za-z0-9_ ]+)\]:\s*/;

// Parse a VTT string into { text, segments:[{start, speaker, text}] }.
export function parseVtt(vtt) {
  // Normalise newlines, split into cue blocks on blank lines.
  const blocks = vtt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n{2,}/);
  const segments = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines[0] === 'WEBVTT' || lines[0].startsWith('WEBVTT')) continue;
    if (lines[0].startsWith('NOTE') || lines[0].startsWith('STYLE') ||
        lines[0].startsWith('REGION')) continue;

    // Find the timing line (contains -->). A leading cue-id line may precede it.
    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx === -1) continue; // not a cue

    const timing = lines[timingIdx];
    const startRaw = timing.split('-->')[0].trim().split(/\s+/)[0];
    const start = timestampToSeconds(startRaw);

    // Everything after the timing line is cue text.
    let cueText = lines.slice(timingIdx + 1).join(' ');
    cueText = cueText.replace(/<[^>]+>/g, ''); // strip inline tags
    cueText = cueText.replace(/\s+/g, ' ').trim();
    if (!cueText) continue;

    let speaker = null;
    const sm = cueText.match(SPEAKER_RE);
    if (sm) {
      speaker = sm[1].trim();
      cueText = cueText.slice(sm[0].length).trim();
    }
    if (!cueText) continue;

    segments.push({ start, speaker, text: cueText });
  }

  // Clean readable transcript: merge consecutive same-speaker cues into
  // paragraphs, joined by newlines. Speaker labels are NOT included in `text`.
  const paras = [];
  let curSpeaker = Symbol('none');
  let buf = [];
  const flush = () => {
    if (buf.length) paras.push(buf.join(' '));
    buf = [];
  };
  for (const seg of segments) {
    if (seg.speaker !== curSpeaker) {
      flush();
      curSpeaker = seg.speaker;
    }
    buf.push(seg.text);
  }
  flush();
  const text = paras.join('\n').trim();

  return { text, segments };
}

// Build a speaker-tagged transcript for the extraction model from segments,
// merging consecutive same-speaker cues so the model sees who said what
// (host vs caller) without timestamp noise. Falls back to plain text.
export function diarizedText({ segments, text }) {
  if (!segments || !segments.length) return text || '';
  const lines = [];
  let curSpeaker = Symbol('none');
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const label = curSpeaker ? String(curSpeaker) : 'UNKNOWN';
    lines.push(`${label}: ${buf.join(' ')}`);
    buf = [];
  };
  for (const seg of segments) {
    if (seg.speaker !== curSpeaker) {
      flush();
      curSpeaker = seg.speaker;
    }
    buf.push(seg.text);
  }
  flush();
  return lines.join('\n');
}
