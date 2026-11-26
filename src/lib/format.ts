// Plain-language number & date formatting. Tabular-friendly, no jargon.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Percentage, no sign forced: "12.3%". */
export function pct(n: number | null | undefined, decimals = 1): string {
  if (n == null || !isFinite(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

/** Signed percentage: "+12.3%" / "−4.0%" (true minus glyph). */
export function signedPct(n: number | null | undefined, decimals = 1): string {
  if (n == null || !isFinite(n)) return '—';
  const s = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${s}${Math.abs(n).toFixed(decimals)}%`;
}

export function num(n: number | null | undefined, decimals = 0): string {
  if (n == null || !isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** A USD price like $258.21 or $88,310. */
export function usd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  const dp = Math.abs(n) >= 1000 ? 0 : 2;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

/** "2026-04-16" → "16 Apr 2026" (UTC-safe). */
export function dateLabel(d: string): string {
  if (!d) return '—';
  const dt = new Date(`${d}T00:00:00Z`);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

/** "2026-04-16" → "16 Apr". */
export function dateShort(d: string): string {
  if (!d) return '—';
  const dt = new Date(`${d}T00:00:00Z`);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

/** "2026-04" → "Apr '26". */
export function monthLabel(m: string): string {
  const [y, mm] = m.split('-');
  const idx = parseInt(mm, 10) - 1;
  return `${MONTHS[idx] ?? mm} '${y.slice(2)}`;
}

/** An ISO datetime → "16 Apr 2026, 14:56 UTC". */
export function datetimeLabel(iso: string | undefined): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso;
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const mi = String(dt.getUTCMinutes()).padStart(2, '0');
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}, ${hh}:${mi} UTC`;
}

/** Seconds → "45 min". */
export function durationLabel(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '—';
  const m = Math.round(sec / 60);
  return `${m} min`;
}

/** Transcript timestamp seconds → "12:34". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
