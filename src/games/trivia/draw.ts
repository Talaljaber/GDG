/**
 * The per-player draw from the trivia pool. Source of truth:
 * docs/games/trivia.md §2, docs/content/trivia-format.md §2. Pure and
 * seeded: no DOM, no wall-clock time, all randomness from `src/lib/rng.ts`.
 */
import { Rng } from '../../lib/rng';

export type TriviaBucket =
  | 'google_dev'
  | 'ai_basics'
  | 'gdg_community'
  // the family test set (trivia-format.md §7, ADR-133)
  | 'family_everyday'
  | 'family_world'
  | 'family_science'
  | 'family_culture';
export type TriviaDifficulty = 'easy' | 'medium' | 'hard';
export type TriviaStatus = 'draft' | 'ready';

export interface TriviaText {
  en: string;
  ar: string;
}

/** One entry of `docs/content/trivia-questions.json` (trivia-format.md §2). */
export interface TriviaPoolQuestion {
  id: string;
  status: TriviaStatus;
  bucket: TriviaBucket;
  difficulty: TriviaDifficulty;
  question: TriviaText;
  options: TriviaText[];
  source: string;
  reviewed_by: string[];
  notes?: string;
}

/** The shape of the whole `trivia-questions.json` file. */
export interface TriviaPoolFile {
  _meta: {
    purpose: string;
    last_updated: string;
    format_doc: string;
    schema_version: number;
  };
  questions: TriviaPoolQuestion[];
}

/** One question drawn for a player, options shuffled, correct index kept in memory only. */
export interface DrawnTriviaQuestion {
  id: string;
  bucket: TriviaBucket;
  difficulty: TriviaDifficulty;
  question: TriviaText;
  /** The 4 options, already shuffled for this player. */
  options: TriviaText[];
  /** Index into `options` of the correct answer, after shuffling. */
  correctIndex: number;
}

/** Bucket draw targets (docs/games/trivia.md §2.2): 2 google_dev, 2 ai_basics, 1 gdg_community. */
const BUCKET_TARGETS: ReadonlyArray<readonly [TriviaBucket, number]> = [
  ['google_dev', 2],
  ['ai_basics', 2],
  ['gdg_community', 1],
];

const DIFFICULTY_ORDER: readonly TriviaDifficulty[] = ['easy', 'medium', 'hard'];

/**
 * Family test set draw targets (docs/games/trivia.md §2.7, ADR-133): by
 * difficulty instead of bucket, so every player gets a mix, 2 easy, 2 medium, 1 hard.
 */
const FAMILY_DIFFICULTY_TARGETS: ReadonlyArray<readonly [TriviaDifficulty, number]> = [
  ['easy', 2],
  ['medium', 2],
  ['hard', 1],
];

/** True for a pool whose ready questions come from the family test set. */
export function isFamilyPool(ready: readonly TriviaPoolQuestion[]): boolean {
  return ready.length > 0 && ready.every((q) => q.bucket.startsWith('family_'));
}

/** Minimum ready questions for Trivia to be offered in the lineup picker (§2.6). */
export const TRIVIA_MIN_READY = 5;

export const TRIVIA_QUESTIONS_PER_PLAYER = 5;

/** Only `status: "ready"` questions are ever used (docs/games/trivia.md §2.1). */
export function readyQuestions(pool: readonly TriviaPoolQuestion[]): TriviaPoolQuestion[] {
  return pool.filter((q) => q.status === 'ready');
}

/** True when the pool has enough ready questions to draw a full 5-question round. */
export function isTriviaAvailable(pool: readonly TriviaPoolQuestion[]): boolean {
  return readyQuestions(pool).length >= TRIVIA_MIN_READY;
}

/**
 * Draws and orders 5 questions for one player from the ready subset of
 * `pool`, using `seed` (the per-round seed) for every random choice, so a
 * reload with the same seed reproduces the same draw and option order
 * (docs/games/trivia.md §2, TRV-T9).
 */
export function drawTriviaQuestions(
  pool: readonly TriviaPoolQuestion[],
  seed: string,
): DrawnTriviaQuestion[] {
  const rng = new Rng(seed);
  const ready = readyQuestions(pool);

  const byBucket = new Map<TriviaBucket, TriviaPoolQuestion[]>();
  for (const q of ready) {
    const list = byBucket.get(q.bucket);
    if (list) {
      list.push(q);
    } else {
      byBucket.set(q.bucket, [q]);
    }
  }

  const picked: TriviaPoolQuestion[] = [];
  const pickedIds = new Set<string>();

  if (isFamilyPool(ready)) {
    // Family set: 2 easy, 2 medium, 1 hard, preferring a bucket not picked yet.
    const usedBuckets = new Set<TriviaBucket>();
    for (const [difficulty, target] of FAMILY_DIFFICULTY_TARGETS) {
      const candidates = rng.shuffle(ready.filter((q) => q.difficulty === difficulty));
      for (let n = 0; n < target; n++) {
        const open = candidates.filter((q) => !pickedIds.has(q.id));
        const q = open.find((c) => !usedBuckets.has(c.bucket)) ?? open[0];
        if (!q) break;
        picked.push(q);
        pickedIds.add(q.id);
        usedBuckets.add(q.bucket);
      }
    }
  } else {
    // Step 1-2: 2 from google_dev, 2 from ai_basics, 1 from gdg_community, without replacement.
    for (const [bucket, target] of BUCKET_TARGETS) {
      const available = (byBucket.get(bucket) ?? []).filter((q) => !pickedIds.has(q.id));
      const take = Math.min(target, available.length);
      for (const q of rng.sampleWithoutReplacement(available, take)) {
        picked.push(q);
        pickedIds.add(q.id);
      }
    }
  }

  // Step 3: if a bucket came up short, fill the gap from any other ready
  // question not already picked, still without replacement.
  const wanted = BUCKET_TARGETS.reduce((sum, [, target]) => sum + target, 0);
  if (picked.length < wanted) {
    const remaining = ready.filter((q) => !pickedIds.has(q.id));
    const need = Math.min(wanted - picked.length, remaining.length);
    for (const q of rng.sampleWithoutReplacement(remaining, need)) {
      picked.push(q);
      pickedIds.add(q.id);
    }
  }

  // Step 4: order by difficulty easy -> medium -> hard, random within a difficulty.
  const byDifficulty = new Map<TriviaDifficulty, TriviaPoolQuestion[]>();
  for (const q of picked) {
    const list = byDifficulty.get(q.difficulty);
    if (list) {
      list.push(q);
    } else {
      byDifficulty.set(q.difficulty, [q]);
    }
  }
  const ordered: TriviaPoolQuestion[] = [];
  for (const difficulty of DIFFICULTY_ORDER) {
    ordered.push(...rng.shuffle(byDifficulty.get(difficulty) ?? []));
  }

  // Step 5: shuffle each question's 4 options (Fisher-Yates, seeded). In the
  // file, options[0] is always correct; track its new position in memory only.
  return ordered.map((q) => {
    const originalIndices = [0, 1, 2, 3];
    const shuffledIndices = rng.shuffle(originalIndices);
    const options = shuffledIndices.map((i) => q.options[i]);
    const correctIndex = shuffledIndices.indexOf(0);
    return {
      id: q.id,
      bucket: q.bucket,
      difficulty: q.difficulty,
      question: q.question,
      options,
      correctIndex,
    };
  });
}
