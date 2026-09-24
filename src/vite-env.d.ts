/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_PUBLIC_SHORT_URL: string;
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
