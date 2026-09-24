#!/usr/bin/env -S npx tsx
/**
 * CI/local guard for the i18n string files (docs/COPY.md is the source of
 * truth, .claude/rules/ui-i18n.md, ADR-034).
 *
 * Fails (exit 1) if:
 *  (a) src/i18n/en.json or src/i18n/ar.json differ from what gen-i18n.ts
 *      would produce from docs/COPY.md right now,
 *  (b) en.json and ar.json don't have identical key sets,
 *  (c) the placeholder set differs between en/ar for a key (or a plural
 *      form of a key),
 *  (d) a plural key is missing a required form (en: one, other;
 *      ar: zero, one, two, few, many, other).
 *
 * Run with `npm run check:i18n` (or `npx tsx scripts/check-i18n.ts`).
 */
import { readFileSync } from 'node:fs';
import { parseCopyMd, toJsonFileContents, EN_JSON_PATH, AR_JSON_PATH, type CopyMap } from './gen-i18n';

const EN_REQUIRED_PLURAL_FORMS = ['one', 'other'];
const AR_REQUIRED_PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

function readJson(filePath: string): CopyMap {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as CopyMap;
}

/** Extracts the set of `{placeholder}` names used in a string. */
function placeholders(text: string): Set<string> {
  const found = new Set<string>();
  const re = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    found.add(match[1]);
  }
  return found;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function isPluralValue(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function main() {
  const errors: string[] = [];

  // (a) en.json/ar.json must match what gen-i18n would produce from COPY.md.
  const { en: expectedEn, ar: expectedAr, unparsedRows } = parseCopyMd();

  if (unparsedRows.length > 0) {
    errors.push(
      `docs/COPY.md has ${unparsedRows.length} row(s) in §3-§8 that could not be parsed:\n` +
        unparsedRows.map((r) => `  ${r}`).join('\n'),
    );
  }

  let actualEnRaw: string;
  let actualArRaw: string;
  let actualEn: CopyMap;
  let actualAr: CopyMap;
  try {
    actualEnRaw = readFileSync(EN_JSON_PATH, 'utf-8');
    actualEn = readJson(EN_JSON_PATH);
  } catch {
    errors.push(`src/i18n/en.json is missing or invalid JSON. Run \`npm run gen:i18n\`.`);
    actualEnRaw = '';
    actualEn = {};
  }
  try {
    actualArRaw = readFileSync(AR_JSON_PATH, 'utf-8');
    actualAr = readJson(AR_JSON_PATH);
  } catch {
    errors.push(`src/i18n/ar.json is missing or invalid JSON. Run \`npm run gen:i18n\`.`);
    actualArRaw = '';
    actualAr = {};
  }

  const expectedEnRaw = toJsonFileContents(expectedEn);
  const expectedArRaw = toJsonFileContents(expectedAr);

  if (actualEnRaw !== expectedEnRaw) {
    errors.push(
      'src/i18n/en.json is out of date with docs/COPY.md. docs/COPY.md is the source of truth: run `npm run gen:i18n` and commit the result.',
    );
  }
  if (actualArRaw !== expectedArRaw) {
    errors.push(
      'src/i18n/ar.json is out of date with docs/COPY.md. docs/COPY.md is the source of truth: run `npm run gen:i18n` and commit the result.',
    );
  }

  // (b) key sets must match between en and ar.
  const enKeys = new Set(Object.keys(actualEn));
  const arKeys = new Set(Object.keys(actualAr));
  for (const key of enKeys) {
    if (!arKeys.has(key)) errors.push(`Key "${key}" exists in en.json but not ar.json.`);
  }
  for (const key of arKeys) {
    if (!enKeys.has(key)) errors.push(`Key "${key}" exists in ar.json but not en.json.`);
  }

  // (c) placeholders must match per key/plural form, and
  // (d) plural keys must carry all required forms.
  for (const key of enKeys) {
    if (!arKeys.has(key)) continue; // already reported above
    const enValue = actualEn[key];
    const arValue = actualAr[key];

    const enIsPlural = isPluralValue(enValue);
    const arIsPlural = isPluralValue(arValue);

    if (enIsPlural !== arIsPlural) {
      errors.push(`Key "${key}" is a plural entry in one language but not the other.`);
      continue;
    }

    if (!enIsPlural && !arIsPlural) {
      const enText = enValue as string;
      const arText = arValue as string;
      if (!sameSet(placeholders(enText), placeholders(arText))) {
        errors.push(
          `Key "${key}" has mismatched placeholders: en={${[...placeholders(enText)].join(', ')}} ar={${[...placeholders(arText)].join(', ')}}`,
        );
      }
      continue;
    }

    // Plural entry: check required forms and per-form placeholders.
    const enForms = enValue as Record<string, string>;
    const arForms = arValue as Record<string, string>;

    for (const form of EN_REQUIRED_PLURAL_FORMS) {
      if (!(form in enForms)) {
        errors.push(`Plural key "${key}" (en) is missing required form "${form}".`);
      }
    }
    for (const form of AR_REQUIRED_PLURAL_FORMS) {
      if (!(form in arForms)) {
        errors.push(`Plural key "${key}" (ar) is missing required form "${form}".`);
      }
    }

    const commonForms = Object.keys(enForms).filter((f) => f in arForms);
    for (const form of commonForms) {
      if (!sameSet(placeholders(enForms[form]), placeholders(arForms[form]))) {
        errors.push(
          `Plural key "${key}" form "${form}" has mismatched placeholders: en={${[...placeholders(enForms[form])].join(', ')}} ar={${[...placeholders(arForms[form])].join(', ')}}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error(`i18n check FAILED (${errors.length} issue(s)):\n`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`i18n check passed: ${enKeys.size} keys, en/ar in sync with docs/COPY.md.`);
}

main();
