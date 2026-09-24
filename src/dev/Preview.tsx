/**
 * Dev-only design preview (never in a production build: main.tsx only imports it when
 * import.meta.env.DEV). Renders screens with fixture props, no Supabase, so the redesign
 * (DESIGN_SYSTEM §0, ADR-131) can be screenshotted without touching the database.
 *
 *   /__preview                         index of every fixture
 *   /__preview?f=host.lobby-empty      one fixture, full page
 *   &lang=ar                           Arabic / RTL
 *   &theme=dark                        dark tokens
 *
 * Add fixtures in src/dev/fixtures/<area>.tsx exporting `fixtures: Fixture[]`.
 * Fixture names are "<area>.<screen>[-state]".
 */
import type { ReactNode } from 'react';
import { LangProvider, type Lang } from '../i18n';

export interface Fixture {
  name: string;
  /** The frame the screen is designed for (index thumbnails only). */
  frame: 'phone' | 'projector' | 'desktop';
  render(): ReactNode;
}

const modules = import.meta.glob<{ fixtures: Fixture[] }>('./fixtures/*.tsx', { eager: true });
const all: Fixture[] = Object.values(modules)
  .flatMap((m) => m.fixtures)
  .sort((a, b) => a.name.localeCompare(b.name));

export function Preview() {
  const params = new URLSearchParams(window.location.search);
  const lang: Lang = params.get('lang') === 'ar' ? 'ar' : 'en';
  if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
  const name = params.get('f');
  const fixture = name ? all.find((f) => f.name === name) : undefined;

  if (!fixture) {
    return (
      <main style={{ padding: 'var(--s-5)' }}>
        <h1>Preview</h1>
        <ul>
          {all.map((f) => (
            <li key={f.name}>
              <a href={`?f=${encodeURIComponent(f.name)}`}>{f.name}</a> ({f.frame}) ·{' '}
              <a href={`?f=${encodeURIComponent(f.name)}&lang=ar`}>ar</a>
            </li>
          ))}
        </ul>
      </main>
    );
  }
  return (
    <LangProvider initial={lang} key={lang}>
      {fixture.render()}
    </LangProvider>
  );
}
