import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HowMany, type HowManySnapshot } from './HowMany';
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
  it('intro 1.5 s -> look 1 s -> flash exactly 1 s -> answer; three answers finish once', () => {
    const { container, onFinish, last } = renderGame();
    expect(q(container, 'hm-intro')).not.toBeNull();
    advance(1450);
    expect(q(container, 'hm-intro')).not.toBeNull();
    advance(50);
    expect(q(container, 'hm-look')).not.toBeNull();
    expect(q(container, 'hm-fixation')).not.toBeNull();
    expect(chevrons(container)).toHaveLength(0);
    expect(last()).toMatchObject({ phase: 'look', roundIndex: 0, lookStartEpoch: ROUND_START + 1500 });

    const guesses = ['11', '24', '46'];
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
      advance(950);
      // Nothing in the field changes between mount and unmount.
      expect(chevrons(container)).toEqual(nodes);
      expect(chevrons(container).map((n) => n.outerHTML)).toEqual(html);
      advance(50);
      expect(chevrons(container)).toHaveLength(0);
      expect(q(container, 'hm-answer')).not.toBeNull();
      expect(last()).toMatchObject({ phase: 'answer', answerStartEpoch: lookStart + 2000, typed: '' });

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
    expect(raw.rounds.map((r) => r.guess)).toEqual([11, 24, 46]);
    for (const r of raw.rounds) {
      expect(r.timed_out).toBe(false);
      expect(r.answer_ms).toBe(1500 + 70 * 2); // 1.5 s wait, then two digits and OK 70 ms apart
    }
    expect(result.score).toBe(scoreHowMany(raw));
    expect(validateHowManyRaw(raw, result.score)).toBeNull();
    advance(5000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('HM-T12: an idle player gets three nulls and 0, finished inside the 40 s worst case', () => {
    const { onFinish } = renderGame();
    advance(39_000 - 50);
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
    expect(result.durationMs).toBeLessThanOrEqual(40_000);
    expect(validateHowManyRaw(result.raw, 0)).toBeNull();
  });

  it('the pad: max 3 digits, backspace, leading zeros, OK disabled while empty, taps outside answer ignored', () => {
    const { container, last } = renderGame();
    advance(1500);
    expect(q(container, 'hm-key-5')).toBeNull(); // no pad during the look
    advance(2000);
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
    advance(3500);
    const key = q(container, 'hm-key-4') as HTMLElement;
    fireEvent.pointerDown(key);
    fireEvent.pointerDown(key);
    expect(last().typed).toBe('4');
  });

  it('an OK within 300 ms of the pad appearing is ignored (never a too_fast score)', () => {
    const { container, last } = renderGame();
    advance(3500);
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

  it('each answer times out after 10 s: typed digits count, nothing typed = null', () => {
    const { container, last } = renderGame();
    advance(3500); // answer 1 open
    type(container, '13');
    advance(10_000 - 140 - 60);
    expect(last().phase).toBe('answer');
    expect(q(container, 'hm-seconds')?.textContent).toBe('1');
    advance(100);
    expect(last().phase).toBe('locked');
    expect(last().rounds[0]).toEqual({ true_count: fieldFor(SEED, 0).count, guess: 13, answer_ms: null, timed_out: true });
    expect(q(container, 'hm-locked')?.textContent).toContain('game.how_many.timeout');
    advance(500 + 2000 + 10_000);
    expect(last().rounds[1]).toEqual({ true_count: fieldFor(SEED, 1).count, guess: null, answer_ms: null, timed_out: true });
  });

  it('"round ended" finishes at once: the open flash keeps its digits, unstarted flashes are null', () => {
    const { container, onFinish, rerenderWith } = renderGame();
    advance(3500 + 1000);
    type(container, '12');
    press(container, 'ok');
    advance(500 + 2000);
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

  it('HM-T11: a reload during the flash never shows the field; the deadline is flashStart + 11 s', () => {
    const flashStart = ROUND_START + 20_000;
    vi.setSystemTime(flashStart + 400);
    const { container, last, onProgress } = renderGame({ snapshot: snap({ phase: 'flash', lookStartEpoch: flashStart - 1000, flashStartEpoch: flashStart }) });
    expect(chevrons(container)).toHaveLength(0);
    expect(q(container, 'hm-answer')).not.toBeNull();
    expect(onProgress).toHaveBeenCalled();
    expect(last()).toMatchObject({ phase: 'answer', answerStartEpoch: flashStart + 1000 });
    expect(q(container, 'hm-seconds')?.textContent).toBe('10');
    advance(11_000 - 400 - 50);
    expect(last().phase).toBe('answer');
    expect(chevrons(container)).toHaveLength(0);
    advance(100);
    expect(last().phase).toBe('locked');
    expect(last().rounds[1]).toMatchObject({ guess: null, timed_out: true });
  });

  it('a reload after the look ended skips the flash; the answer counts from lookStart + 2 s', () => {
    const lookStart = ROUND_START + 20_000;
    vi.setSystemTime(lookStart + 1200);
    const { container, last } = renderGame({ snapshot: snap({ lookStartEpoch: lookStart }) });
    expect(chevrons(container)).toHaveLength(0);
    expect(last()).toMatchObject({ phase: 'answer', answerStartEpoch: lookStart + 2000, flashStartEpoch: null });
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
      snapshot: snap({ phase: 'answer', lookStartEpoch: answerStart - 2000, flashStartEpoch: answerStart - 1000, answerStartEpoch: answerStart, typed: '2' }),
    });
    expect(q(container, 'hm-typed')?.textContent).toBe('2');
    expect(q(container, 'hm-seconds')?.textContent).toBe('4');
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
    // the timer is throttled: time jumps 4 s without it firing
    vi.setSystemTime(flashStart + 5000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(chevrons(container)).toHaveLength(0);
    expect(last()).toMatchObject({ phase: 'answer', answerStartEpoch: flashStart + 1000 });
    expect(q(container, 'hm-seconds')?.textContent).toBe('6');
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
    expect(last()).toMatchObject({ phase: 'answer', flashStartEpoch: null, answerStartEpoch: lookStart + 2000 });
  });
});
