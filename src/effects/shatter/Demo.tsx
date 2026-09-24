/**
 * DEV-ONLY showcase of every shatter variant. Not routed and never shipped
 * to guests, so its labels are plain English on purpose (no i18n keys).
 * Mount it temporarily — see README.md "Trying it out".
 */
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import logo from '../../assets/logo.png';
import { Celebrate } from './Celebrate';
import { DayBoardMerge } from './DayBoardMerge';
import type { Density } from './geometry';
import { useCelebrate } from './hooks';
import type { DayBoardMergeGame } from './merge';
import { revealSchedule } from './plays';
import { ShatterBurst } from './ShatterBurst';
import { ShatterIn } from './ShatterIn';
import { ShatterProvider } from './ShatterProvider';
import { ShatterTransition } from './ShatterTransition';
import { SHATTER_LOGO_CLASS } from './index';

const card: CSSProperties = {
  background: 'var(--surface)',
  border: 'var(--line-width) solid var(--gdg-line)',
  borderRadius: 'var(--r-card)',
  padding: 'var(--s-4)',
  display: 'grid',
  gap: 'var(--s-3)',
};
const button: CSSProperties = {
  minBlockSize: 'var(--touch-target-min)',
  paddingInline: 'var(--s-4)',
  borderRadius: 'var(--r-button)',
  border: 'none',
  background: 'var(--gdg-blue-deep)',
  color: 'var(--on-primary)',
  fontWeight: 'var(--type-button-weight)' as CSSProperties['fontWeight'],
  justifySelf: 'start',
};
const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: 'var(--s-3)',
  borderRadius: 'var(--r-button)',
  background: 'var(--gdg-blue-tint)',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={card}>
      <h2 style={{ fontSize: 'var(--type-title-size)', margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

const SCREENS = ['Join', 'Lobby', 'Round', 'Results'];
const PLAYERS = ['Omar', 'Lina', 'Sara', 'Adam', 'Noor', 'Yousef'];
const GAMES = ['Stop the Clock', 'Simon', 'Trivia'];
const REVEAL_COUNTS = [12, 12, 12];

function CelebrateRow() {
  const { ref, celebrate, playing } = useCelebrate<HTMLLIElement>();
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      <li ref={ref} style={{ ...rowStyle, background: 'var(--gdg-amber-tint)' }}>
        <span>1 · Omar</span>
        <span>938</span>
      </li>
      <li style={{ marginBlockStart: 'var(--s-2)' }}>
        <button style={button} onClick={celebrate} disabled={playing}>
          useCelebrate on an li
        </button>
      </li>
    </ol>
  );
}

function MergeDemo() {
  const [trigger, setTrigger] = useState(0);
  const [view, setView] = useState<'results' | number>('results');
  const [highlight, setHighlight] = useState<number | null>(null);
  const board = useRef<HTMLOListElement>(null);
  const games: DayBoardMergeGame[] = GAMES.map((id) => ({
    id,
    targets: () => Array.from(board.current?.querySelectorAll('[data-new]') ?? []),
  }));
  return (
    <>
      <button
        style={button}
        onClick={() => {
          setView('results');
          setHighlight(null);
          setTrigger((n) => n + 1);
        }}
      >
        Show day board
      </button>
      <DayBoardMerge
        trigger={trigger}
        games={games}
        onFragmented={() => setView(0)}
        onGameStart={(_g, i) => {
          setView(i);
          setHighlight(null);
        }}
        onRowsReassemble={(_g, i) => setHighlight(i)}
        onSettle={() => {
          setView(0);
          setHighlight(null);
        }}
      >
        {view === 'results' ? (
          <div style={{ ...rowStyle, minBlockSize: '12rem', alignItems: 'center', justifyContent: 'center' }}>
            Session results
          </div>
        ) : (
          <div>
            <strong>Day board · {GAMES[view]}</strong>
            <ol ref={board} style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 'var(--s-2)' }}>
              {PLAYERS.slice(0, 5).map((p, i) => (
                <li
                  key={p}
                  data-new={(i + view) % 2 === 0 ? '' : undefined}
                  style={{
                    ...rowStyle,
                    background:
                      highlight === view && (i + view) % 2 === 0 ? 'var(--gdg-amber-tint)' : 'var(--gdg-blue-tint)',
                  }}
                >
                  <span>
                    {i + 1} · {p}
                  </span>
                  <span>{900 - i * 70 - view * 13}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </DayBoardMerge>
    </>
  );
}

function RevealDemo({ density }: { density: Density }) {
  const [run, setRun] = useState(0);
  const plan = useMemo(() => revealSchedule(REVEAL_COUNTS, { density }), [density]);
  return (
    <>
      <button style={button} onClick={() => setRun((n) => n + 1)}>
        Replay reveal
      </button>
      {/* Game geometry is never mirrored: the strips are always left-to-right. */}
      <div dir="ltr" style={{ display: 'grid', gap: 'var(--s-4)' }}>
        {plan.map((strip, s) => (
          <div key={s} style={{ position: 'relative', blockSize: 'var(--s-7)', background: 'var(--gdg-blue-tint)', borderRadius: 'var(--r-chip)' }}>
            {strip.map((slot) => (
              <ShatterBurst key={`${run}:${s}:${slot.index}`} delay={slot.delayMs} shards={slot.shards} density={density}>
                <span
                  style={{
                    position: 'absolute',
                    insetBlockStart: 'var(--s-4)',
                    insetInlineStart: `${5 + ((slot.index * 37 + s * 11) % 90)}%`,
                    inlineSize: 'var(--s-4)',
                    blockSize: 'var(--s-4)',
                    borderRadius: 'var(--r-chip)',
                    background: slot.index < 5 ? 'var(--gdg-amber)' : 'var(--gdg-blue)',
                    border: 'var(--line-width) solid var(--gdg-ink)',
                  }}
                />
              </ShatterBurst>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export default function ShatterDemo() {
  const [density, setDensity] = useState<Density>('phone');
  const [reduced, setReduced] = useState(false);
  const [screenIndex, setScreenIndex] = useState(0);
  const [celebrate, setCelebrate] = useState(0);
  const [boardRun, setBoardRun] = useState(0);

  return (
    <ShatterProvider density={density} reducedMotion={reduced}>
      <div style={{ padding: 'var(--s-4)', display: 'grid', gap: 'var(--s-5)', maxInlineSize: '60rem', marginInline: 'auto' }}>
        <header style={{ display: 'flex', gap: 'var(--s-4)', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* The logo stays above every shard layer and is never animated. */}
          <img src={logo} alt="" className={SHATTER_LOGO_CLASS} style={{ blockSize: 'var(--logo-phone-height)' }} />
          <label>
            <input type="checkbox" checked={density === 'projector'} onChange={(e) => setDensity(e.target.checked ? 'projector' : 'phone')} />{' '}
            Projector density (48)
          </label>
          <label>
            <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} /> Reduced motion
          </label>
        </header>

        <Section title="Screen transition">
          <button style={button} onClick={() => setScreenIndex((i) => (i + 1) % SCREENS.length)}>
            Next screen
          </button>
          <ShatterTransition transitionKey={screenIndex}>
            <div style={{ ...rowStyle, minBlockSize: '8rem', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--type-title-size)' }}>
              {SCREENS[screenIndex]}
            </div>
          </ShatterTransition>
        </Section>

        <Section title="Celebrate">
          <button style={button} onClick={() => setCelebrate((n) => n + 1)}>
            New personal best
          </button>
          <Celebrate trigger={celebrate}>
            <div style={{ ...card, background: 'var(--gdg-amber-tint)', fontSize: 'var(--type-title-size)', justifyItems: 'center' }}>
              812
            </div>
          </Celebrate>
          <CelebrateRow />
        </Section>

        <Section title="Round results shatter-in">
          <button style={button} onClick={() => setBoardRun((n) => n + 1)}>
            Replay
          </button>
          <ShatterIn as="ol" trigger={boardRun}>
            {PLAYERS.map((p, i) => (
              <li key={p} style={{ ...rowStyle, marginBlockEnd: 'var(--s-2)', listStyle: 'none' }}>
                <span>
                  {i + 1} · {p}
                </span>
                <span>{950 - i * 60}</span>
              </li>
            ))}
          </ShatterIn>
        </Section>

        <Section title="Day-board merge (~15 s)">
          <MergeDemo />
        </Section>

        <Section title="Stop the Clock reveal">
          <RevealDemo density={density} />
        </Section>
      </div>
    </ShatterProvider>
  );
}
