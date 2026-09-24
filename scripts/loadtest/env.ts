// Minimal .env.local parser (no dependency on `dotenv`; the project doesn't have it installed
// and the task asks not to add dependencies unless unavoidable).
import { execFileSync } from "node:child_process";
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

function isLocal(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

const sameUrl = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/** `supabase status -o env` of the local CLI stack (API_URL, PUBLISHABLE_KEY, ...). */
function localStatus(repoRoot: string): Record<string, string> {
  const out = execFileSync("npx", ["supabase", "status", "-o", "env", "--workdir", "."], {
    cwd: repoRoot,
    encoding: "utf-8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const parsed: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) parsed[m[1]] = m[2];
  }
  return parsed;
}

/**
 * Reads scripts/loadtest/../../.env.local (repo root) and returns the values the load test needs.
 *
 * The run signs in dozens of anonymous users and creates sessions, so it only touches a remote
 * project when asked by name: without `target` it runs against the LOCAL stack (SUPABASE_URL from
 * .env.local if that is localhost, else `supabase status`). A remote run needs `--target <url>`
 * equal to SUPABASE_URL, so a .env.local that points at the cloud is never hit by accident.
 * Only the publishable key is read; never a secret key (ADR-125).
 */
export function loadEnv(target?: string): LoadTestEnv {
  const repoRoot = resolve(import.meta.dirname, "..", "..");
  const fileVars = parseEnvFile(resolve(repoRoot, ".env.local"));
  const get = (key: string): string | undefined => process.env[key] ?? fileVars[key];

  let url = get("SUPABASE_URL");
  let publishableKey = get("SUPABASE_PUBLISHABLE_KEY");
  if (target) {
    if (!url || !sameUrl(target, url)) {
      throw new Error(
        `scripts/loadtest: --target ${target} does not match SUPABASE_URL (${url ?? "unset"}); ` +
          "set SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY for that project first",
      );
    }
  } else if (!isLocal(url) || !publishableKey) {
    const status = localStatus(repoRoot);
    url = status.API_URL;
    publishableKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
    if (!isLocal(url)) {
      throw new Error(
        "scripts/loadtest: no local Supabase stack found (start it with `supabase start`); " +
          "to run against a remote project pass --target <its SUPABASE_URL>",
      );
    }
  }
  const adminEmail = get("E2E_ADMIN_EMAIL");
  const adminPassword = get("E2E_ADMIN_PASSWORD");

  const missing = [
    !url && "SUPABASE_URL",
    !publishableKey && "SUPABASE_PUBLISHABLE_KEY",
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
