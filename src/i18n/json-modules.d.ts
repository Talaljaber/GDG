/**
 * Ambient declarations so `en.json` / `ar.json` can be imported as typed ES
 * modules from src/i18n/index.ts without turning on `resolveJsonModule`
 * project-wide (tsconfig.app.json is outside this task's boundaries).
 */
declare module './en.json' {
  const value: Record<string, string | Record<string, string>>;
  export default value;
}

declare module './ar.json' {
  const value: Record<string, string | Record<string, string>>;
  export default value;
}
