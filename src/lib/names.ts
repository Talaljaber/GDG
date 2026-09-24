/**
 * Client-side mirror of the SQL name rules (`private.clean_name`,
 * `private.name_key`, `join_session`'s validation) for instant UX feedback
 * only. The server (`DATA_MODEL.md` §6) is authoritative; a name accepted
 * here can still be rejected by the DB (blocklist), and vice versa never
 * happens because the rules match exactly. See `SCORING.md` §6.
 */

/** Arabic diacritics (tashkil) + tatweel, stripped during cleaning. */
const DIACRITICS_RE = /[ً-ٰٟـ]/g;

/** Allowed characters in a cleaned name (SCORING.md §6.2). */
const ALLOWED_CHARS_RE =
  /^[A-Za-zÀ-ÖØ-öø-ÿء-غف-ي0-9٠-٩۰-۹ ]+$/;

const MIN_LENGTH = 1;
const MAX_LENGTH = 12;

/** Arabic letter variants folded together when computing a name key. */
const KEY_FOLDS: Array<[RegExp, string]> = [
  [/[أإآٱ]/g, 'ا'],
  [/ى/g, 'ي'],
  [/ة/g, 'ه'],
  [/ؤ/g, 'و'],
  [/ئ/g, 'ي'],
];

/**
 * Cleans a raw name: NFKC-normalise, strip Arabic diacritics/tatweel,
 * collapse whitespace runs to one space, trim.
 */
export function cleanName(raw: string): string {
  let s = raw.normalize('NFKC');
  s = s.replace(DIACRITICS_RE, '');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

export type NameValidation =
  | { ok: true; cleaned: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'invalid_chars' };

/**
 * Cleans and validates a name: 1-12 code points after cleaning, made only of
 * the character set in `SCORING.md` §6.2.
 */
export function validateName(raw: string): NameValidation {
  const cleaned = cleanName(raw);
  const length = Array.from(cleaned).length;

  if (length < MIN_LENGTH) {
    return { ok: false, reason: 'empty' };
  }
  if (!ALLOWED_CHARS_RE.test(cleaned)) {
    return { ok: false, reason: 'invalid_chars' };
  }
  if (length > MAX_LENGTH) {
    return { ok: false, reason: 'too_long' };
  }
  return { ok: true, cleaned };
}

/**
 * Converts Arabic-Indic (U+0660-0669) and Extended Arabic-Indic
 * (U+06F0-06F9) digits to ASCII 0-9; all other characters pass through.
 */
export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.codePointAt(0) as number;
    const base = code <= 0x0669 ? 0x0660 : 0x06f0;
    return String(code - base);
  });
}

/**
 * Computes the name key used for duplicate detection and the blocklist:
 * lower-case the cleaned name, fold Arabic letter variants, normalise
 * digits to ASCII (`SCORING.md` §6.4).
 */
export function nameKey(raw: string): string {
  let s = cleanName(raw).toLowerCase();
  for (const [re, replacement] of KEY_FOLDS) {
    s = s.replace(re, replacement);
  }
  return normalizeDigits(s);
}

/**
 * Normalises a session code: digits only (Western or Arabic-Indic), exactly
 * 4 digits, numeric value 1000-9999 (ADR-111). Returns null if invalid.
 */
export function normalizeCode(raw: string): string | null {
  const normalized = normalizeDigits(raw).trim();
  if (!/^\d{4}$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  if (value < 1000 || value > 9999) {
    return null;
  }
  return normalized;
}
