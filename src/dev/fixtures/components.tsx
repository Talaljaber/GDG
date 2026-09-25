/**
 * Dev-only fixtures for the shared components and primitives (src/components/*,
 * DESIGN_SYSTEM §0, §4). Fake data only; never calls Supabase.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Fixture } from '../Preview';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Leaderboard } from '../../components/Leaderboard';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Spinner } from '../../components/Spinner';
import { TopBar } from '../../components/TopBar';
import { Trans } from '../../components/Trans';
import { useT } from '../../i18n';
import type { RankedRow } from '../../lib/boards';
import ui from '../../components/ui.module.css';
import { BoardTable, type BoardColumn } from '../../host/BoardTable';
import { HostMotionProvider } from '../../host/motion';

const noop = () => {};

const NAMES: Array<[string, number | null, number]> = [
  ['عبدالرحمن محمد', null, 2940],
  ['Alexandrina K', null, 2710],
  ['Sara', null, 2710],
  ['Sara', 2, 2655],
  ['ليان', null, 2400],
  ['Omar 99', null, 2215],
  ['محمد الخطيب', null, 1980],
  ['Lina', null, 1740],
  ['Yazan', null, 1740],
  ['نور', null, 905],
];

function rows(ownIndex: number | null, detachedOwn = false): RankedRow[] {
  const top: RankedRow[] = NAMES.map(([name, suffix, value], i) => ({
    playerRowId: `p${i}`,
    name,
    displaySuffix: suffix,
    value,
    rank: i + 1,
    isOwn: i === ownIndex,
    detached: false,
  }));
  if (detachedOwn) {
    top.push({ playerRowId: 'own', name: 'Hamza', displaySuffix: null, value: 610, rank: 17, isOwn: true, detached: true });
  }
  return top;
}

const phone: CSSProperties = {
  maxInlineSize: 'var(--phone-max-width)',
  marginInline: 'auto',
  minBlockSize: '100vh',
  background: 'var(--bg)',
};
const column: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--s-5)',
  padding: 'var(--phone-gutter)',
};
const rowWrap: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 'var(--s-3)', alignItems: 'center' };

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <span className={ui.eyebrow}>{label}</span>
      {children}
    </section>
  );
}

function Primitives() {
  const t = useT();
  return (
    <div style={phone}>
      <TopBar showLangToggle />
      <div style={column}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          <span className={ui.eyebrow}>{t('host.lobby.code_label')}</span>
          <h1 className={ui.title}>{t('join.name.title')}</h1>
          <p className={ui.muted}>{t('lobby.waiting')}</p>
        </div>

        <Section label="Buttons">
          <button type="button" className={`${ui.button} ${ui.buttonBlock}`}>
            {t('join.code.next')}
          </button>
          <button type="button" className={`${ui.button} ${ui.buttonSecondary} ${ui.buttonBlock}`}>
            {t('common.cancel')}
          </button>
          <button type="button" className={`${ui.button} ${ui.buttonBlock}`} disabled>
            {t('join.code.next')}
          </button>
          <div style={rowWrap}>
            <button type="button" className={`${ui.button} ${ui.buttonText}`}>
              {t('common.done')}
            </button>
            <button type="button" className={ui.linkButton}>
              {t('join.back')}
            </button>
            <button type="button" className={`${ui.button} ${ui.buttonSmall}`}>
              {t('common.confirm')}
            </button>
            <button type="button" className={`${ui.button} ${ui.buttonSecondary} ${ui.buttonSmall}`}>
              {t('host.lobby.remove')}
            </button>
          </div>
        </Section>

        <Section label="Field">
          <label className={ui.field}>
            <span className={ui.label}>{t('join.name.label')}</span>
            <input className={ui.input} defaultValue="عبدالرحمن محمد" />
            <span className={ui.helper}>
              <span>{t('join.name.hint')}</span>
              <span className={ui.counter}>{t('join.name.counter', { n: 12, max: 12 })}</span>
            </span>
          </label>
          <input className={ui.input} placeholder={t('join.name.placeholder')} aria-invalid="true" />
          <p className={ui.error} role="alert">
            {t('join.name.error_invalid')}
          </p>
        </Section>

        <Section label="Panel · name tags · badges">
          <div className={ui.panel} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className={ui.eyebrow}>{t('host.lobby.players', { n: 4 })}</span>
              <span className={ui.badge}>4</span>
            </div>
            <div style={rowWrap}>
              {['Sara', 'عبدالرحمن محمد', 'Alexandrina K', 'نور'].map((n, i) => (
                <span key={n} className={ui.nameTag}>
                  <span className={`${ui.dot} ${i === 2 ? ui.dotAway : ''}`} />
                  <bdi className={ui.nameTagText}>{n}</bdi>
                </span>
              ))}
            </div>
            <div style={rowWrap}>
              <span className={`${ui.badge} ${ui.ltrNumber}`}>1 / 3</span>
              <span className={`${ui.badge} ${ui.badgeHighlight}`}>#1</span>
            </div>
            <dl className={ui.keyValues}>
              <dt>5 s</dt>
              <dd>320</dd>
              <dt>10 s</dt>
              <dd>288</dd>
              <dt>7 s</dt>
              <dd>301</dd>
            </dl>
          </div>
        </Section>

        <Section label="Tabs">
          <div className={ui.tabs} role="tablist">
            <button type="button" role="tab" aria-selected="true" className={ui.tab}>
              Odd One Out
            </button>
            <button type="button" role="tab" aria-selected="false" className={ui.tab}>
              Simon
            </button>
            <button type="button" role="tab" aria-selected="false" className={ui.tab}>
              Trivia
            </button>
          </div>
        </Section>

        <Section label="Spinner">
          <div style={{ blockSize: 'var(--s-8)', overflow: 'hidden' }}>
            <div style={{ marginBlockStart: 'calc(-25vh + var(--s-6))' }}>
              <Spinner />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function PhoneBoard() {
  return (
    <div style={phone}>
      <TopBar showLangToggle={false} />
      <div style={column}>
        <Leaderboard rows={rows(null, true)} testId="board" />
        <Leaderboard rows={rows(0).slice(0, 4)} />
        <Leaderboard rows={rows(3).slice(0, 5)} />
      </div>
    </div>
  );
}

const projPage: CSSProperties = {
  minBlockSize: '100vh',
  padding: 'var(--big-screen-safe-margin)',
  background: 'var(--bg)',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--proj-s-4)',
  alignItems: 'start',
};
const projStack: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--proj-s-2)', minInlineSize: 0 };
const projHeading: CSSProperties = { fontSize: 'var(--proj-heading)', fontWeight: 'var(--weight-medium)' as CSSProperties['fontWeight'] };

function ProjectorBoard({ highlight }: { highlight?: boolean }) {
  const t = useT();
  return (
    <div style={projPage}>
      <div style={projStack}>
        <span className={`${ui.eyebrow} ${ui.eyebrowProj}`}>{t('host.results.total')}</span>
        <Leaderboard rows={rows(null)} projector reveal={false} />
      </div>
      <div style={projStack}>
        <span className={`${ui.eyebrow} ${ui.eyebrowProj}`}>{t('host.board.score')}</span>
        <h2 style={projHeading}>Odd One Out</h2>
        <Leaderboard
          rows={rows(null).slice(0, 6)}
          projector
          reveal={false}
          highlightIds={highlight ? new Set(['p2', 'p4']) : undefined}
        />
      </div>
    </div>
  );
}

/** Big-screen primitives: eyebrows at --proj-eyebrow, a projector panel, name tags, operator buttons. */
function ProjectorPrimitives() {
  const t = useT();
  const projButton: CSSProperties = { fontSize: 'var(--proj-min)', minBlockSize: 'var(--proj-control-height)' };
  return (
    <div style={projPage}>
      <div className={`${ui.panel} ${ui.panelProj}`} style={projStack}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--proj-s-2)' }}>
          <span className={`${ui.eyebrow} ${ui.eyebrowProj}`}>{t('host.lobby.players', { n: 4 })}</span>
          <span className={`${ui.eyebrow} ${ui.eyebrowProj}`}>{t('host.lobby.join_title')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--proj-s-1)', fontSize: 'var(--proj-min)' }}>
          {['Sara', 'عبدالرحمن محمد', 'Alexandrina K', 'نور'].map((n, i) => (
            <span key={n} className={ui.nameTag} style={{ paddingBlock: 'var(--proj-s-1)', paddingInline: 'var(--proj-s-2)' }}>
              <span className={`${ui.dot} ${ui.dotProj} ${i === 2 ? ui.dotAway : ''}`} />
              <bdi className={ui.nameTagText}>{n}</bdi>
            </span>
          ))}
        </div>
      </div>
      <div className={`${ui.panel} ${ui.panelProj}`} style={projStack}>
        <span className={`${ui.eyebrow} ${ui.eyebrowProj}`}>{t('host.lobby.code_label')}</span>
        <div className={`${ui.tabs} ${ui.tabsProj}`} role="tablist">
          <button type="button" role="tab" aria-selected="true" className={ui.tab}>Odd One Out</button>
          <button type="button" role="tab" aria-selected="false" className={ui.tab}>Simon</button>
        </div>
        <div style={{ display: 'flex', gap: 'var(--proj-s-2)', flexWrap: 'wrap' }}>
          <button type="button" className={ui.button} style={projButton}>{t('host.round.force_end')}</button>
          <button type="button" className={`${ui.button} ${ui.buttonSecondary}`} style={projButton}>
            {t('host.results.show_day_board')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectorDialog() {
  const t = useT();
  return (
    <div style={projPage}>
      <Leaderboard rows={rows(null)} projector reveal={false} />
      <ConfirmDialog onConfirm={noop} onCancel={noop}>
        {t('host.round.force_end_confirm')}
      </ConfirmDialog>
    </div>
  );
}

function Dialog() {
  const t = useT();
  return (
    <div style={phone}>
      <TopBar showLangToggle />
      <div style={column}>
        <h1 className={ui.title}>{t('join.name.title')}</h1>
      </div>
      <ConfirmDialog onConfirm={noop} onCancel={noop}>
        <Trans k="host.lobby.remove_confirm" nodes={{ name: <bdi>عبدالرحمن محمد</bdi> }} />
      </ConfirmDialog>
    </div>
  );
}

function Banner() {
  const t = useT();
  return (
    <div style={phone}>
      <OfflineBanner forceOffline />
      <TopBar showLangToggle />
      <div style={column}>
        <h1 className={ui.title}>{t('lobby.in')}</h1>
        <p className={ui.muted}>{t('lobby.waiting')}</p>
      </div>
    </div>
  );
}


// ---- host v3 board engine (BoardTable, FLIP, count-up; docs/plans/host-v3.md WP3) ----

const V3: Array<[string, number]> = [
  ['عبدالرحمن سا', 940],
  ['Maximilian R', 903],
  ['Sara', 866],
  ['الإسلام لإيلاف', 812],
  ['Omar', 770],
  ['Lina', 731],
  ['Yazan', 688],
];

function v3Rows(order: number[], values?: number[]): RankedRow[] {
  return order.map((src, i) => ({
    playerRowId: `v${src}`,
    name: V3[src][0],
    displaySuffix: null,
    value: values ? values[i] : V3[src][1],
    rank: i + 1,
    isOwn: false,
    detached: false,
  }));
}

const boardPage: CSSProperties = { ...projPage, gridTemplateColumns: '5fr 7fr' };

/** Static: a live board with 3 scores (7 empty slots), and H4's round columns. */
function HostBoard() {
  const t = useT();
  const columns = useMemo<BoardColumn[]>(
    () =>
      (['stop_the_clock', 'odd_one_out', 'simon'] as const).map((g, gi) => ({
        key: g,
        head: t(`game.${g}.name`),
        value: (r: RankedRow) => (
          <span data-testid="board-round-score" data-game={g}>
            {Math.round(r.value / 3) - gi * 7}
          </span>
        ),
      })),
    [t],
  );
  const three = useMemo(() => v3Rows([0, 1, 2]), []);
  const all = useMemo(() => v3Rows([0, 1, 2, 3, 4, 5, 6], [2890, 2853, 2853, 2610, 2402, 2255, 1990]), []);
  return (
    <HostMotionProvider>
      <div style={boardPage}>
        <div style={projStack}>
          <BoardTable rows={[]} testId="board-empty" emptyText={t('host.round.no_scores_yet')} slots={3} />
          <BoardTable rows={three} testId="board-three" highlightIds={new Set(['v1'])} slots={6} />
        </div>
        <div style={projStack}>
          <BoardTable rows={all} testId="board-columns" columns={columns} />
        </div>
      </div>
    </HostMotionProvider>
  );
}

/** Loops round board → total so far every 3.5 s: cascade, count-up, FLIP, pulse, deltas. */
function HostBoardFlip() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % 2), 3500);
    return () => window.clearInterval(id);
  }, []);
  const round = useMemo(() => v3Rows([0, 1, 2, 3, 4, 5, 6]), []);
  const total = useMemo(() => v3Rows([3, 0, 5, 1, 6, 2, 4], [1890, 1849, 1808, 1767, 1726, 1685, 1644]), []);
  return (
    <HostMotionProvider>
      <div style={boardPage}>
        <div />
        <BoardTable rows={step === 0 ? round : total} testId="board-flip" countUp celebrateLeader />
      </div>
    </HostMotionProvider>
  );
}

export const fixtures: Fixture[] = [
  { name: 'components.primitives', frame: 'phone', render: () => <Primitives /> },
  { name: 'components.board-phone', frame: 'phone', render: () => <PhoneBoard /> },
  { name: 'components.board-projector', frame: 'projector', render: () => <ProjectorBoard /> },
  { name: 'components.board-projector-highlight', frame: 'projector', render: () => <ProjectorBoard highlight /> },
  { name: 'components.projector-primitives', frame: 'projector', render: () => <ProjectorPrimitives /> },
  { name: 'components.dialog', frame: 'phone', render: () => <Dialog /> },
  { name: 'components.dialog-projector', frame: 'projector', render: () => <ProjectorDialog /> },
  { name: 'components.banner-offline', frame: 'phone', render: () => <Banner /> },
  { name: 'components.host-board', frame: 'projector', render: () => <HostBoard /> },
  { name: 'components.host-board-flip', frame: 'projector', render: () => <HostBoardFlip /> },
];
