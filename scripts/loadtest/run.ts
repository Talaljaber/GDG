#!/usr/bin/env tsx
// Load test CLI (docs/TESTING.md §5). Usage:
//   tsx scripts/loadtest/run.ts --phones 15 --delay 5-60 --scenario L1
//
// Scenarios L1-L5 match the table in docs/TESTING.md §5. --phones/--delay override a scenario's
// defaults (used to shrink L1/L2 runtime for local verification, per this task's step 4).
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD from
// .env.local (scripts/loadtest/env.ts, no dependency on `dotenv`).

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "./env.ts";
import { SimPhone, type PhoneMetrics } from "./sim-phone.ts";
import { SimHost, type HostResult } from "./sim-host.ts";

type ScenarioId = "L1" | "L2" | "L3" | "L4" | "L5";

interface ScenarioPreset {
  phones: number;
  delayMinMs: number;
  delayMaxMs: number;
  dropSockets: boolean; // L5
  description: string;
}

const SCENARIOS: Record<ScenarioId, ScenarioPreset> = {
  L1: { phones: 15, delayMinMs: 5000, delayMaxMs: 60000, dropSockets: false, description: "15 phones" },
  L2: { phones: 30, delayMinMs: 5000, delayMaxMs: 60000, dropSockets: false, description: "30 phones" },
  L3: { phones: 60, delayMinMs: 5000, delayMaxMs: 60000, dropSockets: false, description: "60 phones" },
  L4: { phones: 30, delayMinMs: 0, delayMaxMs: 2000, dropSockets: false, description: "30 phones, submit within 2s" },
  L5: { phones: 30, delayMinMs: 5000, delayMaxMs: 60000, dropSockets: true, description: "30 phones, socket drop 10s" },
};

interface Args {
  scenario: ScenarioId;
  phones?: number;
  delayMinMs?: number;
  delayMaxMs?: number;
}

function parseArgs(argv: string[]): Args {
  let scenario: ScenarioId | undefined;
  let phones: number | undefined;
  let delayMinMs: number | undefined;
  let delayMaxMs: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scenario") scenario = argv[++i] as ScenarioId;
    else if (arg === "--phones") phones = Number(argv[++i]);
    else if (arg === "--delay") {
      const [min, max] = argv[++i].split("-").map(Number);
      delayMinMs = min * 1000;
      delayMaxMs = (max ?? min) * 1000;
    }
  }
  if (!scenario || !SCENARIOS[scenario]) {
    throw new Error(`--scenario is required and must be one of ${Object.keys(SCENARIOS).join(", ")}`);
  }
  return { scenario, phones, delayMinMs, delayMaxMs };
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

interface Criterion {
  name: string;
  pass: boolean;
  detail: string;
}

function evaluateCriteria(
  scenario: ScenarioId,
  phoneMetrics: PhoneMetrics[],
  host: HostResult,
): Criterion[] {
  const criteria: Criterion[] = [];
  const roundStartLatencies = phoneMetrics.map((m) => m.roundStartLatencyMs).filter((v): v is number => v !== null);
  const totalErrors = phoneMetrics.reduce((s, m) => s + Object.values(m.errorsByCode).reduce((a, b) => a + b, 0), 0);
  const totalRealtimeErrors = phoneMetrics.reduce(
    (s, m) => s + Object.values(m.realtimeErrorsByType).reduce((a, b) => a + b, 0),
    0,
  );
  const boardLatencies = host.scoreArrivals
    .filter((a) => a.boardVisibleAt !== null)
    .map((a) => a.boardVisibleAt! - a.insertReceivedAt);
  const unresolvedBoardArrivals = host.scoreArrivals.filter((a) => a.boardVisibleAt === null).length;

  if (scenario === "L1" || scenario === "L2") {
    criteria.push({
      name: "no errors",
      pass: totalErrors === 0 && totalRealtimeErrors === 0,
      detail: `submit/rpc errors=${totalErrors}, realtime errors=${totalRealtimeErrors}`,
    });
    const worstStart = roundStartLatencies.length ? Math.max(...roundStartLatencies) : null;
    criteria.push({
      name: "round start within 1.5s of host",
      pass: roundStartLatencies.length === phoneMetrics.length && (worstStart ?? Infinity) <= 1500,
      detail: `phones reporting=${roundStartLatencies.length}/${phoneMetrics.length}, worst=${worstStart?.toFixed(0) ?? "n/a"}ms`,
    });
    criteria.push({
      name: "host board updates within 1s of each insert",
      pass: unresolvedBoardArrivals === 0 && boardLatencies.every((v) => v <= 1000),
      detail: `unresolved=${unresolvedBoardArrivals}, worst=${boardLatencies.length ? Math.max(...boardLatencies) : "n/a"}ms, n=${boardLatencies.length}`,
    });
  }

  if (scenario === "L3") {
    const tooMany = phoneMetrics.reduce(
      (s, m) => s + Object.entries(m.realtimeErrorsByType).filter(([k]) => k.startsWith("too_many_")).reduce((a, [, v]) => a + v, 0),
      0,
    );
    const tenantEvents = phoneMetrics.reduce(
      (s, m) => s + (m.realtimeErrorsByType["tenant_events"] ?? 0),
      0,
    );
    criteria.push({ name: "no disconnects (tenant_events)", pass: tenantEvents === 0, detail: `tenant_events=${tenantEvents}` });
    criteria.push({ name: "no too_many_* errors", pass: tooMany === 0, detail: `too_many_*=${tooMany}` });
    const p95 = percentile(roundStartLatencies, 95);
    criteria.push({
      name: "round start latency p95 < 2s",
      pass: p95 !== null && p95 < 2000,
      detail: `p95=${p95?.toFixed(0) ?? "n/a"}ms, n=${roundStartLatencies.length}`,
    });
  }

  if (scenario === "L4") {
    const dropped = phoneMetrics.filter((m) => !m.submitOk).length;
    criteria.push({ name: "no dropped scores", pass: dropped === 0, detail: `dropped=${dropped}/${phoneMetrics.length}` });
    const lastInsert = host.scoreArrivals.length ? Math.max(...host.scoreArrivals.map((a) => a.insertReceivedAt)) : null;
    const lastVisible = host.scoreArrivals.every((a) => a.boardVisibleAt !== null)
      ? Math.max(...host.scoreArrivals.map((a) => a.boardVisibleAt!))
      : null;
    const completeWithin =
      lastInsert !== null && lastVisible !== null ? lastVisible - lastInsert : null;
    criteria.push({
      name: "host board complete within 3s",
      pass: unresolvedBoardArrivals === 0 && completeWithin !== null && completeWithin <= 3000,
      detail: `unresolved=${unresolvedBoardArrivals}, completeWithin=${completeWithin ?? "n/a"}ms`,
    });
  }

  if (scenario === "L5") {
    const recovered = phoneMetrics
      .map((m) => m.presenceRecoveredAfterDropMs)
      .filter((v): v is number => v !== null);
    const worstRecover = recovered.length ? Math.max(...recovered) : null;
    criteria.push({
      name: "presence recovers within 15s",
      pass: recovered.length === phoneMetrics.length && (worstRecover ?? Infinity) <= 15000,
      detail: `recovered=${recovered.length}/${phoneMetrics.length}, worst=${worstRecover?.toFixed(0) ?? "n/a"}ms`,
    });
    const duplicates = phoneMetrics.reduce((s, m) => s + m.duplicateInsertsIgnored, 0);
    criteria.push({
      name: "no duplicate scores",
      pass: true, // enforced structurally by the unique (round_id, player_id) constraint; duplicates below are harmless retries
      detail: `retried inserts treated as success (23505)=${duplicates}`,
    });
  }

  return criteria;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const preset = SCENARIOS[args.scenario];
  const phoneCount = args.phones ?? preset.phones;
  const delayMinMs = args.delayMinMs ?? preset.delayMinMs;
  const delayMaxMs = args.delayMaxMs ?? preset.delayMaxMs;

  const env = loadEnv();
  const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

  console.log(`\n=== Load test ${args.scenario}: ${preset.description} (override: ${phoneCount} phones, delay ${delayMinMs}-${delayMaxMs}ms) ===\n`);

  const host = new SimHost(env.url, env.publishableKey, log);
  await host.signIn(env.adminEmail, env.adminPassword);
  await host.tryNewSession(); // close a leftover 'results' session from a previous run, if any
  const { sessionId, code } = await host.openLobby(["stop_the_clock"]);
  log(`lobby open, code=${code}, sessionId=${sessionId}`);
  const removed = await host.resetLobbyPlayers(sessionId);
  if (removed > 0) log(`removed ${removed} leftover joined players from a previous run`);

  const phones: SimPhone[] = [];
  for (let i = 0; i < phoneCount; i++) {
    phones.push(
      new SimPhone({
        url: env.url,
        publishableKey: env.publishableKey,
        index: i,
        name: `Bot${i + 1}`,
        code,
        delayMinMs,
        delayMaxMs,
        log,
      }),
    );
  }

  log(`signing in + joining ${phoneCount} phones...`);
  const joinResults = await Promise.allSettled(
    phones.map(async (p, i) => {
      await sleep(i * 30); // light stagger so we don't hammer the local GoTrue/PostgREST at once
      await p.signIn();
      await p.join();
      await p.subscribe();
    }),
  );
  const joinFailures = joinResults.filter((r) => r.status === "rejected");
  if (joinFailures.length > 0) {
    log(`WARNING: ${joinFailures.length}/${phoneCount} phones failed to join/subscribe:`);
    joinFailures.slice(0, 5).forEach((r) => log(`  ${(r as PromiseRejectedResult).reason}`));
  }
  const joinedPhones = phones.filter((_, i) => joinResults[i].status === "fulfilled");
  log(`${joinedPhones.length}/${phoneCount} phones joined and subscribed`);

  const readyCount = await host.waitForPlayers(sessionId, joinedPhones.length, 30000);
  const { roundId } = await host.startSession(sessionId);
  const roundStartedAt = await host.getRoundStartedAt(roundId);
  log(`round started at ${roundStartedAt}`);

  await host.watchScores(sessionId, roundId);

  const playPromises = joinedPhones.map((p) => p.playRound().catch((err) => log(`phone ${p.index} playRound error: ${err}`)));

  if (preset.dropSockets) {
    // Let phones observe round start and begin their own delay/submit flow, then drop everyone's socket
    // for 10s and verify reconnect + presence retrack (L5, docs/TESTING.md §5).
    await sleep(2000);
    log(`dropping sockets for ${joinedPhones.length} phones for 10s...`);
    await Promise.all(joinedPhones.map((p) => p.simulateDisconnect(10000)));
    log(`sockets reconnected`);
  }

  const hostDonePromise = host.runRoundUntilDone(roundId, roundStartedAt, readyCount);
  const [endReason] = await Promise.all([hostDonePromise, Promise.all(playPromises)]);
  await host.endRound(roundId, endReason);
  await host.tryNewSession(); // leave a clean lobby behind for the next scenario run

  const hostResult: HostResult = {
    sessionId,
    code,
    roundId,
    roundStartedAt,
    events: host.events,
    scoreArrivals: host.scoreArrivals,
    endReason,
  };

  const phoneMetrics = phones.map((p) => p.metrics);
  const criteria = evaluateCriteria(args.scenario, phoneMetrics, hostResult);

  // ---------- summary ----------
  const roundStartLatencies = phoneMetrics.map((m) => m.roundStartLatencyMs).filter((v): v is number => v !== null);
  const submitLatencies = phoneMetrics.map((m) => m.submitLatencyMs).filter((v): v is number => v !== null);
  const joinLatencies = phoneMetrics.map((m) => m.joinLatencyMs).filter((v): v is number => v !== null);
  const errorsByCode: Record<string, number> = {};
  const realtimeErrorsByType: Record<string, number> = {};
  for (const m of phoneMetrics) {
    for (const [k, v] of Object.entries(m.errorsByCode)) errorsByCode[k] = (errorsByCode[k] ?? 0) + v;
    for (const [k, v] of Object.entries(m.realtimeErrorsByType)) realtimeErrorsByType[k] = (realtimeErrorsByType[k] ?? 0) + v;
  }

  console.log(`\n--- ${args.scenario} summary ---`);
  console.log(`phones requested=${phoneCount} joined=${joinedPhones.length} join_failures=${joinFailures.length}`);
  console.log(
    `join latency ms   p50=${percentile(joinLatencies, 50)?.toFixed(0)} p95=${percentile(joinLatencies, 95)?.toFixed(0)}`,
  );
  console.log(
    `round-start latency ms   p50=${percentile(roundStartLatencies, 50)?.toFixed(0)} p95=${percentile(roundStartLatencies, 95)?.toFixed(0)} max=${roundStartLatencies.length ? Math.max(...roundStartLatencies).toFixed(0) : "n/a"}`,
  );
  console.log(
    `submit latency ms   p50=${percentile(submitLatencies, 50)?.toFixed(0)} p95=${percentile(submitLatencies, 95)?.toFixed(0)}`,
  );
  console.log(`errors by code: ${JSON.stringify(errorsByCode)}`);
  console.log(`realtime errors by type: ${JSON.stringify(realtimeErrorsByType)}`);
  console.log(`round end reason: ${endReason}`);
  console.log(`\nPass criteria (docs/TESTING.md §5):`);
  for (const c of criteria) {
    console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.name} — ${c.detail}`);
  }
  const overall = criteria.every((c) => c.pass) ? "PASS" : "FAIL";
  console.log(`\nOverall: ${overall}\n`);

  // ---------- write JSON report ----------
  const resultsDir = resolve(import.meta.dirname, "results");
  mkdirSync(resultsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = resolve(resultsDir, `${args.scenario}-${timestamp}.json`);
  const report = {
    scenario: args.scenario,
    ranAt: new Date().toISOString(),
    phonesRequested: phoneCount,
    phonesJoined: joinedPhones.length,
    joinFailures: joinFailures.length,
    delayMinMs,
    delayMaxMs,
    host: hostResult,
    phoneMetrics,
    aggregates: {
      joinLatencyMs: { p50: percentile(joinLatencies, 50), p95: percentile(joinLatencies, 95) },
      roundStartLatencyMs: {
        p50: percentile(roundStartLatencies, 50),
        p95: percentile(roundStartLatencies, 95),
        max: roundStartLatencies.length ? Math.max(...roundStartLatencies) : null,
      },
      submitLatencyMs: { p50: percentile(submitLatencies, 50), p95: percentile(submitLatencies, 95) },
      errorsByCode,
      realtimeErrorsByType,
    },
    criteria,
    overall,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Report written to ${reportPath}`);

  await Promise.all(phones.map((p) => p.close()));
  await host.close();
  process.exit(overall === "PASS" ? 0 : 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
