/**
 * Pieces shared by the host screens (`SCREENS.md` §2.2, DESIGN_SYSTEM §0.2):
 * the shell, the header strip (logo · tagline · inline-end slot), the
 * pending session's code at the header's inline-end during play (ADR-015),
 * the operator bar (lineup, settings, the one primary action), one-line
 * bilingual labels, the facing-chevron frame, and the lineup picker (H1, and
 * the "next games" picker for the pending session during play, ADR-009/E20).
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

// ------------------------------------------------------------------ shell and header

/**
 * The big-screen root. During H2/H3 (screens without a logo of their own, so
 * no screen transition can ever fade it, DESIGN_SYSTEM §5) the logo sits here,
 * outside the transitions, exactly where the H1/H4/H5 headers put theirs.
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
 * The header strip: logo (or its reserved slot on H2/H3, see HostShell),
 * the tagline or screen title, and an inline-end slot (the next-session code).
 */
export function HostHeader({ title, withLogo, end }: { title?: ReactNode; withLogo: boolean; end?: ReactNode }) {
  const t = useT();
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        {withLogo ? (
          <img src={logo} alt={t('app.name')} className={`${ui.projLogo} ${SHATTER_LOGO_CLASS}`} data-testid="logo" />
        ) : (
          // An invisible copy holds the exact space the floating logo covers (HostShell).
          <img src={logo} alt="" aria-hidden="true" className={`${ui.projLogo} ${SHATTER_LOGO_CLASS} ${styles.logoSlot}`} />
        )}
        <span className={styles.brandRule} aria-hidden="true" />
        {title ?? <span className={styles.tagline}>{t('host.header.tagline')}</span>}
      </div>
      {end ? <div className={styles.headerEnd}>{end}</div> : null}
    </header>
  );
}

/**
 * The pending session's code at the header's inline-end while a session runs
 * (ADR-015): latecomers type it and land in P3b.
 */
export function CornerCode({ pending, joined }: { pending: SessionRow | null; joined: number }) {
  const t = useT();
  if (!pending) return null;
  return (
    <div className={styles.corner} data-testid="host-corner" data-count={joined}>
      <span className={styles.eyebrow}>{t('host.corner.late')}</span>
      <span dir="ltr" data-testid="host-corner-code" className={styles.cornerDigits}>
        {pending.code}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ labels and frames

/**
 * A join label in both languages at once (SCREENS H1), on one line: the
 * screen language first, then `·` and the other language, muted.
 */
export function Bilingual({ k, params, className }: { k: string; params?: Record<string, string>; className?: string }) {
  const { lang } = useLang();
  const other: Lang = lang === 'en' ? 'ar' : 'en';
  return (
    <span className={`${styles.bilingual} ${className ?? ''}`}>
      <span lang={lang}>{translate(lang, k, params)}</span>
      <span className={styles.bilingualSep} aria-hidden="true">
        ·
      </span>
      <span lang={other} dir={other === 'ar' ? 'rtl' : 'ltr'} className={styles.bilingualOther}>
        {translate(other, k, params)}
      </span>
    </span>
  );
}

/**
 * Facing chevrons as thin line glyphs (blue `<` inline-start, amber `>`
 * inline-end) around exactly one hero per screen (DESIGN_SYSTEM §0.1 rule 7).
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

/**
 * "Stop the Clock → Odd One Out → Simon"; the current round (1-based) in blue. Memoised: it sits
 * on H2/H3 and in the operator bar, which re-render on every score; callers pass stable arrays.
 */
export const LineupSummary = memo(function LineupSummary({ games, current }: { games: readonly string[]; current?: number }) {
  const t = useT();
  return (
    <span className={styles.summary}>
      {games.map((g, i) => (
        <span key={`${g}-${i}`} className={styles.summaryItem}>
          {i > 0 ? <Arrow /> : null}
          <span
            className={
              current === undefined ? '' : i + 1 === current ? styles.summaryCurrent : i + 1 < current ? styles.summaryDone : ''
            }
          >
            {t(`game.${g}.name`)}
          </span>
        </span>
      ))}
    </span>
  );
});

// ------------------------------------------------------------------ operator bar

/**
 * The operator bar (DESIGN_SYSTEM §0.2): inline-start the lineup, inline-end
 * the quiet Settings menu and then the screen's actions (the last one is the
 * one solid primary button).
 */
export function OperatorBar({ start, children }: { start?: ReactNode; children?: ReactNode }) {
  return (
    <footer className={styles.operator}>
      <div className={styles.operatorStart}>{start}</div>
      <div className={styles.operatorEnd}>
        <SettingsMenu />
        {children}
      </div>
    </footer>
  );
}

/** Settings (SCREENS H6): Reduce motion, the screen language and Sign out, as quiet text buttons. */
export function SettingsMenu() {
  const t = useT();
  const { lang, setLang } = useLang();
  const motion = useHostMotion();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
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

// ------------------------------------------------------------------ lineup picker

/**
 * The lineup in pick order (DESIGN_SYSTEM §0.2): the picks 1 → 2 → 3, then the
 * other games as quiet "+ add" buttons; tap to add in
 * order (small tabular ordinals 1 2 3), tap again to remove, at most
 * ROUNDS_PER_SESSION; only registered games (Trivia appears once it has 5
 * ready questions). A valid pick is saved at once with admin_set_lineup.
 */
export function LineupPicker({
  host,
  session,
  titleKey,
  testIdPrefix = 'lineup',
  onSyncedChange,
}: {
  host: HostController;
  session: SessionRow;
  titleKey: string;
  testIdPrefix?: string;
  /** Told whether the picker shows exactly the saved lineup (H1 Start waits for it). */
  onSyncedChange?(synced: boolean): void;
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
  return (
    <div
      className={styles.lineup}
      data-testid={`${testIdPrefix}-picker`}
      data-valid={valid ? 'true' : 'false'}
      data-synced={synced ? 'true' : 'false'}
    >
      <div className={styles.lineupHead}>
        {/* While the lineup is incomplete its label says what's missing, in ink (one label, not two). */}
        {valid ? (
          <span className={styles.label}>{title}</span>
        ) : (
          <span className={styles.lineupStatus} role="status">
            {t('host.lineup.need', { n: formatNumber(ROUNDS_PER_SESSION), count: ROUNDS_PER_SESSION })}
          </span>
        )}
        {error ? (
          <span className={styles.lineupStatus} role="alert">
            {t(error)}
          </span>
        ) : null}
        {/* The other games, as quiet "+ add" buttons on the label line (data-driven: any number
            of registered games; the row scrolls sideways rather than wrap the bar). */}
        <span className={styles.adds}>
          {REGISTERED_GAMES.filter((g) => !picker.includes(g)).map((g) => (
            <button
              key={g}
              type="button"
              className={styles.pickAdd}
              aria-pressed="false"
              disabled={picker.length >= ROUNDS_PER_SESSION}
              onClick={() => setPicker((l) => toggleLineup(l, g, ROUNDS_PER_SESSION))}
              data-testid={`${testIdPrefix}-${g}`}
            >
              <svg className={styles.plus} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 6 V18 M6 12 H18" />
              </svg>
              {t(`game.${g}.name`)}
            </button>
          ))}
        </span>
      </div>
      {/* The picks in order (1 → 2 → 3, tap one to remove it). Every game keeps one button
          `<prefix>-<game>` with aria-pressed = picked: here when picked, on the label line when not. */}
      <div className={styles.picks} role="group" aria-label={title}>
        {Array.from({ length: ROUNDS_PER_SESSION }, (_, i) => {
          const g = picker[i];
          if (g)
            return (
              <span key={g} className={styles.pickItem}>
                {i > 0 ? <Arrow /> : null}
                <button
                  type="button"
                  className={`${styles.pick} ${styles.pickOn}`}
                  aria-pressed="true"
                  onClick={() => setPicker((l) => toggleLineup(l, g, ROUNDS_PER_SESSION))}
                  data-testid={`${testIdPrefix}-${g}`}
                >
                  <span className={styles.ordinal}>{formatNumber(i + 1)}</span>
                  {t(`game.${g}.name`)}
                  <svg className={styles.pickRemove} viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 8 L16 16 M16 8 L8 16" />
                  </svg>
                </button>
              </span>
            );
          return (
            <span key={`empty-${i}`} className={styles.pickItem}>
              {i > 0 ? <Arrow /> : null}
              <span className={styles.pickEmpty} aria-hidden="true">
                {formatNumber(i + 1)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The next session's lineup (H2–H5) as a text button: opens the lineup
 * picker for the pending session; New session then turns it into the lobby
 * with this lineup (ADR-010, AC2.4).
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
        <span className={styles.eyebrow}>{t('host.lineup.next_title')}</span>
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
