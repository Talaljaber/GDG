/**
 * Pieces shared by the host screens, v3 "Stage and Rail" (ADR-135,
 * `docs/plans/host-v3.md` §4): the shell, the brand strip (logo · tagline on
 * H1, the pending session's code at its inline-end during play, ADR-015),
 * the operator rail at the bottom edge (every host control lives there,
 * nothing for the room), bilingual labels (inline, or stacked on H1), the
 * facing-chevron frame, the lineup summary, and the lineup tray (H1, and the
 * "next games" picker for the pending session during play, ADR-009/E20).
 */
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { ROUNDS_PER_SESSION } from '../config';
import { formatNumber, translate, useLang, useT, type Lang } from '../i18n';
import { adminSetLineup, type SessionRow } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { GameId } from '../games/types';
import logo from '../assets/logo.png';
import { SHATTER_LOGO_CLASS } from '../effects/shatter';
import ui from '../components/ui.module.css';
import styles from './host.module.css';
import { isLineupValid, sameLineup, toggleLineup } from './lineup';
import { REGISTERED_GAMES, type HostController } from './useHost';
import { useHostMotion } from './motionContext';

/** Where the host's "Dark screen" setting is remembered on this laptop (plan §4.7, ADR-122). */
export const HOST_THEME_KEY = 'gdg.v1.host-theme';

// ------------------------------------------------------------------ shell and brand strip

/**
 * The big-screen root: brand strip · stage · rail, stacked by each screen.
 * During H2/H3 (screens without a logo of their own, so no screen transition
 * can ever fade it, DESIGN_SYSTEM §5) the logo sits here, outside the
 * transitions, exactly where the H1/H4/H5 brand strips put theirs.
 */
export function HostShell({ screen, banner, children }: { screen: string; banner?: ReactNode; children: ReactNode }) {
  const t = useT();
  const floatingLogo = screen === 'round' || screen === 'intermission';
  return (
    <div className={styles.host} data-testid="host-root" data-screen={screen}>
      {banner ? (
        <div className={styles.banner} role="status" data-testid="host-banner">
          {banner}
        </div>
      ) : null}
      {children}
      {floatingLogo ? (
        <img
          src={logo}
          alt={t('app.name')}
          className={`${ui.projLogo} ${SHATTER_LOGO_CLASS} ${styles.logoFloating}`}
          data-testid="logo"
        />
      ) : null}
    </div>
  );
}

/**
 * The brand strip: the logo (or its reserved slot on H2/H3, see HostShell),
 * then the tagline after a hairline rule (H1 only: shown when there's no
 * title and nothing at the inline end), an optional title, and an
 * inline-end slot (the next-session code).
 */
export function HostHeader({
  title,
  withLogo,
  end,
  tagline,
}: {
  title?: ReactNode;
  withLogo: boolean;
  end?: ReactNode;
  /** Defaults to "no title and no end slot", i.e. H1. */
  tagline?: boolean;
}) {
  const t = useT();
  const showTagline = tagline ?? (title === undefined && end === undefined);
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        {withLogo ? (
          <img src={logo} alt={t('app.name')} className={`${ui.projLogo} ${SHATTER_LOGO_CLASS}`} data-testid="logo" />
        ) : (
          // An invisible copy holds the exact space the floating logo covers (HostShell).
          <img src={logo} alt="" aria-hidden="true" className={`${ui.projLogo} ${SHATTER_LOGO_CLASS} ${styles.logoSlot}`} />
        )}
        {showTagline || title !== undefined ? <span className={styles.brandRule} aria-hidden="true" /> : null}
        {title}
        {showTagline ? <span className={styles.tagline}>{t('host.header.tagline')}</span> : null}
      </div>
      {end ? <div className={styles.headerEnd}>{end}</div> : null}
    </header>
  );
}

/**
 * The pending session's code at the brand strip's inline-end while a
 * session runs (ADR-015): latecomers type it and land in P3b. Ink, not blue.
 */
export function CornerCode({ pending, joined }: { pending: SessionRow | null; joined: number }) {
  const t = useT();
  if (!pending) return null;
  return (
    <div className={styles.corner} data-testid="host-corner" data-count={joined}>
      <span className={styles.cornerLabel}>{t('host.corner.late')}</span>
      <span dir="ltr" data-testid="host-corner-code" className={styles.cornerDigits}>
        {pending.code}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ labels and frames

/**
 * A label in both languages at once (SCREENS H1): the screen language
 * first, then the other one, muted. Inline by default (`·` between them);
 * `stacked` puts the other language on a second line (the v3 H1 eyebrows).
 */
export function Bilingual({
  k,
  params,
  className,
  stacked = false,
}: {
  k: string;
  params?: Record<string, string>;
  className?: string;
  stacked?: boolean;
}) {
  const { lang } = useLang();
  const other: Lang = lang === 'en' ? 'ar' : 'en';
  return (
    <span className={`${stacked ? styles.bilingualStacked : styles.bilingual} ${className ?? ''}`}>
      <span lang={lang}>{translate(lang, k, params)}</span>
      {stacked ? null : (
        <span className={styles.bilingualSep} aria-hidden="true">
          ·
        </span>
      )}
      <span lang={other} dir={other === 'ar' ? 'rtl' : 'ltr'} className={styles.bilingualOther}>
        {translate(other, k, params)}
      </span>
    </span>
  );
}

/**
 * Facing chevrons as thin line glyphs (blue `<` inline-start, amber `>`
 * inline-end) around exactly one hero per screen (ADR-033). Sized by the
 * `--frame-chevron-block` / `--frame-chevron-inline` custom properties the
 * caller's class may set (default: the hero's full height).
 */
export function Framed({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.framed} ${className ?? ''}`}>
      <svg className={`${styles.chevron} ${styles.chevronStart}`} viewBox="0 0 24 48" aria-hidden="true">
        <path d="M20 4 L4 24 L20 44" />
      </svg>
      {children}
      <svg className={`${styles.chevron} ${styles.chevronEnd}`} viewBox="0 0 24 48" aria-hidden="true">
        <path d="M4 4 L20 24 L4 44" />
      </svg>
    </div>
  );
}

/** A small arrow between lineup names; points along the reading direction (mirrors in RTL). */
function Arrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8 H13 M9 4 L13 8 L9 12" />
    </svg>
  );
}

/** A thin `›` between the lineup tray's ordered slots (mirrors in RTL). */
function SlotChevron() {
  return (
    <svg className={styles.slotChevron} viewBox="0 0 12 24" aria-hidden="true">
      <path d="M3 4 L9 12 L3 20" />
    </svg>
  );
}

/**
 * "Stop the Clock → Odd One Out → Simon"; the current round (1-based) in ink
 * with a blue "live" underline, done rounds muted. `list`: one numbered game
 * per line instead (the H2 scorebug, where the one-line form would wrap).
 * Memoised: it sits on H2/H3 and in the rail, which re-render on every score;
 * callers pass stable arrays.
 */
export const LineupSummary = memo(function LineupSummary({
  games,
  current,
  list = false,
}: {
  games: readonly string[];
  current?: number;
  list?: boolean;
}) {
  const t = useT();
  const state = (i: number) =>
    current === undefined ? '' : i + 1 === current ? styles.summaryCurrent : i + 1 < current ? styles.summaryDone : '';
  if (list)
    return (
      <ol className={styles.summaryList}>
        {games.map((g, i) => (
          <li key={`${g}-${i}`} className={styles.summaryRow} aria-current={i + 1 === current ? 'step' : undefined}>
            <span className={styles.summaryNo}>{formatNumber(i + 1)}</span>
            <span className={state(i)}>{t(`game.${g}.name`)}</span>
          </li>
        ))}
      </ol>
    );
  return (
    <span className={styles.summary}>
      {games.map((g, i) => (
        <span key={`${g}-${i}`} className={styles.summaryItem}>
          {i > 0 ? <Arrow /> : null}
          <span className={state(i)}>{t(`game.${g}.name`)}</span>
        </span>
      ))}
    </span>
  );
});

// ------------------------------------------------------------------ the rail

/**
 * The operator rail (plan §4 "Rail"): no fill, a hairline on top, muted type.
 * Inline-start the context (`start`), inline-end Settings and then the
 * screen's actions (the last one is the one ink-filled primary button).
 * `tray`: H1, where the lineup tray takes the whole rail and brings its own
 * actions (Settings included, see LineupPicker's `actions`).
 */
export function Rail({ start, children, tray = false }: { start?: ReactNode; children?: ReactNode; tray?: boolean }) {
  if (tray)
    return (
      <footer className={`${styles.rail} ${styles.railTray}`} data-rail="tray">
        {start}
      </footer>
    );
  return (
    <footer className={styles.rail} data-rail="bar">
      <div className={styles.railStart}>{start}</div>
      <div className={styles.railEnd}>
        <SettingsMenu />
        {children}
      </div>
    </footer>
  );
}

/** v2 name of the rail, kept for the screens that still import it. */
export const OperatorBar = Rail;

function readDarkScreen(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
}

function writeDarkScreen(on: boolean): void {
  const root = document.documentElement;
  if (on) root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  try {
    if (on) localStorage.setItem(HOST_THEME_KEY, 'dark');
    else localStorage.removeItem(HOST_THEME_KEY);
  } catch {
    // private mode / blocked storage: the toggle still works for this page
  }
}

/**
 * Settings (SCREENS H6, plan §4.7): Reduce motion, Dark screen, the screen
 * language and Sign out, as a one-row strip above the button.
 */
export function SettingsMenu() {
  const t = useT();
  const { lang, setLang } = useLang();
  const motion = useHostMotion();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(readDarkScreen);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setDark(readDarkScreen());
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={styles.menuWrap} ref={wrap}>
      <button
        type="button"
        className={`${styles.textButton} ${styles.settingsButton}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="host-settings"
      >
        <svg className={styles.gear} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </svg>
        {t('host.settings.title')}
      </button>
      {open ? (
        <div className={styles.menu} role="group" aria-label={t('host.settings.title')}>
          <button
            type="button"
            className={styles.menuItem}
            aria-pressed={motion.reducedMotion}
            onClick={() => motion.setReducedMotion(!motion.reducedMotion)}
            data-testid="host-reduced-motion"
          >
            <span className={styles.check} aria-hidden="true" />
            {t('host.settings.reduced_motion')}
          </button>
          <button
            type="button"
            className={styles.menuItem}
            aria-pressed={dark}
            onClick={() => {
              writeDarkScreen(!dark);
              setDark(!dark);
            }}
            data-testid="host-theme"
          >
            <span className={styles.check} aria-hidden="true" />
            {t('host.settings.theme')}
          </button>
          <button
            type="button"
            className={styles.menuItem}
            lang={lang === 'en' ? 'ar' : 'en'}
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
          >
            <span className={styles.checkSpace} aria-hidden="true" />
            {t('common.lang_toggle')}
          </button>
          <button type="button" className={styles.menuItem} onClick={() => void supabase.auth.signOut()}>
            <span className={styles.checkSpace} aria-hidden="true" />
            {t('host.signout')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ lineup tray

/**
 * The lineup tray (plan §5). Line 1: the label (or, while incomplete, what's
 * missing, in ink), a hairline rule, then the ROUNDS_PER_SESSION ordered
 * slots (tap a picked one to remove it) and, on H1, the rail's actions at
 * the inline end. Line 2: every other registered game as a quiet "+ name"
 * button, wrapping onto more lines rather than scrolling (up to 10 games),
 * and on H1 a note under the actions.
 * Every game keeps exactly one button `<prefix>-<game>` with aria-pressed =
 * picked; a picked button's text starts with its ordinal. Only registered
 * games can be picked (Trivia appears once it has 5 ready questions); a
 * valid pick is saved at once with admin_set_lineup.
 */
export function LineupPicker({
  host,
  session,
  titleKey,
  testIdPrefix = 'lineup',
  onSyncedChange,
  actions,
  note,
}: {
  host: HostController;
  session: SessionRow;
  titleKey: string;
  testIdPrefix?: string;
  /** Told whether the picker shows exactly the saved lineup (H1 Start waits for it). */
  onSyncedChange?(synced: boolean): void;
  /** H1: the rail's actions (Settings, Start) at the end of line 1. */
  actions?: ReactNode;
  /** H1: a quiet note at the end of line 2, under the actions (why Start is disabled). */
  note?: ReactNode;
}) {
  const t = useT();
  // Only registered games can be picked: a saved lineup with a game this build doesn't offer
  // (e.g. Trivia without 5 ready questions) shows as incomplete instead of hiding a pick.
  const registeredOnly = (games: readonly string[]) => games.filter((g): g is GameId => REGISTERED_GAMES.includes(g as GameId));
  const [picker, setPicker] = useState<GameId[]>(() => registeredOnly(session.lineup));
  const [error, setError] = useState<string | null>(null);
  const saved = session.lineup.join(',');
  useEffect(() => {
    setPicker(saved ? registeredOnly(saved.split(',')) : []);
  }, [saved]);
  const valid = isLineupValid(picker, REGISTERED_GAMES, ROUNDS_PER_SESSION);
  const synced = sameLineup(picker, session.lineup);
  useEffect(() => {
    onSyncedChange?.(synced);
  }, [synced, onSyncedChange]);
  useEffect(() => {
    if (!valid || synced) return;
    setError(null);
    void host.act(() => adminSetLineup(session.id, picker)).catch(() => setError('sys.generic_error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker.join(','), valid, synced, session.id]);

  const title = t(titleKey, { n: formatNumber(ROUNDS_PER_SESSION) });
  const full = picker.length >= ROUNDS_PER_SESSION;
  const toggle = (g: GameId) => setPicker((l) => toggleLineup(l, g, ROUNDS_PER_SESSION));
  return (
    <div
      className={styles.tray}
      data-testid={`${testIdPrefix}-picker`}
      data-valid={valid ? 'true' : 'false'}
      data-synced={synced ? 'true' : 'false'}
    >
      <div className={styles.trayLine}>
        <div className={styles.trayHead}>
          {/* While the lineup is incomplete its label says what's missing, in ink (one label, not two). */}
          {valid ? (
            <span className={styles.trayLabel}>{title}</span>
          ) : (
            <span className={styles.trayStatus} role="status">
              {t('host.lineup.need', { n: formatNumber(ROUNDS_PER_SESSION), count: ROUNDS_PER_SESSION })}
            </span>
          )}
          <span className={styles.trayRule} aria-hidden="true" />
          <div className={styles.slots} role="group" aria-label={title}>
            {Array.from({ length: ROUNDS_PER_SESSION }, (_, i) => {
              const g = picker[i];
              return (
                <span key={g ?? `empty-${i}`} className={styles.slotItem}>
                  {i > 0 ? <SlotChevron /> : null}
                  {g ? (
                    <button
                      type="button"
                      className={styles.slot}
                      aria-pressed="true"
                      onClick={() => toggle(g)}
                      data-testid={`${testIdPrefix}-${g}`}
                    >
                      <span className={styles.ordinal}>{formatNumber(i + 1)}</span>
                      {t(`game.${g}.name`)}
                      <svg className={styles.slotRemove} viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8 8 L16 16 M16 8 L8 16" />
                      </svg>
                    </button>
                  ) : (
                    <span className={styles.slotEmpty} aria-hidden="true">
                      {formatNumber(i + 1)}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          {error ? (
            <span className={styles.trayStatus} role="alert">
              {t(error)}
            </span>
          ) : null}
        </div>
        {actions ? <div className={styles.trayActions}>{actions}</div> : null}
      </div>
      <div className={styles.pool}>
        {REGISTERED_GAMES.filter((g) => !picker.includes(g)).map((g) => (
          <button
            key={g}
            type="button"
            className={styles.poolItem}
            aria-pressed="false"
            disabled={full}
            onClick={() => toggle(g)}
            data-testid={`${testIdPrefix}-${g}`}
          >
            <svg className={styles.plus} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 6 V18 M6 12 H18" />
            </svg>
            {t(`game.${g}.name`)}
          </button>
        ))}
        {note ? <span className={styles.trayNote}>{note}</span> : null}
      </div>
    </div>
  );
}

/**
 * The next session's lineup (H2–H5) as a text button in the rail: opens the
 * lineup tray for the pending session in a popover above the rail; New
 * session then turns it into the lobby with this lineup (ADR-010, AC2.4).
 */
export function NextGamesButton({
  host,
  pending,
  initialOpen = false,
}: {
  host: HostController;
  pending: SessionRow | null;
  /** Dev preview only: render with the picker open. */
  initialOpen?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(initialOpen);
  if (!pending) return null;
  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        className={styles.nextGames}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="host-next-games"
      >
        <span className={styles.nextGamesLabel}>{t('host.lineup.next_title')}</span>
        <LineupSummary games={pending.lineup} />
      </button>
      {open ? (
        <div className={styles.popover} role="dialog" aria-label={t('host.lineup.next_title')} data-testid="next-games-dialog">
          <LineupPicker host={host} session={pending} titleKey="host.lineup.title" testIdPrefix="next-lineup" />
          <button type="button" className={styles.primary} onClick={() => setOpen(false)} data-testid="next-games-done">
            {t('common.done')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
