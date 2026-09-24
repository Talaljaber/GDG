#!/usr/bin/env -S npx tsx
/**
 * Generates src/i18n/en.json and src/i18n/ar.json from the markdown tables
 * in docs/COPY.md §3-§8 (§9 is the spoken booth script and is not UI copy).
 *
 * docs/COPY.md is the source of truth (ADR-034, .claude/rules/ui-i18n.md):
 * "New string -> add it to COPY.md (EN + AR) first, then both JSON files."
 * This script is how the JSON files get produced from it.
 *
 * Run with `npm run gen:i18n` (or `npx tsx scripts/gen-i18n.ts`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const COPY_MD_PATH = path.resolve(__dirname, '../docs/COPY.md');
export const EN_JSON_PATH = path.resolve(__dirname, '../src/i18n/en.json');
export const AR_JSON_PATH = path.resolve(__dirname, '../src/i18n/ar.json');

/** A plain string entry, or a plural entry keyed by CLDR plural form. */
export type CopyValue = string | Record<string, string>;
export type CopyMap = Record<string, CopyValue>;

export interface GenResult {
  en: CopyMap;
  ar: CopyMap;
  /** Table rows inside §3-§8 that looked like data rows but could not be parsed. */
  unparsedRows: string[];
}

const FIRST_SECTION = 3;
const LAST_SECTION = 8;

/** Strips the ⚑ "needs a second tone opinion" marker (docs/COPY.md §1) and trims. */
function cleanText(raw: string): string {
  return raw.replace(/⚑/g, '').trim();
}

/** Extracts the first backtick-quoted key from a key cell (aliases live in a trailing paren). */
function extractKey(keyCell: string): string | null {
  const match = /^`([^`]+)`/.exec(keyCell.trim());
  return match ? match[1] : null;
}

function isPluralKeyCell(keyCell: string): boolean {
  return /\(plural\b/.test(keyCell);
}

/** Splits a "form: text · form: text" cell into a plural form map. */
function parsePluralValue(cell: string): Record<string, string> {
  const forms: Record<string, string> = {};
  const segments = cell.split('·').map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const idx = segment.indexOf(':');
    if (idx === -1) continue;
    const form = segment.slice(0, idx).trim();
    const text = cleanText(segment.slice(idx + 1));
    forms[form] = text;
  }
  return forms;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

/** Splits a markdown table row `| a | b | c |` into ["a","b","c"]. Assumes no literal `|` in cells. */
function splitRow(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((c) => c.trim());
}

export function parseCopyMd(copyMdPath: string = COPY_MD_PATH): GenResult {
  const content = readFileSync(copyMdPath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const en: CopyMap = {};
  const ar: CopyMap = {};
  const unparsedRows: string[] = [];

  let sectionNum: number | null = null;

  for (const line of lines) {
    const sectionMatch = /^## (\d+)\./.exec(line);
    if (sectionMatch) {
      sectionNum = Number(sectionMatch[1]);
      continue;
    }

    if (sectionNum === null || sectionNum < FIRST_SECTION || sectionNum > LAST_SECTION) {
      continue;
    }

    if (!line.trim().startsWith('|')) continue;

    const cells = splitRow(line);
    if (cells.length < 3) continue;
    if (isSeparatorRow(cells)) continue;
    if (cells[0].toLowerCase() === 'key') continue; // header row

    const key = extractKey(cells[0]);
    if (!key) {
      // Looked like a table data row (3+ cells, not header/separator) inside §3-§8
      // but the key cell had no backtick-quoted key: §9's "Moment" rows are excluded
      // by section range already, so this means a genuinely malformed row.
      unparsedRows.push(line.trim());
      continue;
    }

    const plural = isPluralKeyCell(cells[0]);

    if (plural) {
      en[key] = parsePluralValue(cells[1]);
      ar[key] = parsePluralValue(cells[2]);
    } else {
      en[key] = cleanText(cells[1]);
      ar[key] = cleanText(cells[2]);
    }
  }

  return { en, ar, unparsedRows };
}

function sortedMap(map: CopyMap): CopyMap {
  const sorted: CopyMap = {};
  for (const key of Object.keys(map).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = map[key];
  }
  return sorted;
}

export function toJsonFileContents(map: CopyMap): string {
  return JSON.stringify(sortedMap(map), null, 2) + '\n';
}

function main() {
  const { en, ar, unparsedRows } = parseCopyMd();

  writeFileSync(EN_JSON_PATH, toJsonFileContents(en), 'utf-8');
  writeFileSync(AR_JSON_PATH, toJsonFileContents(ar), 'utf-8');

  console.log(`Wrote ${Object.keys(en).length} keys to ${path.relative(process.cwd(), EN_JSON_PATH)}`);
  console.log(`Wrote ${Object.keys(ar).length} keys to ${path.relative(process.cwd(), AR_JSON_PATH)}`);

  if (unparsedRows.length > 0) {
    console.warn(`\nWARNING: ${unparsedRows.length} row(s) in docs/COPY.md §3-§8 could not be parsed:`);
    for (const row of unparsedRows) {
      console.warn(`  ${row}`);
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
