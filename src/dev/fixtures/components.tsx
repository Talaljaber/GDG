/**
 * Dev-only fixtures for the shared components and primitives (src/components/*,
 * DESIGN_SYSTEM §0, §4). Fake data only; never calls Supabase.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Fixture } from '../Preview';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Leaderboard } from '../../components/Leaderboard';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Spinner } from '../../components/Spinner';
import { TopBar } from '../../components/TopBar';
import { useT } from '../../i18n';
import type { RankedRow } from '../../lib/boards';
import ui from '../../components/ui.module.css';

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
            <span className={ui.label}>{t('join.name.placeholder')}</span>
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

function ProjectorBoard({ highlight }: { highlight?: boolean }) {
  return (
    <div
      style={{
        minBlockSize: '100vh',
        padding: 'var(--big-screen-safe-margin)',
        background: 'var(--bg)',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--proj-s-4)',
        alignItems: 'start',
      }}
    >
      <Leaderboard rows={rows(null)} projector reveal={false} />
      <Leaderboard
        rows={rows(null).slice(0, 6)}
        projector
        reveal={false}
        highlightIds={highlight ? new Set(['p2', 'p4']) : undefined}
      />
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
        {t('host.lobby.remove_confirm', { name: 'عبدالرحمن محمد' })}
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

export const fixtures: Fixture[] = [
  { name: 'components.primitives', frame: 'phone', render: () => <Primitives /> },
  { name: 'components.board-phone', frame: 'phone', render: () => <PhoneBoard /> },
  { name: 'components.board-projector', frame: 'projector', render: () => <ProjectorBoard /> },
  { name: 'components.board-projector-highlight', frame: 'projector', render: () => <ProjectorBoard highlight /> },
  { name: 'components.dialog', frame: 'phone', render: () => <Dialog /> },
  { name: 'components.banner-offline', frame: 'phone', render: () => <Banner /> },
];
