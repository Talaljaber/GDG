import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  hostSignIn,
  hostToLobby,
  joinToLobby,
  newPhone,
  readLocal,
  sql,
} from '../../../../../../../../.m2/GDG/e2e/helpers.ts';
import { fieldFor } from '../../../../../../../../.m2/GDG/src/games/how-many/field.ts';
import { layoutFor } from '../../../../../../../../.m2/GDG/src/games/pairs/layout.ts';
import { itemFor } from '../../../../../../../../.m2/GDG/src/games/swipe-sort/items.ts';

const OUT = 'C:/Users/hp/AppData/Local/Temp/claude/c--Users-hp--m2-GDG/f37d25ab-80f0-495e-93ed-dcd0ab723d43/scratchpad/g1/out';
const events: Array<[number, string, string]> = [];
const ev = (who: string, what: string) => {
  events.push([Date.now(), who, what]);
  console.log(new Date().toISOString(), who, what);
};

const PHONE_LOGGER = () => {
  const KEY = 'scratch.log';
  let last = '';
  const ids = [
    'hm-intro', 'hm-look', 'hm-flash', 'hm-answer', 'hm-locked', 'hm-done',
    'ss-play', 'ss-done', 'pr-play',
    'screen-intro', 'screen-game', 'screen-round-result', 'screen-intermission', 'screen-results', 'screen-lobby',
  ];
  const tick = () => {
    const present = ids.filter((id) => document.querySelector(`[data-testid="${id}"]`));
    const chev = document.querySelectorAll('[data-testid="hm-chevron"]').length;
    const lbl = present.join(',') + (chev ? ` chev=${chev}` : '');
    if (lbl !== last) {
      last = lbl;
      try {
        const a = JSON.parse(localStorage.getItem(KEY) || '[]');
        a.push([Date.now(), lbl]);
        localStorage.setItem(KEY, JSON.stringify(a));
      } catch {
        /* */
      }
    }
  };
  window.addEventListener('DOMContentLoaded', () => {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || '[]');
      a.push([Date.now(), 'PAGE_LOAD']);
      localStorage.setItem(KEY, JSON.stringify(a));
    } catch {
      /* */
    }
  });
  setInterval(tick, 50);
};

function letters(n: number): string {
  const a = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

async function state(page: Page) {
  return page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('gdg.v1.current') || 'null');
    const q = (id: string) => !!document.querySelector(`[data-testid="${id}"]`);
    return {
      snap: c?.gameSnapshot ?? null,
      roundId: c?.roundId ?? null,
      seed: c?.seed ?? null,
      lastRound: c?.lastResult?.roundId ?? null,
      pendingRound: c?.pendingSubmit?.roundId ?? null,
      answer: q('hm-answer'),
      look: q('hm-look'),
      ssPlay: q('ss-play'),
      prPlay: q('pr-play'),
      after: q('screen-round-result') || q('screen-intermission') || q('screen-results'),
    };
  });
}

async function waitGame(page: Page, id: string, timeout = 60_000) {
  await expect(page.getByTestId(id)).toBeVisible({ timeout });
}

// --------------------------------------------------------------------- How Many?
async function playHM(page: Page, who: string, delta: number, reloadOnLook?: number) {
  await waitGame(page, 'screen-game');
  const done = new Set<number>();
  let reloaded = false;
  const end = Date.now() + 70_000;
  while (Date.now() < end) {
    let st;
    try {
      st = await state(page);
    } catch {
      await page.waitForTimeout(100);
      continue;
    }
    if (st.after || (st.roundId && (st.lastRound === st.roundId || st.pendingRound === st.roundId))) break;
    const snap = st.snap as { phase: string; roundIndex: number } | null;
    if (reloadOnLook !== undefined && !reloaded && st.look && snap?.roundIndex === reloadOnLook) {
      reloaded = true;
      ev(who, `HM reload during look of flash ${reloadOnLook}; snap=${JSON.stringify(snap)}`);
      await page.reload();
      await page.waitForTimeout(200);
      const after = await state(page).catch(() => null);
      ev(who, `HM after reload snap=${JSON.stringify(after?.snap)}`);
      continue;
    }
    if (st.answer && snap?.phase === 'answer' && !done.has(snap.roundIndex)) {
      const i = snap.roundIndex;
      const count = fieldFor(st.seed, i).count;
      const guess = String(count + delta);
      await page.waitForTimeout(500);
      for (const d of guess) {
        await page.getByTestId(`hm-key-${d}`).click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(110);
      }
      await page.getByTestId('hm-key-ok').click({ timeout: 3000 }).catch(() => {});
      done.add(i);
      ev(who, `HM flash ${i}: true ${count}, typed ${guess}`);
      continue;
    }
    await page.waitForTimeout(40);
  }
  ev(who, 'HM finished driver');
}

// --------------------------------------------------------------------- Swipe Sort
async function playSS(page: Page, who: string, reloadAfterMs?: number) {
  await waitGame(page, 'ss-play');
  let seed = (await state(page)).seed as string;
  let lastSwiped = -1;
  let reloaded = false;
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    let st;
    try {
      st = await state(page);
    } catch {
      await page.waitForTimeout(100);
      continue;
    }
    if (st.after || (st.roundId && (st.lastRound === st.roundId || st.pendingRound === st.roundId))) break;
    const snap = st.snap as {
      phase: string;
      itemIndex: number;
      itemStartEpoch: number | null;
      gapEndEpoch: number | null;
      gameStartEpoch: number | null;
    } | null;
    if (!snap || snap.phase !== 'play' || !st.ssPlay) {
      await page.waitForTimeout(30);
      continue;
    }
    seed = st.seed;
    if (
      reloadAfterMs !== undefined &&
      !reloaded &&
      snap.gameStartEpoch !== null &&
      Date.now() - snap.gameStartEpoch > reloadAfterMs &&
      snap.itemStartEpoch !== null
    ) {
      reloaded = true;
      ev(who, `SS reload mid-item ${snap.itemIndex}; snap=${JSON.stringify(snap)}`);
      await page.reload();
      await page.waitForTimeout(100);
      const after = await state(page).catch(() => null);
      ev(who, `SS after reload snap=${JSON.stringify(after?.snap)}`);
      continue;
    }
    if (snap.itemStartEpoch !== null && snap.gapEndEpoch === null && snap.itemIndex !== lastSwiped) {
      const side = itemFor(seed, snap.itemIndex).side;
      const box = await page.getByTestId('ss-surface').boundingBox();
      if (box) {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 3;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + (side === 'left' ? -100 : 100), cy, { steps: 3 });
        await page.mouse.up();
        lastSwiped = snap.itemIndex;
      }
      continue;
    }
    await page.waitForTimeout(15);
  }
  ev(who, 'SS finished driver');
}

// --------------------------------------------------------------------- Pairs
async function playPairs(page: Page, who: string, mismatches: number, reloadInLock: boolean) {
  await waitGame(page, 'pr-play');
  const st0 = await state(page);
  const layout = layoutFor(st0.seed);
  const pos = new Map<string, number[]>();
  layout.forEach((ic, i) => pos.set(ic, [...(pos.get(ic) ?? []), i]));
  const icons = [...pos.keys()];
  const tap = async (i: number) => {
    await page.getByTestId(`pr-tile-${i}`).click({ timeout: 5000 });
    await page.waitForTimeout(280);
  };
  // verify the rendered board against layoutFor(seed): flip tile 0 and read its label
  await tap(0);
  const label0 = await page.getByTestId('pr-tile-0').getAttribute('aria-label');
  ev(who, `PR tile0 aria-label="${label0}" layout[0]=${layout[0]}`);
  // the partner of tile 0: tap a non-partner to make a mismatch (counts as mismatch 1)
  const partner0 = pos.get(layout[0])!.find((p) => p !== 0)!;
  const nonPartner = [...Array(16).keys()].find((p) => p !== 0 && p !== partner0)!;
  await tap(nonPartner);
  const label1 = await page.getByTestId(`pr-tile-${nonPartner}`).getAttribute('aria-label');
  ev(who, `PR mismatch 1: tile0 vs ${nonPartner} (${label1})`);
  if (reloadInLock) {
    const s = await state(page);
    ev(who, `PR reload during lock; snap=${JSON.stringify(s.snap)}`);
    await page.reload();
    await waitGame(page, 'pr-play');
    const after = await state(page);
    ev(who, `PR after reload snap=${JSON.stringify(after.snap)}`);
    const up = await page.locator('[data-testid^="pr-tile-"][data-state="up"]').count();
    ev(who, `PR after reload face-up tiles in DOM: ${up}`);
  }
  await page.waitForTimeout(800);
  for (let m = 1; m < mismatches; m++) {
    const a = pos.get(icons[m])![0];
    const b = pos.get(icons[(m + 1) % icons.length])![0];
    await tap(a);
    await tap(b);
    await page.waitForTimeout(800);
  }
  for (const ic of icons) {
    const [a, b] = pos.get(ic)!;
    await tap(a);
    await tap(b);
  }
  ev(who, 'PR finished driver');
}

async function p7Text(page: Page, who: string, tag: string) {
  const loc = page.getByTestId('screen-round-result');
  try {
    await expect(loc).toBeVisible({ timeout: 8000 });
    const txt = (await loc.innerText()).replace(/\s+/g, ' ');
    ev(who, `P7 ${tag}: ${txt}`);
    await page.screenshot({ path: `${OUT}/p7-${tag}-${who}.png` });
  } catch {
    ev(who, `P7 ${tag}: not visible`);
    await page.screenshot({ path: `${OUT}/p7-${tag}-${who}-missing.png` });
  }
}

test('G1: how_many / swipe_sort / pairs with 3 phones', async ({ browser }) => {
  test.setTimeout(600_000);
  const hostCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await hostCtx.newPage();
  await hostSignIn(host);
  const code = await hostToLobby(host, ['how_many', 'swipe_sort', 'pairs'] as never);
  ev('host', `lobby code ${code}`);

  const tag = letters(4);
  const names = [`A${tag}`, `B${tag}`, `C${tag}`];
  const phones = await Promise.all(names.map(() => newPhone(browser)));
  for (const p of phones) await p.context.addInitScript(PHONE_LOGGER);
  for (let i = 0; i < 3; i++) await joinToLobby(phones[i].page, code, names[i]);
  const [A, B, C] = phones.map((p) => p.page);

  // host logger
  await host.evaluate(() => {
    const w = window as unknown as { __hl: Array<[number, string]> };
    w.__hl = [];
    let last = '';
    setInterval(() => {
      const root = document.querySelector('[data-testid="host-root"]');
      const inter = document.querySelector('[data-testid="host-intermission"]');
      const dots = [...document.querySelectorAll('[data-testid="hm-dot"]')];
      const vis = dots.filter((d) => (d as HTMLElement).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true } as never) && Number(getComputedStyle(d).opacity) > 0.5).length;
      const means = [...document.querySelectorAll('[data-testid="hm-mean"]')];
      const mvis = means.filter((d) => Number(getComputedStyle(d).opacity) > 0.5).length;
      const strips = [...document.querySelectorAll('[data-testid="hm-strip"]')].map((s) => s.getAttribute('data-count')).join('/');
      const lbl = `${root?.getAttribute('data-screen')} step=${inter?.getAttribute('data-step') ?? '-'} reveal=${!!document.querySelector('[data-testid="hm-reveal"]')} strips=${strips} dots=${vis}/${dots.length} mean=${mvis}/${means.length}`;
      if (lbl !== last) {
        last = lbl;
        w.__hl.push([Date.now(), lbl]);
      }
    }, 50);
  });

  const sessionId = sql(`select id from sessions where code='${code}' and status='lobby'`);
  ev('host', `session ${sessionId}`);
  await host.getByTestId('host-start').click();
  ev('host', 'Start tapped');

  // ---------------- Round 1: How Many?
  await Promise.all([
    playHM(B, 'B', 1).then(() => p7Text(B, 'B', 'hm')),
    playHM(C, 'C', -1, 1).then(() => p7Text(C, 'C', 'hm')),
  ]);
  // host H3 reveal screenshots
  await expect(host.getByTestId('host-intermission')).toBeVisible({ timeout: 130_000 });
  ev('host', 'intermission visible (round 1)');
  await host.waitForTimeout(1000);
  await host.screenshot({ path: `${OUT}/host-hm-reveal-1s.png` });
  await host.waitForTimeout(5000);
  await host.screenshot({ path: `${OUT}/host-hm-reveal-6s.png` });
  const seedsR1 = await Promise.all([A, B, C].map((p) => readLocal(p)));
  ev('all', `R1 seeds ${seedsR1.map((s) => s?.seed).join(' | ')}`);
  for (let k = 0; k < 3; k++) {
    const sd = seedsR1[k]?.seed as string;
    ev(names[k], `HM counts from seed: ${[0, 1, 2].map((i) => fieldFor(sd, i).count).join(',')}`);
  }

  // ---------------- Round 2: Swipe Sort
  await Promise.all([
    playSS(B, 'B').then(() => p7Text(B, 'B', 'ss')),
    playSS(C, 'C', 8000).then(() => p7Text(C, 'C', 'ss')),
  ]);
  const seedsR2 = await Promise.all([A, B, C].map((p) => readLocal(p)));
  for (let k = 0; k < 3; k++) {
    const sd = seedsR2[k]?.seed as string;
    ev(names[k], `SS first 12 sides: ${[...Array(12).keys()].map((i) => itemFor(sd, i).side[0]).join('')}`);
  }

  // ---------------- Round 3: Pairs
  await Promise.all([
    playPairs(B, 'B', 2, false).then(() => p7Text(B, 'B', 'pr')),
    playPairs(C, 'C', 1, true).then(() => p7Text(C, 'C', 'pr')),
  ]);
  const seedsR3 = await Promise.all([A, B, C].map((p) => readLocal(p)));
  for (let k = 0; k < 3; k++) {
    const sd = seedsR3[k]?.seed as string;
    ev(names[k], `PR layout: ${layoutFor(sd).join(',')}`);
  }

  await expect(host.getByTestId('host-root')).toHaveAttribute('data-screen', 'results', { timeout: 140_000 });
  ev('host', 'results');
  await host.waitForTimeout(2000);

  // ---------------- collect
  const rounds = sql(
    `select round_no||'|'||game||'|'||status||'|'||coalesce(to_char(started_at,'HH24:MI:SS.MS'),'')||'|'||coalesce(to_char(ended_at,'HH24:MI:SS.MS'),'')||'|'||coalesce(end_reason::text,'')||'|'||coalesce(extract(epoch from ended_at-started_at)::text,'') from rounds where session_id='${sessionId}' order by round_no`,
  );
  const scores2 = sql(
    `select r.round_no||'|'||s.name||'|'||s.score||'|'||s.duration_ms||'|'||to_char(s.created_at,'HH24:MI:SS.MS')||'|'||extract(epoch from s.created_at-r.started_at)::text||'|'||s.raw::text from scores s join rounds r on r.id=s.round_id where r.session_id='${sessionId}' order by r.round_no, s.created_at`,
  );
  const phoneLogs: Record<string, unknown> = {};
  for (let k = 0; k < 3; k++) {
    phoneLogs[names[k]] = await [A, B, C][k].evaluate(() => JSON.parse(localStorage.getItem('scratch.log') || '[]'));
  }
  const hostLog = await host.evaluate(() => (window as unknown as { __hl: unknown }).__hl);
  writeFileSync(
    `${OUT}/g1-result.json`,
    JSON.stringify({ names, sessionId, rounds: rounds.split('\n'), scores: scores2.split('\n'), events, phoneLogs, hostLog }, null, 1),
  );
  await host.screenshot({ path: `${OUT}/host-results.png` });
});
