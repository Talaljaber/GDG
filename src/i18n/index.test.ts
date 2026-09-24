import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import en from './en.json';
import ar from './ar.json';
import { LangProvider, detectLang, formatNumber, translate, useLang, useT } from './index';

describe('en.json / ar.json', () => {
  it('have identical key sets', () => {
    const enKeys = Object.keys(en).sort();
    const arKeys = Object.keys(ar).sort();
    expect(arKeys).toEqual(enKeys);
  });
});

describe('translate: interpolation', () => {
  it('substitutes a single placeholder', () => {
    expect(translate('en', 'lobby.you_are', { name: 'Sara' })).toBe('Playing as Sara');
  });

  it('substitutes multiple placeholders', () => {
    expect(translate('en', 'round.label', { n: 2, total: 3 })).toBe('Round 2 of 3');
  });

  it('leaves an unmatched placeholder untouched', () => {
    expect(translate('en', 'lobby.you_are')).toBe('Playing as {name}');
  });

  it('interpolates in Arabic too', () => {
    expect(translate('ar', 'lobby.you_are', { name: 'سارة' })).toBe('تلعب باسم سارة');
  });
});

describe('translate: plural selection', () => {
  it('picks English "one" for 1 and "other" otherwise', () => {
    expect(translate('en', 'lobby.players_count', { n: 1 })).toBe('1 player');
    expect(translate('en', 'lobby.players_count', { n: 0 })).toBe('0 players');
    expect(translate('en', 'lobby.players_count', { n: 2 })).toBe('2 players');
    expect(translate('en', 'lobby.players_count', { n: 5 })).toBe('5 players');
  });

  it('picks the right Arabic CLDR form across 0, 1, 2, 3, 11, 100', () => {
    expect(translate('ar', 'lobby.players_count', { n: 0 })).toBe('لا يوجد لاعبون بعد');
    expect(translate('ar', 'lobby.players_count', { n: 1 })).toBe('لاعب واحد');
    expect(translate('ar', 'lobby.players_count', { n: 2 })).toBe('لاعبان');
    expect(translate('ar', 'lobby.players_count', { n: 3 })).toBe('3 لاعبين');
    expect(translate('ar', 'lobby.players_count', { n: 11 })).toBe('11 لاعبًا');
    expect(translate('ar', 'lobby.players_count', { n: 100 })).toBe('100 لاعب');
  });

  it('falls back to params.count or params.s when params.n is absent', () => {
    expect(translate('en', 'lobby.players_count', { count: 1 })).toBe('1 player');
    expect(translate('en', 'game.stop_the_clock.target', { s: 1 })).toBe('1 second');
    expect(translate('en', 'game.stop_the_clock.target', { s: 7 })).toBe('7 seconds');
    expect(translate('ar', 'game.stop_the_clock.target', { s: 2 })).toBe('ثانيتان');
  });
});

describe('translate: missing key', () => {
  it('throws naming the key outside production (vitest MODE is not "production")', () => {
    expect(() => translate('en', 'nope.not.a.real.key')).toThrow(/nope\.not\.a\.real\.key/);
  });
});

describe('formatNumber', () => {
  it('always uses Western digits, in a grouped format', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(7)).toBe('7');
    expect(formatNumber(0)).toBe('0');
  });
});

describe('detectLang', () => {
  const originalLanguages = window.navigator.languages;

  function setLanguages(langs: string[]) {
    Object.defineProperty(window.navigator, 'languages', {
      value: langs,
      configurable: true,
    });
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    Object.defineProperty(window.navigator, 'languages', {
      value: originalLanguages,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('returns the stored choice when there is one', () => {
    localStorage.setItem('gdg.v1.lang', 'ar');
    setLanguages(['en-US']);
    expect(detectLang()).toBe('ar');
  });

  it('falls back to the browser language when nothing is stored: Arabic', () => {
    setLanguages(['ar-JO', 'en-US']);
    expect(detectLang()).toBe('ar');
  });

  it('falls back to English when the browser language is not Arabic', () => {
    setLanguages(['en-US', 'ar-JO']);
    expect(detectLang()).toBe('en');
  });

  it('never throws when localStorage access throws', () => {
    setLanguages(['ar-JO']);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => detectLang()).not.toThrow();
    expect(detectLang()).toBe('ar');
  });
});

describe('LangProvider / useLang / useT', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
  });

  function Probe() {
    const { lang, dir, setLang } = useLang();
    const t = useT();
    return createElement(
      'div',
      null,
      createElement('span', { 'data-testid': 'lang' }, lang),
      createElement('span', { 'data-testid': 'dir' }, dir),
      createElement('span', { 'data-testid': 'text' }, t('common.cancel')),
      createElement('button', { onClick: () => setLang('ar') }, 'go-ar'),
    );
  }

  it('applies dir="rtl" and lang="ar" to <html> for Arabic, both from mount and via setLang', () => {
    render(createElement(LangProvider, { initial: 'ar', children: createElement(Probe) }));
    expect(screen.getByTestId('lang').textContent).toBe('ar');
    expect(screen.getByTestId('dir').textContent).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByTestId('text').textContent).toBe('إلغاء');
  });

  it('defaults to ltr for English and updates on setLang', () => {
    render(createElement(LangProvider, { initial: 'en', children: createElement(Probe) }));
    expect(document.documentElement.dir).toBe('ltr');

    fireEvent.click(screen.getByRole('button', { name: 'go-ar' }));

    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(localStorage.getItem('gdg.v1.lang')).toBe('ar');
  });

  it('useLang throws outside a LangProvider', () => {
    // Render without a provider and assert React surfaces the thrown error.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(createElement(Probe))).toThrow(/LangProvider/);
    spy.mockRestore();
  });
});
