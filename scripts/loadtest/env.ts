// Minimal .env.local parser (no dependency on `dotenv`; the project doesn't have it installed
// and the task asks not to add dependencies unless unavoidable).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface LoadTestEnv {
  url: string;
  publishableKey: string;
  adminEmail: string;
  adminPassword: string;
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Reads scripts/loadtest/../../.env.local (repo root) and returns the values the load test needs. */
export function loadEnv(): LoadTestEnv {
  const repoRoot = resolve(import.meta.dirname, "..", "..");
  const fileVars = parseEnvFile(resolve(repoRoot, ".env.local"));
  const get = (key: string): string | undefined => process.env[key] ?? fileVars[key];

  const url = get("VITE_SUPABASE_URL");
  const publishableKey = get("VITE_SUPABASE_PUBLISHABLE_KEY");
  const adminEmail = get("E2E_ADMIN_EMAIL");
  const adminPassword = get("E2E_ADMIN_PASSWORD");

  const missing = [
    !url && "VITE_SUPABASE_URL",
    !publishableKey && "VITE_SUPABASE_PUBLISHABLE_KEY",
    !adminEmail && "E2E_ADMIN_EMAIL",
    !adminPassword && "E2E_ADMIN_PASSWORD",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `scripts/loadtest: missing env vars in .env.local: ${missing.join(", ")}`,
    );
  }

  return { url: url!, publishableKey: publishableKey!, adminEmail: adminEmail!, adminPassword: adminPassword! };
}
