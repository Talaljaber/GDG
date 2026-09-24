/**
 * The trivia pool this build plays with (ADR-116, ADR-133). The event pool
 * is docs/content/trivia-questions.json; a build with `TRIVIA_POOL=family`
 * (local .env.local, or a Netlify branch deploy / deploy preview, never
 * production) uses the family test set, trivia-questions-family.json
 * (docs/content/trivia-format.md §7). The value is inlined at build time.
 */
import eventPoolFile from '../../../docs/content/trivia-questions.json';
import familyPoolFile from '../../../docs/content/trivia-questions-family.json';
import type { TriviaPoolFile } from './draw';

export const TRIVIA_POOL_NAME: 'event' | 'family' =
  import.meta.env.TRIVIA_POOL === 'family' ? 'family' : 'event';

/**
 * `resolveJsonModule` infers plain `string` fields; both files are checked
 * against the schema by `npm run check:trivia`, so the narrowing cast is safe.
 */
export const triviaPoolFile = (TRIVIA_POOL_NAME === 'family' ? familyPoolFile : eventPoolFile) as TriviaPoolFile;
