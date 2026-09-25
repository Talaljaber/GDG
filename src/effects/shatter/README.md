# Mosaic shatter layer (`src/effects/shatter`)

The signature effect from `docs/DESIGN_SYSTEM.md` §6.2: seeded crystalline shards in blue, blue-deep, amber, amber-deep, blue-tint and paper (the day-board merge: mostly blue with a little amber), each with a 1 px paper edge. It evokes the shattered outer points of the logo **without ever touching the logo** (§5). No dependencies beyond React.

```ts
import { ShatterProvider, ShatterTransition, Celebrate, useCelebrate, ShatterIn,
         DayBoardMerge, ShatterBurst, revealSchedule, SHATTER_LOGO_CLASS } from '../effects/shatter';
```

Always import from the folder (`index.ts`). The layer's CSS (`shatter.css`) loads with it.

## Where each variant goes (SCREENS.md)

Wired in Phase 5; the per-screen list is DESIGN_SYSTEM §6.2 "Where it's wired". Screens don't import this folder for rows, dots or celebrate: they go through `src/components/RevealIn.tsx` / `useRevealRows.ts`, and screen changes through `src/components/ScreenTransition.tsx`.

| Variant | Component | Screens |
|---|---|---|
| Screen transition | `<ShatterTransition>` | Player join → lobby, round → intermission, intermission → next round, results. Host H1 → H2 → H3 → H4 |
| Celebrate | `<Celebrate>` / `useCelebrate()` | P5 `new_best` (phone). New #1 row on H2 (big screen) |
| Round results shatter-in | `<ShatterIn>` | H3 round board, H4 session board, lobby player chips |
| Day-board merge | `<DayBoardMerge>` / `playDayBoardMerge()` | H4 → H5 after **Show day board** |
| Stop the Clock reveal | `<ShatterBurst>` + `revealSchedule()` | H3 `stc_reveal` step (the three strips) |

## Settings: density and reduced motion

```tsx
<ShatterProvider density="projector" reducedMotion={hostReduceMotionToggle}>…</ShatterProvider>
```

- `density: 'phone' | 'projector'` sets the hard shard cap: **24** on phones, **48** on the big screen. The default is `'phone'`. `ShatterBurst` and `DayBoardMerge` default to `'projector'`.
- Reduced motion is **on** if any of these is true: the OS setting `prefers-reduced-motion: reduce` (tracked live), the nearest provider's `reducedMotion`, or the component's own `reducedMotion` prop. Nothing can switch it back off.
- The reduced-motion fallbacks are:
  - every variant becomes a 200 ms crossfade;
  - celebrate becomes a static amber ring;
  - the merge becomes a crossfade to the day board.
- Hooks, for callers outside the components: `useReducedMotion(prop?)`, `useDensity(prop?)`, `usePrefersReducedMotion()`, `prefersReducedMotion()`.

## Z-order rule (logo)

The shard layer never covers the logo.

- Each overlay is a `position: fixed` element appended to `<body>`, with class `gdg-shatter-layer` (`SHATTER_LAYER_CLASS`) and `z-index: var(--z-shatter)` = 40. That puts it below `--z-banner` (50) and `--z-dialog` (100).
- Put **`SHATTER_LOGO_CLASS`** (`gdg-shatter-logo-safe`, z-index `var(--z-shatter-logo)` = 45) on the logo `<img>` or its wrapper.
- No ancestor of the logo may create a stacking context below 45 (transform, opacity < 1, filter, or a z-index). The simplest way: keep the TopBar/logo **outside** `<ShatterTransition>` and outside the merge stage. In full motion, `ShatterTransition` never sets transform or opacity on its content. In reduced motion it fades whole screens, so a logo inside it would fade. Keep the logo outside.
- `--z-shatter` and `--z-shatter-logo` are defined in `src/styles/tokens.css` (DESIGN_SYSTEM §4 layers); `shatter.css` only references them.
- Never pass the logo, or an element containing it, to `Celebrate`, `ShatterIn`, `ShatterBurst` or as a merge target. They hide their element with inline `opacity`.

## API

### `<ShatterTransition>`

```ts
<ShatterTransition
  transitionKey: string | number      // screen identity; a change plays the transition
  density?: 'phone' | 'projector'
  reducedMotion?: boolean
  seed?: string | number              // default: a fresh seed per play
  className?: string; 'data-testid'?: string
  onStart?(to)  // 0 ms
  onSwap?(to)   // 320 ms (0 ms with reduced motion): new children now rendered
  onDone?(to)   // 700 ms (200 ms with reduced motion)
>{children}</ShatterTransition>
```

- **0–320 ms:** shards fly in from 30–60 % of the viewport's longer side, rotating up to ±40° (emphasized easing), and tile the screen. The previous children stay mounted and untouched.
- **320 ms:** the new children mount under the shards.
- **320–700 ms:** the shards burst outward to 1.2× their distance and fade (exit easing).
- Key changes during the fly-in fold into the same swap, to the latest key. A change during the burst starts a new transition, and the interrupted `onDone` is skipped.
- The wrapper is a one-cell CSS grid (`.gdg-shatter-stack`). With reduced motion, both screens sit in that cell and crossfade for 200 ms. The leaving copy is `aria-hidden` and gets no pointer events.
- Usage: `<ShatterTransition transitionKey={screen}><ScreenFor screen={screen} /></ShatterTransition>`.

### `<Celebrate>` and `useCelebrate()`

```ts
<Celebrate trigger={n} playOnMount?={false} density? reducedMotion? seed?
           onFused?={/* 1200 ms; 0 ms reduced */} onDone?={/* 1800 ms */}>
  <SingleElement />
</Celebrate>

const { ref, celebrate, cancel, playing } = useCelebrate<HTMLLIElement>({ density?, reducedMotion?, seed?, onFused?, onDone? });
<li ref={ref}>…</li>   // then call celebrate()
```

- **0 ms:** the element's box is covered by shards and the element's opacity is set to 0.
- **0–450 ms:** the shards drift 18–40 px outward with up to ±25° rotation.
- **450–1200 ms:** they return and fuse. The element is restored.
- **1200 ms:** an amber ring glows and pulses for 600 ms (opacity and scale only).
- With reduced motion, a static amber ring shows for 1800 ms.
- `<Celebrate>` plays when `trigger` changes (not on mount, unless `playOnMount`). It renders a `display: contents` wrapper, so its single child keeps its layout.
- For an `<li>` inside an `<ol>`, use `useCelebrate` on the row itself.
- The ring copies the element's `border-radius`.

### `<ShatterIn>`

```ts
<ShatterIn delay?={0} stagger?={60} itemDuration?={500} as?={'div'|'ol'|'ul'|'li'|'span'|'section'} itemSelector?
           trigger? playOnMount?={true} density? reducedMotion? seed? className? data-testid?
           onItemRevealed?={(i) => …}   // i·stagger + itemDuration (all at 0 reduced)
           onDone?={() => …}>           // (n−1)·stagger + itemDuration (200 ms reduced)
  {rows}
</ShatterIn>
```

- Rows are the container's direct children, or the elements matching `itemSelector`.
- Each row is hidden, then assembles from shards top to bottom. The shards fly in from 24–64 px away with up to ±40° rotation. The row is revealed at the end of its slot, and the shards fade over 120 ms.
- Shards per row come from `shardsPerItem()`, so the rows alive at the same time stay within the cap. That is at most 8 per row; 4 per row on a 10-row projector board; 2 on a phone. If the budget is 0 (a huge list with `stagger={0}`), rows just fade in.
- Rows added after it plays just appear. Bump `trigger` to replay.
- `delay` shifts the whole sequence. Lists in the app use `useRevealRows` (`src/components/useRevealRows.ts`), which calls `playShatterIn` once per batch of new rows (so the budget covers the whole batch); dots use `<RevealIn variant="dot">` → `<ShatterBurst>`.

### `<DayBoardMerge>` and `playDayBoardMerge()`

The primitive is data-agnostic. The component is the **stage**: it shows session results before `onFragmented` and the day board after. The host swaps its children from the callbacks.

```ts
interface DayBoardMergeGame { id: string; targets?: () => readonly (Element | DOMRectReadOnly | Rect)[] }

<DayBoardMerge trigger={showDayBoardCount} games={lineup.map(id => ({ id, targets: () => newOrImprovedRowEls(id) }))}
  sources?={() => sessionBoardRowEls()}   // the rows the tiles crack out of (default: bands of the stage)
  density?={'projector'} reducedMotion? seed? className?
  onFragmented={() => setView('dayboard')}
  onGameStart={(g, i) => setTab(i)}
  onRowsReassemble={(g, i, targets) => …}
  onGameEnd={(g, i) => …}
  onSettle={() => setTab(0)}          // tabs then auto-rotate every 8 s (host's job)
  onDone={() => …}>
  {view === 'results' ? <SessionResults/> : <DayBoard tab={tab}/>}
</DayBoardMerge>

playDayBoardMerge({ stage: HTMLElement, games, sources?, …same callbacks }): { cancel(): void }
mergeSchedule(n)  // the callback offsets below, as numbers
```

It reads as **one continuous merge**: a single swarm of small mosaic tiles carries the session's scores from the session board through each game's day board. Tiles are row-sized (cells of `tileScale` 0.8 × the row height, drawn at `tileInset` 0.88 so the grout shows), in the merge palette `MERGE_FILLS` (blue 45 %, blue-deep 40 %, amber 10 %, amber-deep 5 %; no tint or paper), and live on one layer **clipped to the stage's box** (`clip: true`, class `gdg-shatter-clip`), so they never cover the header, the logo or the operator bar.

| Time (3 games) | What happens |
|---|---|
| 0 | the source rows crack into tiles (≤ 4 per row, ≤ 48 in all) that loosen by 15–50 % of a row height, ±12°; the stage fades out over 250–1150 ms |
| 1500 | `onFragmented()` |
| 1500 / 5500 / 9500 (`g`) | `onGameStart(game, i)`: show tab *i*. `targets()` is read **right after** it and the target elements are hidden before a frame is painted; the stage fades in over 360 ms (it is never blanked between games) |
| g + 200 | the floating tiles glide into the target rows (≤ 8 per row, rows staggered, each glide 1.6 s); extra tiles fade |
| g + 2600 (4100 / 8100 / 12100) | `onRowsReassemble(game, i, targets)`: the rows fade in (360 ms) as their tiles fade out |
| g + 3500 (not after the last game) | the reassembled rows crack again; those tiles glide into the next tab |
| g + 4000 | `onGameEnd(game, i)` |
| 13 500 | `onSettle()`: show the first tab (the stage fades in) |
| 15 000 | `onDone()`: every hidden row is visible, the layer is gone |

- The timeline scales with the lineup: `mergeTotalMs(n) = 1500 + 4000·n + 1500`. The constants are `DAY_BOARD_MERGE_TIMELINE`.
- **`onGameStart` must render the tab synchronously.** `<DayBoardMerge>` runs `onFragmented`, `onGameStart` and `onSettle` inside `flushSync`, so a plain `setState` is enough. Imperative callers must commit the DOM themselves.
- **It plays once per `trigger` change.** Re-renders, new callbacks, new `games` arrays and new target rows never restart it (the latest getters are always used). Start it when the data behind the targets is loaded; the host waits for the day boards (at most 2.5 s, `src/host/Results.tsx`).
- With reduced motion there are no tiles. The stage fades out over 0–100 ms. At 100 ms come `onFragmented` and `onGameStart(games[0], 0)`, and the stage fades back in. At 200 ms come `onRowsReassemble(games[0], 0, targets)`, `onSettle` and `onDone`. The other games get no callbacks.
- A game with no targets lets the floating tiles fade; the next game's tiles then assemble from close by.
- The total number of tiles alive never exceeds the density cap (48 on the projector).

### `<ShatterBurst>` and `revealSchedule()`

```ts
const plan = revealSchedule([dots5s.length, dots10s.length, dots7s.length]);  // RevealSlot[][]: { strip, index, delayMs, shards }
<ShatterBurst key={player.id} delay={plan[s][i].delayMs} shards={plan[s][i].shards}
              trigger? playOnMount?={true} density?={'projector'} reducedMotion? seed? onAppear? onDone?>
  <span className={dot} style={{ insetInlineStart: … }} />
</ShatterBurst>
```

- Strips burst in one after another within 5 s. Each strip gets a 5000/3 ms window, and its dots are spread across the window in the order you pass them. The last burst ends at 5000 ms.
- Each dot stays hidden until its `delay`. It then fades in while 2–6 shards around it (a box 1.6× the dot's size) burst outward 10–36 px and fade over 600 ms.
- Only the dot's **opacity** is touched, never its transform, so you can position dots with transforms.
- `shards` from `revealSchedule` keeps concurrent shards ≤ 48. It drops to 0 (plain fade) for very dense strips.
- With reduced motion, the dot fades in over 200 ms.

### Imperative players (non-React)

All of these return `ShatterHandle { cancel(): void }`. `cancel()` removes layers, restores hidden elements, and stops all further callbacks.

- `playScreenShatter(opts)`
- `playCelebrate(el, opts)`
- `playShatterIn(els, opts)`
- `playBurst(el, opts)`
- `playDayBoardMerge(opts)`

### Constants and geometry

- `TRANSITION_TIMELINE`, `CELEBRATE_TIMELINE`, `SHATTER_IN_TIMELINE`, `DAY_BOARD_MERGE_TIMELINE`, `STC_REVEAL_TIMELINE`, `REDUCED_CROSSFADE_MS` (200) and `SHARD_FADE_MS` (120) are the §6.2 timelines as named constants.
- Easings are the §6.1 tokens (`--ease-standard`, `--ease-emphasized`, `--ease-exit`), read from `:root` at play time. Web Animations can't take `var()`.
- The 200 ms and 120 ms values mirror `--dur-base` and `--dur-fast`. They aren't read at runtime because `tokens.css` zeroes those tokens under OS reduced motion, and the fallback must still be 200 ms.
- `createShards(rect, { seed, density, flight, maxShards?, fills? })` returns seeded Delaunay shards. `SHARD_CAPS`, `SHARD_FILLS` (with the §6.2 weights) and `MERGE_FILLS` (the merge palette) are also exported.

## Renderer choice: DOM, not canvas

Each shard is a small inline `<svg>` with one `<polygon>`. It is sized to the shard's bounding box plus 1 px and positioned inside one fixed overlay. It is animated with the Web Animations API on **`transform` and `opacity` only**. A test checks every keyframe for this.

Why this beats a single `<canvas>` for 60 fps on a low-end Android:

1. **Compositor-driven.** Transform and opacity animations run on the compositor thread, so they keep going while the main thread handles Realtime payloads and React renders. A canvas has to redraw the full viewport from JS on the main thread every frame. At DPR 3 on a phone, that is about 2.6 Mpx per frame, competing with the very work that happens during transitions.
2. **Bounded GPU memory.** Each shard layer is only as big as its bounding box. All 48 layers together cover about 1–2× the screen, not 48 full-screen layers.
3. **Crisp 1 px paper edges** come from the SVG stroke (`stroke: var(--gdg-paper)`). There is no `clip-path` mask layer and no per-frame stroking.
4. **Theme-aware for free.** Fills are `var(--gdg-*)` references, so the dark big-screen theme and future token changes apply with no colour reads.
5. **At most 48 nodes.** Creating them costs about 0.4 ms of geometry plus one DOM append per play.

## Geometry

- The grid is `cols × rows` cells, chosen to keep cells close to square with `2·cols·rows ≤ cap`.
- Points are jittered by ±35 % of a cell. Corners are fixed, and edge points move only along their edge.
- The points are triangulated with **Bowyer–Watson**. The result always has exactly `2·cols·rows` triangles that tile the rect.
- The result is checked: the triangle count must match, and the areas must sum to the rect area within 1e-6. If a numerically unlucky point set fails the check, the plain grid split is used instead. That never happened in 8000 seeded trials.
- Shards are sorted top-to-bottom.
- Each shard gets a weighted fill and a flight. The flight direction is outward from the rect's centre ±50°, with a random distance in the profile's range and a random rotation within ±max.
- Everything derives from `Rng` (`src/lib/rng.ts`), so a seed always gives the same shards.

## Trying it out (dev only)

`Demo.tsx` shows every variant, with density and reduced-motion toggles. It isn't routed. To view it, temporarily change the switch in `src/main.tsx`, and **don't commit that change**:

```tsx
import ShatterDemo from './effects/shatter/Demo';
// in App(): case '/shatter-demo': return <ShatterDemo />;
```

Then open `http://localhost:5173/shatter-demo`. The demo labels are plain English on purpose: it's a dev tool, never shown to guests.

## Testing notes

- Everything is `setTimeout`-driven, so `vi.useFakeTimers()` controls it.
- jsdom has no Web Animations API, no `matchMedia` and zero-size boxes. The players handle all three: no shards are drawn for a zero-size box, and timing still runs.
- `test-utils.ts` has `stubAnimate()`, `mockReducedMotion()`, `mockBoxes()`, `layers()` and `shardCount()`.
- Advance time in separate `act()` calls around callbacks that set React state. The merge's tab callbacks flush synchronously (`flushSync`), so `advance(1500)` already shows tab 0 with its new rows hidden.
