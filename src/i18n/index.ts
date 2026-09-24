/**
 * Tiny in-house i18n layer (ADR-107, ADR-034, ADR-123).
 *
 * Strings live in en.json / ar.json, generated from docs/COPY.md by
 * scripts/gen-i18n.ts and checked by scripts/check-i18n.ts. This module is
 * the only supported way to read them.
 */
import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import en from './en.json';
import ar from './ar.json';

export type Lang = 'en' | 'ar';

type PluralForms = Record<string, string>;
type CopyValue = string | PluralForms;
type CopyMap = Record<string, CopyValue>;

const dictionaries: Record<Lang, CopyMap> = {
  en: en as CopyMap,
  ar: ar as CopyMap,
};

const STORAGE_KEY = 'gdg.v1.lang';

function isDevOrTest(): boolean {
  return import.meta.env.MODE !== 'production';
}

function isPluralValue(value: CopyValue): value is PluralForms {
  return typeof value === 'object' && value !== null;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{([^}]+)\}/g, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      return String(params[name]);
    }
    return match;
  });
}

/**
 * Resolves `key` to a display string for `lang`, interpolating `params`.
 * Pure: same inputs always produce the same output (or the same throw).
 *
 * Plural entries pick a CLDR form via `Intl.PluralRules`, using
 * `params.count ?? params.n ?? params.s` as the quantity.
 *
 * Missing key/form: throws in non-production builds (`import.meta.env.MODE
 * !== 'production'`), naming the key; returns the raw key in production.
 */
export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[lang];
  const value = dict[key];

  if (value === undefined) {
    if (isDevOrTest()) {
      throw new Error(`i18n: missing key "${key}" for lang "${lang}"`);
    }
    return key;
  }

  if (!isPluralValue(value)) {
    return interpolate(value, params);
  }

  const quantity = params?.count ?? params?.n ?? params?.s;
  if (quantity === undefined) {
    if (isDevOrTest()) {
      throw new Error(
        `i18n: key "${key}" is a plural entry but no count was given (pass params.count, params.n or params.s)`,
      );
    }
    return key;
  }

  const form = new Intl.PluralRules(lang).select(Number(quantity));
  const text = value[form] ?? value.other;

  if (text === undefined) {
    if (isDevOrTest()) {
      throw new Error(`i18n: key "${key}" has no plural form "${form}" (or "other") for lang "${lang}"`);
    }
    return key;
  }

  return interpolate(text, params);
}

/** Always formats with Western digits, in both languages (ADR-123). */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function readStoredLang(): Lang | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'ar' ? stored : null;
  } catch {
    return null;
  }
}

function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage unavailable (private browsing, disabled, quota, ...): the
    // choice just won't survive a reload this session.
  }
}

/**
 * The device's language choice: the remembered choice if there is one,
 * otherwise Arabic if the browser's first preferred language is Arabic,
 * otherwise English.
 */
export function detectLang(): Lang {
  const stored = readStoredLang();
  if (stored) return stored;

  try {
    const first = navigator.languages?.[0] ?? navigator.language;
    if (first && first.toLowerCase().startsWith('ar')) return 'ar';
  } catch {
    // navigator unavailable: fall through to the default.
  }

  return 'en';
}

function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

function applyToDocument(lang: Lang): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = dirFor(lang);
}

interface LangContextValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangContextValue | null>(null);

/**
 * Provides the current language/direction to the tree and applies it to
 * `<html lang dir>`, both on mount and whenever it changes. `setLang`
 * persists the choice to `localStorage['gdg.v1.lang']`.
 */
export function LangProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? detectLang());

  useEffect(() => {
    applyToDocument(lang);
  }, [lang]);

  const setLang = useMemo(
    () => (next: Lang) => {
      persistLang(next);
      setLangState(next);
    },
    [],
  );

  const value = useMemo<LangContextValue>(() => ({ lang, dir: dirFor(lang), setLang }), [lang, setLang]);

  return createElement(LangContext.Provider, { value }, children);
}

/** Reads the current language, text direction, and a setter, from the nearest LangProvider. */
export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error('useLang() must be used within a <LangProvider>');
  }
  return ctx;
}

/** Returns a `t(key, params)` function bound to the current language. */
export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const { lang } = useLang();
  return (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
}
