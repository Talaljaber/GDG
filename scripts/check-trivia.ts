#!/usr/bin/env -S npx tsx
/**
 * Validates docs/content/trivia-questions.json against the JSON Schema
 * documented in docs/content/trivia-format.md §2 (extracted from that doc's
 * first ```json block, so the schema has a single source of truth), plus
 * the extra checks listed right after it that JSON Schema can't express:
 *
 *  - ids are exactly q01…q30, in order, each once; slot buckets match §1.
 *  - no two ready questions share the same English question text or the
 *    same correct answer text (options[0].en).
 *
 * `--strict` (run before content freeze) additionally requires every
 * question to be `ready` with >= 2 names in `reviewed_by`.
 *
 * Run with `npm run check:trivia` (or `npx tsx scripts/check-trivia.ts
 * [--strict]`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = join(import.meta.dirname, '..');
const FORMAT_DOC_PATH = join(ROOT, 'docs/content/trivia-format.md');
const DATA_PATH = join(ROOT, 'docs/content/trivia-questions.json');

/** Slot -> expected bucket, per trivia-format.md §1. */
const SLOT_BUCKETS: Array<{ from: number; to: number; bucket: string }> = [
  { from: 1, to: 12, bucket: 'google_dev' },
  { from: 13, to: 24, bucket: 'ai_basics' },
  { from: 25, to: 30, bucket: 'gdg_community' },
];

interface QuestionText {
  en: string;
  ar: string;
}

interface Question {
  id: string;
  status: 'draft' | 'ready';
  bucket: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: QuestionText;
  options: QuestionText[];
  source: string;
  reviewed_by: string[];
  notes?: string;
}

interface TriviaFile {
  _meta: {
    purpose: string;
    last_updated: string;
    format_doc: string;
    schema_version: number;
  };
  questions: Question[];
}

/** Extracts the first ```json ... ``` fenced block from a Markdown file and parses it. */
function extractJsonSchema(markdownPath: string): unknown {
  const markdown = readFileSync(markdownPath, 'utf-8');
  const match = markdown.match(/```json\r?\n([\s\S]*?)```/);
  if (!match) {
    throw new Error(`No \`\`\`json code block found in ${markdownPath}`);
  }
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    throw new Error(
      `The first \`\`\`json block in ${markdownPath} is not valid JSON: ${(err as Error).message}`,
    );
  }
}

function bucketForSlot(index1: number): string | null {
  for (const slot of SLOT_BUCKETS) {
    if (index1 >= slot.from && index1 <= slot.to) return slot.bucket;
  }
  return null;
}

function main() {
  const strict = process.argv.includes('--strict');
  const errors: string[] = [];

  // 1. Load and compile the schema from the format doc (single source of truth).
  let schema: unknown;
  try {
    schema = extractJsonSchema(FORMAT_DOC_PATH);
  } catch (err) {
    console.error(`check-trivia FAILED: ${(err as Error).message}`);
    process.exit(1);
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema as Record<string, unknown>);

  // 2. Load the data file.
  let raw: string;
  try {
    raw = readFileSync(DATA_PATH, 'utf-8');
  } catch {
    console.error(`check-trivia FAILED: could not read ${DATA_PATH}`);
    process.exit(1);
  }

  let data: TriviaFile;
  try {
    data = JSON.parse(raw) as TriviaFile;
  } catch (err) {
    console.error(`check-trivia FAILED: ${DATA_PATH} is not valid JSON: ${(err as Error).message}`);
    process.exit(1);
  }

  // 3. JSON Schema validation.
  const valid = validate(data);
  if (!valid) {
    for (const e of validate.errors ?? []) {
      errors.push(`schema: ${e.instancePath || '(root)'} ${e.message}`);
    }
  }

  const questions = Array.isArray(data.questions) ? data.questions : [];

  // 4. ids are exactly q01…q30, in order, each once; slot buckets match §1.
  if (questions.length !== 30) {
    errors.push(`expected exactly 30 questions, found ${questions.length}`);
  }
  questions.forEach((q, i) => {
    const expectedId = `q${String(i + 1).padStart(2, '0')}`;
    if (q.id !== expectedId) {
      errors.push(`slot ${i + 1}: expected id "${expectedId}", found "${q.id ?? '(missing)'}"`);
    }
    const expectedBucket = bucketForSlot(i + 1);
    if (expectedBucket && q.bucket !== expectedBucket) {
      errors.push(
        `${q.id ?? `slot ${i + 1}`}: expected bucket "${expectedBucket}" for this slot, found "${q.bucket}"`,
      );
    }
  });
  const ids = questions.map((q) => q.id).filter(Boolean);
  const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicateIds.length > 0) {
    errors.push(`duplicate ids: ${[...new Set(duplicateIds)].join(', ')}`);
  }

  const readyQuestions = questions.filter((q) => q.status === 'ready');

  // 5. No two ready questions share the same English question text or the same correct answer text.
  const seenQuestionText = new Map<string, string>();
  const seenAnswerText = new Map<string, string>();
  for (const q of readyQuestions) {
    const qText = q.question?.en;
    if (qText) {
      const prior = seenQuestionText.get(qText);
      if (prior) {
        errors.push(`${q.id} duplicates the English question text of ${prior}: "${qText}"`);
      } else {
        seenQuestionText.set(qText, q.id);
      }
    }
    const answerText = q.options?.[0]?.en;
    if (answerText) {
      const prior = seenAnswerText.get(answerText);
      if (prior) {
        errors.push(`${q.id} duplicates the correct answer text of ${prior}: "${answerText}"`);
      } else {
        seenAnswerText.set(answerText, q.id);
      }
    }
  }

  // 6. --strict: every question ready with >= 2 reviewed_by names.
  if (strict) {
    for (const q of questions) {
      if (q.status !== 'ready') {
        errors.push(`--strict: ${q.id} is not "ready" (status: "${q.status}")`);
        continue;
      }
      const reviewers = Array.isArray(q.reviewed_by) ? q.reviewed_by : [];
      if (reviewers.length < 2) {
        errors.push(
          `--strict: ${q.id} has only ${reviewers.length} reviewer(s) in reviewed_by, needs >= 2`,
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error(
      `check-trivia FAILED${strict ? ' (--strict)' : ''} (${errors.length} issue(s)):\n`,
    );
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `check-trivia passed${strict ? ' (--strict)' : ''}: ${questions.length} questions, ${readyQuestions.length} ready.`,
  );
}

main();
