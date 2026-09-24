import { describe, expect, it } from 'vitest';
import {
  drawTriviaQuestions,
  isTriviaAvailable,
  readyQuestions,
  TRIVIA_QUESTIONS_PER_PLAYER,
  type TriviaBucket,
  type TriviaDifficulty,
  type TriviaPoolQuestion,
} from './draw';

function text(s: string) {
  return { en: s, ar: s };
}

function makeQuestion(
  id: string,
  bucket: TriviaBucket,
  difficulty: TriviaDifficulty,
  status: TriviaPoolQuestion['status'] = 'ready',
): TriviaPoolQuestion {
  return {
    id,
    status,
    bucket,
    difficulty,
    question: text(`question ${id}?`),
    options: [text(`${id} correct`), text(`${id} wrong 1`), text(`${id} wrong 2`), text(`${id} wrong 3`)],
    source: 'common knowledge',
    reviewed_by: ['a', 'b'],
  };
}

/** A full, evenly-stocked pool: 12 google_dev, 12 ai_basics, 6 gdg_community, all ready. */
function fullPool(): TriviaPoolQuestion[] {
  const pool: TriviaPoolQuestion[] = [];
  const difficulties: TriviaDifficulty[] = ['easy', 'medium', 'hard'];
  for (let i = 1; i <= 12; i++) {
    pool.push(makeQuestion(`gd${i}`, 'google_dev', difficulties[i % 3]));
  }
  for (let i = 1; i <= 12; i++) {
    pool.push(makeQuestion(`ai${i}`, 'ai_basics', difficulties[i % 3]));
  }
  for (let i = 1; i <= 6; i++) {
    pool.push(makeQuestion(`gdg${i}`, 'gdg_community', difficulties[i % 3]));
  }
  return pool;
}

describe('isTriviaAvailable', () => {
  it('true when >= 5 ready questions', () => {
    const pool = fullPool();
    expect(isTriviaAvailable(pool)).toBe(true);
  });

  it('false when fewer than 5 ready questions', () => {
    const pool = [
      makeQuestion('q01', 'google_dev', 'easy'),
      makeQuestion('q02', 'google_dev', 'easy'),
      makeQuestion('q03', 'ai_basics', 'easy', 'draft'),
      makeQuestion('q04', 'ai_basics', 'easy', 'draft'),
    ];
    expect(isTriviaAvailable(pool)).toBe(false);
  });

  it('ignores draft questions', () => {
    const pool = fullPool().map((q, i) => (i < 3 ? { ...q, status: 'draft' as const } : q));
    expect(readyQuestions(pool).length).toBe(fullPool().length - 3);
  });
});

describe('drawTriviaQuestions: TRV-T3 (10,000 draws from a full pool)', () => {
  it('never repeats an id within a draw, and always splits 2/2/1 by bucket', () => {
    const pool = fullPool();
    for (let i = 0; i < 10_000; i++) {
      const drawn = drawTriviaQuestions(pool, `seed-${i}`);
      expect(drawn).toHaveLength(TRIVIA_QUESTIONS_PER_PLAYER);

      const ids = drawn.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);

      const counts: Partial<Record<TriviaBucket, number>> = { google_dev: 0, ai_basics: 0, gdg_community: 0 };
      for (const q of drawn) counts[q.bucket] = (counts[q.bucket] ?? 0) + 1;
      expect(counts).toEqual({ google_dev: 2, ai_basics: 2, gdg_community: 1 });
    }
  });

  it('orders the five by difficulty easy -> medium -> hard', () => {
    const pool = fullPool();
    const rank: Record<TriviaDifficulty, number> = { easy: 0, medium: 1, hard: 2 };
    for (let i = 0; i < 200; i++) {
      const drawn = drawTriviaQuestions(pool, `order-seed-${i}`);
      const ranks = drawn.map((q) => rank[q.difficulty]);
      const sorted = [...ranks].sort((a, b) => a - b);
      expect(ranks).toEqual(sorted);
    }
  });
});

describe('drawTriviaQuestions: TRV-T4 (a short bucket fills from others)', () => {
  it('still returns 5 unique questions when a bucket is short', () => {
    const pool: TriviaPoolQuestion[] = [
      ...Array.from({ length: 6 }, (_, i) => makeQuestion(`gd${i + 1}`, 'google_dev', 'easy')),
      // 0 ready ai_basics questions (all drafts).
      makeQuestion('ai1', 'ai_basics', 'easy', 'draft'),
      makeQuestion('ai2', 'ai_basics', 'easy', 'draft'),
      // 1 ready gdg_community question.
      makeQuestion('gdg1', 'gdg_community', 'easy'),
    ];

    for (let i = 0; i < 500; i++) {
      const drawn = drawTriviaQuestions(pool, `short-seed-${i}`);
      expect(drawn).toHaveLength(TRIVIA_QUESTIONS_PER_PLAYER);
      const ids = drawn.map((q) => q.id);
      expect(new Set(ids).size).toBe(5);
      // The single gdg_community question and all 5 must come from ready questions.
      expect(ids.every((id) => id.startsWith('gd'))).toBe(true);
    }
  });
});

describe('drawTriviaQuestions: TRV-T5 (option shuffle distribution)', () => {
  it('the correct answer lands in each of the 4 positions ~25% +-2% over 10,000 draws', () => {
    const pool = [makeQuestion('q01', 'google_dev', 'easy')];
    const counts = [0, 0, 0, 0];
    const trials = 10_000;
    for (let i = 0; i < trials; i++) {
      const [drawn] = drawTriviaQuestions(pool, `opt-seed-${i}`);
      counts[drawn.correctIndex]++;
      // The correct option's text always travels with the correct index.
      expect(drawn.options[drawn.correctIndex].en).toBe('q01 correct');
    }
    for (const count of counts) {
      const pct = count / trials;
      expect(pct).toBeGreaterThan(0.23);
      expect(pct).toBeLessThan(0.27);
    }
  });
});

describe('drawTriviaQuestions: TRV-T9 (determinism)', () => {
  it('the same seed after reload reproduces the same questions and option order', () => {
    const pool = fullPool();
    const first = drawTriviaQuestions(pool, 'round-seed-abc');
    const second = drawTriviaQuestions(pool, 'round-seed-abc');
    expect(second).toEqual(first);
  });

  it('different seeds usually produce a different draw or order', () => {
    const pool = fullPool();
    const a = drawTriviaQuestions(pool, 'seed-a');
    const b = drawTriviaQuestions(pool, 'seed-b');
    expect(a).not.toEqual(b);
  });
});

describe('drawTriviaQuestions: pool fixture sanity', () => {
  it('draws from the real docs/content/trivia-questions.json without throwing', async () => {
    const poolFile = (await import('../../../docs/content/trivia-questions.json')).default;
    const pool = poolFile.questions as TriviaPoolQuestion[];
    // The shipped pool currently has only 3 ready questions (below TRIVIA_MIN_READY);
    // this just checks the draw degrades gracefully rather than throwing.
    expect(() => drawTriviaQuestions(pool, 'sanity-seed')).not.toThrow();
    expect(isTriviaAvailable(pool)).toBe(readyQuestions(pool).length >= 5);
  });
});

describe('drawTriviaQuestions: family test set (ADR-133, trivia.md §2.7)', () => {
  async function familyPool(): Promise<TriviaPoolQuestion[]> {
    const poolFile = (await import('../../../docs/content/trivia-questions-family.json')).default;
    return poolFile.questions as TriviaPoolQuestion[];
  }

  it('TRV-T10: 10,000 draws give 2 easy, 2 medium, 1 hard, unique ids, easy -> hard order', async () => {
    const pool = await familyPool();
    expect(isTriviaAvailable(pool)).toBe(true);
    for (let i = 0; i < 10_000; i++) {
      const drawn = drawTriviaQuestions(pool, `family-${i}`);
      expect(drawn).toHaveLength(TRIVIA_QUESTIONS_PER_PLAYER);
      expect(new Set(drawn.map((q) => q.id)).size).toBe(5);
      expect(drawn.map((q) => q.difficulty)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard']);
      // 4 buckets, 5 questions: the bucket preference always reaches all 4.
      expect(new Set(drawn.map((q) => q.bucket)).size).toBe(4);
    }
  });

  it('TRV-T11: every family question is drawn at some point', async () => {
    const pool = await familyPool();
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i++) {
      for (const q of drawTriviaQuestions(pool, `cover-${i}`)) seen.add(q.id);
    }
    expect(seen.size).toBe(pool.length);
  });

  it('a mixed pool (event + family buckets) keeps the event draw', () => {
    const pool = [...fullPool(), makeQuestion('f1', 'family_world', 'easy')];
    const drawn = drawTriviaQuestions(pool, 'mixed');
    const buckets = drawn.map((q) => q.bucket);
    expect(buckets.filter((b) => b === 'google_dev')).toHaveLength(2);
    expect(buckets.filter((b) => b === 'ai_basics')).toHaveLength(2);
    expect(buckets.filter((b) => b === 'gdg_community')).toHaveLength(1);
  });
});
