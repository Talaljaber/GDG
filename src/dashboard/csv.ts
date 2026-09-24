/**
 * Client-side CSV export for D4 combined results (AC4.3): UTF-8 with a BOM
 * so Excel detects the encoding and shows Arabic names correctly, CRLF line
 * endings (the Excel-friendly default), and RFC 4180 quoting. Pure string
 * building only — no DOM, no download here, so it's fully unit-testable.
 */

const BOM = '﻿';

/** Quotes a field if it contains a comma, quote, or line break; doubles any internal quotes. */
export function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Builds a full CSV document (BOM + header row + data rows), CRLF-separated. */
export function buildCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [headers, ...rows].map((cells) => cells.map((c) => csvField(c)).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

/** Slugifies a day label for use in a filename (keeps it readable, ASCII-safe). */
function slugify(label: string): string {
  const ascii = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return ascii || 'day';
}

/** `YYYY-MM-DD` in the local timezone (avoids `toISOString`'s UTC shift). */
function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `results-<day-label>-<best|all>-<date>.csv`, e.g. `results-day-1-best-2026-09-24.csv`. */
export function csvFilename(dayLabel: string, variant: 'best' | 'all', date: Date = new Date()): string {
  return `results-${slugify(dayLabel)}-${variant}-${isoDate(date)}.csv`;
}

/** Triggers a browser download of `content` as `filename` (not unit-tested: needs a real DOM/anchor click). */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
