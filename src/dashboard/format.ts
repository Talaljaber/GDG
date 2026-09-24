/**
 * Display formatting shared by the dashboard pages (presentation only; the
 * CSV export keeps its own `formatTimestamp`). Dates follow the UI language,
 * always with Western digits and a 24-hour clock (ADR-123), so an Arabic
 * laptop locale never mixes digit systems or AM/PM markers into the tables.
 */
import type { Lang } from '../i18n';

function locale(lang: Lang): string {
  return lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB';
}

/** Hours and minutes of an ISO timestamp, or an en dash when missing. */
export function formatTime(iso: string | null, lang: Lang = 'en'): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/** Day, short month and time ("25 Sep, 14:02"), optionally with seconds. */
export function formatDateTime(iso: string | null, lang: Lang = 'en', seconds = false): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString(locale(lang), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  });
}
