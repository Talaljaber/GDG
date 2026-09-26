import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dueEpoch, HowMany, type HowManySnapshot } from './HowMany';
import type { GameProps, GameResult } from '../types';
import { fieldFor } from './field';
import { scoreHowMany, validateHowManyRaw, type HowManyRaw } from './scoring';

vi.mock('../../i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key,
  useLang: () => ({ lang: 'en' as const, dir: 'ltr' as const, setLang: vi.fn() }),
}));

const ROUND_START = 1_700_000_000_000;
const SEED = 'hm-test-seed';

function advance(ms: number) {
  for (let t = 0; t < ms; t += 50) {
    act(() => {
      vi.advanceTimersByTime(Math.min(50, ms - t));
    });
  }
}

function renderGame(overrides: Partial<GameProps<HowManySnapshot>> = {}) {
  const onProgress = vi.fn<(s: HowManySnapshot) => void>();
  const onFinish = vi.fn<(r: GameResult) => void>();
  const props: GameProps<HowManySnapshot> = {
    seed: SEED,
    roundStartEpoch: ROUND_START,
    roundEnded: false,
    snapshot: null,
    onProgress,
    onFinish,
    ...overrides,
  };
  const utils = render(<HowMany {...props} />);
  return {
    ...utils,
    onProgress,
    onFinish,
    rerenderWith: (next: Partial<GameProps<HowManySnapshot>>) => utils.rerender(<HowMany {...props} {...next} />),
    last: () => onProgress.mock.calls[onProgress.mock.calls.length - 1][0],
  };
}

const q = (c: HTMLElement, id: string) => c.querySelector(`[data-testid="${id}"]`);
const chevrons = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-testid="hm-chevron"]'));

function press(c: HTMLElement, key: string) {
  const el = q(c, `hm-key-${key}`);
  if (!el) throw new Error(`no key ${key}`);
  fireEvent.pointerDown(el);
  // past the 60 ms bounce guard
  act(() => {
    vi.advanceTimersByTime(70);
  });
}

function type(c: HTMLElement, digits: string) {
  for (const d of digits) press(c, d);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  vi.setSystemTime(ROUND_START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('How Many?: flow', () => {
  it('intro 1.5 s -> look 1 s -> flash exactly 2.5 s -> answer; three answers finish once', () => {
    const { container, onFinish, last } = renderGame();
    expect(q(container, 'hm-intro')).not.toBeNull();
    advance(1450);
    expect(q(container, 'hm-intro')).not.toBeNull();
    advance(50);
    expect(q(container, 'hm-look')).not.toBeNull();
    expect(q(container, 'hm-fixation')).not.toBeNull();
    expect(chevrons(container)).toHaveLength(0);
    expect(last()).toMatchObject({ phase: 'look', roundIndex: 0, lookStartEpoch: ROUND_START + 1500 });

    const guesses = ['10', '11', '16'];
    for (let i = 0; i < 3; i++) {
      const lookStart = last().lookStartEpoch as number;
      expect(Date.now()).toBe(lookStart);
      act(() => {
        vi.advanceTimersByTime(999);
      });
      expect(chevrons(container)).toHaveLength(0);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      // The whole field in one commit: N_i chevrons on the first frame.
      expect(chevrons(container)).toHaveLength(fieldFor(SEED, i).count);
      expect(last()).toMatchObject({ phase: 'flash', flashStartEpoch: lookStart + 1000 });
      const nodes = chevrons(container);
      const html = nodes.map((n) => n.outerHTML);
      advance(2450);
      // Nothing in the field changes between mount and unmount.
      expect(chevrons(container)).toEqual(nodes);
      expect(chevrons(container).map((n) => n.outerHTML)).toEqual(html);
      advance(50);
      expect(chevrons(container)).toHaveLength(0);
      expect(q(container, 'hm-answer')).not.toBeNull();
      expect(last()).toMatchObject({ phase: 'answer', answerStartEpoch: lookStart + 3500, typed: '' });

      advance(1500);
      type(container, guesses[i]);
      expect(q(container, 'hm-typed')?.textContent).toBe(guesses[i]);
      press(container, 'ok');
      expect(q(container, 'hm-locked')?.textContent).toContain('game.how_many.locked');
      expect(last().rounds).toHaveLength(i + 1);
      advance(430); // "locked in" is 0.5 s; press() already stepped 70 ms
    }

    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    const raw = result.raw as HowManyRaw;
    expect(raw.rounds.map((r) => r.true_count)).toEqual([0, 1, 2].map((i) => fieldFor(SEED, i).count));
    expect(raw.rounds.map((r) => r.guess)).toEqual([10, 11, 16]);
    for (const r of raw.rounds) {
      expect(r.timed_out).toBe(false);
      expect(r.answer_ms).toBe(1500 + 70 * 2); // 1.5 s wait, then two digits and OK 70 ms apart
    }
    expect(result.score).toBe(scoreHowMany(raw));
    expect(validateHowManyRaw(raw, result.score)).toBeNull();
    advance(5000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('HM-T12: an idle player gets three nulls and 0, finished inside the 60 s worst case', () => {
    const { onFinish } = renderGame();
    advance(58_500 - 50);
    expect(onFinish).not.toHaveBeenCalled();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect((result.raw as HowManyRaw).rounds.map((r) => [r.guess, r.answer_ms, r.timed_out])).toEqual([
      [null, null, true],
      [null, null, true],
      [null, null, true],
    ]);
    expect(result.score).toBe(0);
    expect(result.durationMs).toBeLessThanOrEqual(60_000);
    expect(validateHowManyRaw(result.raw, 0)).toBeNull();
  });

  it('the pad: max 3 digits, backspace, leading zeros, OK disabled while empty, taps outside answer ignored', () => {
    const { container, last } = renderGame();
    advance(1500);
    expect(q(container, 'hm-key-5')).toBeNull(); // no pad during the look
    advance(3500);
    expect(q(container, 'hm-key-ok')?.hasAttribute('disabled')).toBe(true);
    press(container, 'ok');
    expect(last().phase).toBe('answer');
    type(container, '0071');
    expect(last().typed).toBe('007');
    expect(q(container, 'hm-typed')?.textContent).toBe('007');
    press(container, 'back');
    expect(last().typed).toBe('00');
    press(container, '7');
    press(container, 'ok');
    expect(last().rounds[0]).toMatchObject({ guess: 7, timed_out: false });
  });

  it('a bounce (second pointerdown within 60 ms) is ignored', () => {
    const { container, last } = renderGame();
    advance(5000);
    const key = q(container, 'hm-key-4') as HTMLElement;
    fireEvent.pointerDown(key);
    fireEvent.pointerDown(key);
    expect(last().typed).toBe('4');
  });

  it('an OK within 300 ms of the pad appearing is ignored (never a too_fast score)', () => {
    const { container, last } = renderGame();
    advance(5000);
    fireEvent.pointerDown(q(container, 'hm-key-9') as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerDown(q(container, 'hm-key-ok') as HTMLElement);
    expect(last().phase).toBe('answer');
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.pointerDown(q(container, 'hm-key-ok') as HTMLElement);
    expect(last().rounds[0]).toMatchObject({ guess: 9, answer_ms: 350, timed_out: false });
  });

  it('each answer times out after 15 s: typed digits count, nothing typed = null', () => {
    const { container, last } = renderGame();
    advance(5000); // answer 1 open
    type(container, '13');
    advance(15_000 - 140 - 60);
    expect(last().phase).toBe('answer');
    expect(q(container, 'hm-seconds')?.textContent).toBe('1');
    advance(100);
    expect(last().phase).toBe('locked');
    expect(last().rounds[0]).toEqual({ true_count: fieldFor(SEED, 0).count, guess: 13, answer_ms: null, timed_out: true });
    expect(q(container, 'hm-locked')?.textContent).toContain('game.how_many.timeout');
    advance(500 + 3500 + 15_000);
    expect(last().rounds[1]).toEqual({ true_count: fieldFor(SEED, 1).count, guess: null, answer_ms: null, timed_out: true });
  });

  it('"round ended" finishes at once: the open flash keeps its digits, unstarted flashes are null', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(5000 + 1000);
    type(container, '12');
    press(container, 'ok');
    advance(500 + 3500);
    type(container, '3');
    rerenderWith({ roundEnded: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
    const raw = onFinish.mock.calls[0][0].raw as HowManyRaw;
    expect(raw.rounds.map((r) => [r.guess, r.timed_out])).toEqual([
      [12, false],
      [3, true],
      [null, true],
    ]);
    expect(validateHowManyRaw(raw, onFinish.mock.calls[0][0].score)).toBeNull();
    rerenderWith({ roundEnded: true });
    advance(20_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('"round ended" during the flash unmounts the field and scores it as no answer', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(2550);
    expect(chevrons(container).length).toBeGreaterThan(0);
    rerenderWith({ roundEnded: true });
    expect(chevrons(container)).toHaveLength(0);
    expect(q(container, 'hm-done')).not.toBeNull();
    const raw = onFinish.mock.calls[0][0].raw as HowManyRaw;
    expect(raw.rounds.every((r) => r.guess === null && r.timed_out)).toBe(true);
    expect(onFinish.mock.calls[0][0].score).toBe(0);
  });
});

describe('How Many?: reload and screen lock (ADR-018)', () => {
  function snap(over: Partial<HowManySnapshot>): HowManySnapshot {
    return {
      phase: 'look',
      roundIndex: 1,
      lookStartEpoch: null,
      flashStartEpoch: null,
      answerStartEpoch: null,
      lockedEndEpoch: null,
      typed: '',
      rounds: [{ true_count: fieldFor(SEED, 0).count, guess: 11, answer_ms: 2100, timed_out: false }],
      ...over,
    };
  }

  it('HM-T11: a reload during the flash never shows the field; the deadline is flashStart + 17.5 s', () => {
    const flashStart = ROUND_START + 20_000;
    vi.setSystemTime(flashStart + 400);
    const { container, last, onProgress } = renderGame({ snapshot: snap({ phase: 'flash', lookStartEpoch: flashStart - 1000, flashStartEpoch: flashStart }) });
    expect(chevrons(container)).toHaveLength(0);
    expect(q(container, 'hm-answer')).not.toBeNull();
    expect(onProgress).toHaveBeenCalled();
    expect(last()).toMatchObject({ phase: 'answer', answerStartEpoch: flashStart + 2500 });
    expect(q(container, 'hm-seconds')?.textContent).toBe('15');
    advance(17_500 - 400 - 50);
    expect(last().phase).toBe('answer');
    expect(chevrons(container)).toHaveLength(0);
    advance(100);
    expect(last().phase).toBe('locked');
    expect(last().rounds[1]).toMatchObject({ guess: null, timed_out: true });
  });

  it('a reload after the look ended skips the flash; the answer counts from lookStart + 3.5 s', () => {
    const lookStart = ROUND_START + 20_000;
    vi.setSystemTime(lookStart + 1200);
    const { container, last } = renderGame({ snapshot: snap({ lookStartEpoch: lookStart }) });
    expect(chevrons(container)).toHaveLength(0);
    expect(last()).toMatchObject({ phase: 'answer', answerStartEpoch: lookStart + 3500, flashStartEpoch: null });
    // an OK tap right away is measured from the pad appearing (never below 300 ms, never negative)
    type(container, '25');
    advance(200);
    press(container, 'ok');
    expect(last().rounds[1]).toMatchObject({ guess: 25, answer_ms: 340, timed_out: false });
  });

  it('a reload during the look resumes it until lookStart + 1 s, then flashes', () => {
    const lookStart = ROUND_START + 20_000;
    vi.setSystemTime(lookStart + 300);
    const { container } = renderGame({ snapshot: snap({ lookStartEpoch: lookStart }) });
    expect(q(container, 'hm-look')).not.toBeNull();
    advance(650);
    expect(chevrons(container)).toHaveLength(0);
    advance(100);
    expect(chevrons(container)).toHaveLength(fieldFor(SEED, 1).count);
  });

  it('a reload during the answer restores the typed digits and keeps the deadline', () => {
    const answerStart = ROUND_START + 20_000;
    vi.setSystemTime(answerStart + 6000);
    const { container, last } = renderGame({
      snapshot: snap({ phase: 'answer', lookStartEpoch: answerStart - 3500, flashStartEpoch: answerStart - 2500, answerStartEpoch: answerStart, typed: '2' }),
    });
    expect(q(container, 'hm-typed')?.textContent).toBe('2');
    expect(q(container, 'hm-seconds')?.textContent).toBe('9');
    press(container, '6');
    press(container, 'ok');
    expect(last().rounds[1]).toMatchObject({ guess: 26, answer_ms: 6070, timed_out: false });
  });

  it('a reload during "locked in" of the last flash finishes at its stored time', () => {
    const lockedEnd = ROUND_START + 30_000;
    vi.setSystemTime(lockedEnd - 200);
    const rounds = [0, 1, 2].map((i) => ({ true_count: fieldFor(SEED, i).count, guess: 20, answer_ms: 2000, timed_out: false }));
    const { onFinish } = renderGame({ snapshot: snap({ phase: 'locked', roundIndex: 2, lockedEndEpoch: lockedEnd, rounds }) });
    advance(150);
    expect(onFinish).not.toHaveBeenCalled();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect((onFinish.mock.calls[0][0].raw as HowManyRaw).rounds).toEqual(rounds);
  });

  it('screen lock during the flash: on return the field is hidden at once and the answer runs with the remaining time', () => {
    const { container, last } = renderGame();
    advance(2550);
    const flashStart = last().flashStartEpoch as number;
    expect(chevrons(container).length).toBeGreaterThan(0);
    // the timer is throttled: time jumps 5 s past the flash's start without it firing
    vi.setSystemTime(flashStart + 5000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(chevrons(container)).toHaveLength(0);
    expect(last()).toMatchObject({ phase: 'answer', answerStartEpoch: flashStart + 2500 });
    expect(q(container, 'hm-seconds')?.textContent).toBe('13');
  });

  it('a look timer that fires late (screen locked) skips the flash', () => {
    const { container, last } = renderGame();
    advance(1500);
    const lookStart = last().lookStartEpoch as number;
    // the page was frozen: the clock jumped 2 s before the look timer could fire
    vi.setSystemTime(lookStart + 2000);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(chevrons(container)).toHaveLength(0);
    expect(last()).toMatchObject({ phase: 'answer', flashStartEpoch: null, answerStartEpoch: lookStart + 3500 });
  });
});

describe('How Many?: fixed schedule on stored epochs (ADR-137 (2))', () => {
  const looks = (calls: Array<[HowManySnapshot]>) =>
    calls.map(([s]) => s).filter((s) => s.phase === 'look').map((s) => s.lookStartEpoch);

  it('HM-T15: a reload during the intro keeps look 1 at roundStart + 1.5 s; a passed window skips the flash', () => {
    vi.setSystemTime(ROUND_START + 4900);
    const { container, last, onProgress, onFinish } = renderGame();
    // Everything overdue is applied before the first paint: no intro replay, no field.
    expect(q(container, 'hm-intro')).toBeNull();
    expect(chevrons(container)).toHaveLength(0);
    expect(looks(onProgress.mock.calls)).toEqual([ROUND_START + 1500]);
    expect(last()).toMatchObject({ phase: 'answer', roundIndex: 0, flashStartEpoch: null, answerStartEpoch: ROUND_START + 5000 });
    expect(q(container, 'hm-seconds')?.textContent).toBe('15');
    // The deadline is roundStart + 1.5 + 3.5 + 15 s; idle, the round still ends on the 58.5 s schedule.
    advance(ROUND_START + 20_000 - Date.now() - 50);
    expect(last().phase).toBe('answer');
    advance(100);
    expect(last().phase).toBe('locked');
    advance(ROUND_START + 58_500 - Date.now() - 50);
    expect(onFinish).not.toHaveBeenCalled();
    advance(100);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].durationMs).toBeLessThanOrEqual(58_550);
    expect(looks(onProgress.mock.calls)).toEqual([ROUND_START + 1500, ROUND_START + 20_500, ROUND_START + 39_500]);
  });

  it('HM-T15: a reload early in the intro only waits for what is left of it', () => {
    vi.setSystemTime(ROUND_START + 1000);
    const { container, last } = renderGame();
    expect(q(container, 'hm-intro')).not.toBeNull();
    advance(450);
    expect(q(container, 'hm-intro')).not.toBeNull();
    advance(50);
    expect(last()).toMatchObject({ phase: 'look', lookStartEpoch: ROUND_START + 1500 });
  });

  it('HM-T16: a screen lock in answer 1 that outlasts the round closes every overdue step on return and finishes by the worst case', () => {
    const { container, onFinish } = renderGame();
    advance(5500); // answer 1 open since roundStart + 5 s
    type(container, '1');
    // Frozen: the clock reaches roundStart + 60 s and no timer fires.
    vi.setSystemTime(ROUND_START + 60_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    const result = onFinish.mock.calls[0][0];
    expect((result.raw as HowManyRaw).rounds.map((r) => [r.guess, r.answer_ms, r.timed_out])).toEqual([
      [1, null, true], // the typed digit counts at the timeout
      [null, null, true],
      [null, null, true],
    ]);
    expect(result.durationMs).toBeLessThanOrEqual(60_000 + 100);
    expect(validateHowManyRaw(result.raw, result.score)).toBeNull();
    expect(chevrons(container)).toHaveLength(0);
  });

  it('HM-T16: a shorter lock returns the player to the step the schedule is on, with its remaining time', () => {
    const { container, last, onFinish, onProgress } = renderGame();
    advance(5500);
    vi.setSystemTime(ROUND_START + 30_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Answer 1 timed out at 20 s, locked until 20.5 s, look 2 at 20.5 s (window passed: no flash), answer 2 from 24 s.
    expect(last()).toMatchObject({ phase: 'answer', roundIndex: 1, lookStartEpoch: ROUND_START + 20_500, answerStartEpoch: ROUND_START + 24_000 });
    expect(last().rounds[0]).toMatchObject({ guess: null, timed_out: true });
    expect(q(container, 'hm-seconds')?.textContent).toBe('9');
    advance(ROUND_START + 58_500 - Date.now() + 50);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].durationMs).toBeLessThanOrEqual(58_600);
    expect(looks(onProgress.mock.calls)).toEqual([ROUND_START + 1500, ROUND_START + 20_500, ROUND_START + 39_500]);
  });

  it('HM-T17: a reload in "locked in" 4.5 s after it ended starts the next look at lockedEndEpoch, not at mount', () => {
    const lockedEnd = ROUND_START + 20_500;
    vi.setSystemTime(lockedEnd + 4500);
    const snapshot: HowManySnapshot = {
      phase: 'locked',
      roundIndex: 0,
      lookStartEpoch: ROUND_START + 1500,
      flashStartEpoch: ROUND_START + 2500,
      answerStartEpoch: ROUND_START + 5000,
      lockedEndEpoch: lockedEnd,
      typed: '',
      rounds: [{ true_count: fieldFor(SEED, 0).count, guess: 11, answer_ms: 2100, timed_out: false }],
    };
    const { container, last, onProgress } = renderGame({ snapshot });
    expect(looks(onProgress.mock.calls)).toEqual([lockedEnd]);
    expect(chevrons(container)).toHaveLength(0);
    expect(last()).toMatchObject({ phase: 'answer', roundIndex: 1, flashStartEpoch: null, answerStartEpoch: lockedEnd + 3500 });
    // The answer's clock started 1 s ago on the schedule, not at mount.
    expect(q(container, 'hm-seconds')?.textContent).toBe('14');
  });

  it('HM-T17: an OK tap ends "locked in" 0.5 s after the tap, and the next look starts there', () => {
    const { container, last } = renderGame();
    advance(5000); // answer 1 from roundStart + 5 s
    advance(1860);
    type(container, '12');
    const tap = Date.now();
    expect(tap).toBe(ROUND_START + 7000);
    press(container, 'ok');
    expect(last()).toMatchObject({ phase: 'locked', lockedEndEpoch: tap + 500 });
    advance(tap + 500 - Date.now());
    expect(last()).toMatchObject({ phase: 'look', roundIndex: 1, lookStartEpoch: tap + 500 });
  });

  describe('hidden page', () => {
    afterEach(() => {
      // Back to jsdom's own getter on Document.prototype.
      delete (document as unknown as { visibilityState?: unknown }).visibilityState;
    });

    it('HM-T18: hidden with timers still firing: no field ever renders, every answer times out on schedule, finish at 58.5 s', () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      const { container, onFinish, onProgress } = renderGame();
      let fieldSeen = false;
      for (let t = 0; t < 58_500 - 50; t += 50) {
        act(() => {
          vi.advanceTimersByTime(50);
        });
        if (q(container, 'hm-field')) fieldSeen = true;
      }
      expect(fieldSeen).toBe(false);
      expect(onFinish).not.toHaveBeenCalled();
      advance(100);
      expect(onFinish).toHaveBeenCalledTimes(1);
      const result = onFinish.mock.calls[0][0];
      expect(result.durationMs).toBeGreaterThanOrEqual(58_500);
      expect(result.durationMs).toBeLessThanOrEqual(58_550);
      expect((result.raw as HowManyRaw).rounds.every((r) => r.guess === null && r.timed_out)).toBe(true);
      // The schedule never moved: looks at 1.5 / 20.5 / 39.5 s, answers from look + 3.5 s.
      expect(looks(onProgress.mock.calls)).toEqual([ROUND_START + 1500, ROUND_START + 20_500, ROUND_START + 39_500]);
      const answers = onProgress.mock.calls.map(([s]) => s).filter((s) => s.phase === 'answer').map((s) => s.answerStartEpoch);
      expect([...new Set(answers)]).toEqual([ROUND_START + 5000, ROUND_START + 24_000, ROUND_START + 43_000]);
    });
  });

  it('HM-T19: a flash whose start epoch is not written yet is due at the end of its window', () => {
    const lookStart = ROUND_START + 20_000;
    const base: HowManySnapshot = {
      phase: 'flash',
      roundIndex: 1,
      lookStartEpoch: lookStart,
      flashStartEpoch: null,
      answerStartEpoch: null,
      lockedEndEpoch: null,
      typed: '',
      rounds: [],
    };
    expect(dueEpoch(base, ROUND_START)).toBe(lookStart + 3500);
    expect(dueEpoch({ ...base, flashStartEpoch: lookStart + 1100 }, ROUND_START)).toBe(lookStart + 3600);
    expect(dueEpoch({ ...base, phase: 'intro', lookStartEpoch: null }, ROUND_START)).toBe(ROUND_START + 1500);
    expect(dueEpoch({ ...base, phase: 'done' }, ROUND_START)).toBeNull();
  });

  it('HM-T19: a freeze between the flash commit and its paint never gives the field a new second', () => {
    let frozen = false;
    const spy = vi.fn<(s: HowManySnapshot) => void>((s) => {
      // The flash is persisted before the paint; the page freezes 5 s right there.
      if (!frozen && s.phase === 'flash' && s.flashStartEpoch === null) {
        frozen = true;
        vi.setSystemTime(Date.now() + 5000);
      }
    });
    const { container } = renderGame({ onProgress: spy });
    advance(2500);
    const snaps = spy.mock.calls.map(([s]) => s);
    const lookStart = ROUND_START + 1500;
    expect(frozen).toBe(true);
    expect(chevrons(container)).toHaveLength(0);
    expect(snaps[snaps.length - 1]).toMatchObject({ phase: 'answer', answerStartEpoch: lookStart + 3500 });
    expect(q(container, 'hm-seconds')?.textContent).toBe('13');
  });
});
