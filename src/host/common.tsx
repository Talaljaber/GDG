/**
 * Pieces shared by the host screens (`SCREENS.md` §2.2): the host controls
 * in the inline-end bottom corner, the bilingual join strings, the pending
 * session's corner code (H2–H5, ADR-015) and the lineup picker (H1, and the
 * "next games" picker for the pending session during play, ADR-009/E20).
 */
import { useEffect, useState } from 'react';
import { ROUNDS_PER_SESSION } from '../config';
import { formatNumber, translate, useLang, useT, type Lang } from '../i18n';
import { adminSetLineup, type SessionRow } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { GameId } from '../games/types';
import { Trans } from '../components/Trans';
import ui from '../components/ui.module.css';
import styles from './host.module.css';
import { isLineupValid, sameLineup, toggleLineup } from './lineup';
import { REGISTERED_GAMES, type HostController } from './useHost';
import { useHostMotion } from './motionContext';

export function CornerControls({ children }: { children?: React.ReactNode }) {
  const t = useT();
  const { lang, setLang } = useLang();
  const motion = useHostMotion();
  return (
    <div className={styles.controls}>
      {children}
      <button
        type="button"
        className={`${ui.button} ${ui.buttonSecondary} ${styles.control}`}
        aria-pressed={motion.reducedMotion}
        onClick={() => motion.setReducedMotion(!motion.reducedMotion)}
        data-testid="host-reduced-motion"
      >
        {t('host.settings.reduced_motion')}
      </button>
      <button
        type="button"
        className={`${ui.button} ${ui.buttonSecondary} ${styles.control}`}
        lang={lang === 'en' ? 'ar' : 'en'}
        onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
      >
        {t('common.lang_toggle')}
      </button>
      <button
        type="button"
        className={`${ui.button} ${ui.buttonSecondary} ${styles.control}`}
        onClick={() => void supabase.auth.signOut()}
      >
        {t('host.signout')}
      </button>
    </div>
  );
}

/** A host join string in both languages at once (SCREENS H1): the audience is mixed. */
export function Bilingual({ k, params, className }: { k: string; params?: Record<string, string>; className?: string }) {
  const langs: Lang[] = ['ar', 'en'];
  return (
    <div className={styles.bilingual}>
      {langs.map((l) => (
        <p key={l} lang={l} dir={l === 'ar' ? 'rtl' : 'ltr'} className={className}>
          {translate(l, k, params)}
        </p>
      ))}
    </div>
  );
}

/**
 * The pending session's code, small in the inline-start bottom corner while a
 * session runs (ADR-015): latecomers type it and land in P3b.
 */
export function CornerCode({ pending, joined }: { pending: SessionRow | null; joined: number }) {
  const t = useT();
  if (!pending) return <span />;
  return (
    <div className={styles.corner} data-testid="host-corner" data-count={joined}>
      <p className={styles.cornerCode}>
        <Trans
          k="host.corner.next_code"
          nodes={{
            code: (
              <span dir="ltr" data-testid="host-corner-code" className={styles.cornerDigits}>
                {pending.code}
              </span>
            ),
          }}
        />
      </p>
      <p className={styles.hint}>{t('host.corner.late')}</p>
    </div>
  );
}

/**
 * Game cards: tap to add in order (① ② ③), tap again to remove, at most
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

  return (
    <div
      className={styles.lineup}
      data-testid={`${testIdPrefix}-picker`}
      data-valid={valid ? 'true' : 'false'}
      data-synced={synced ? 'true' : 'false'}
    >
      <span className={styles.hint}>{t(titleKey, { n: formatNumber(ROUNDS_PER_SESSION) })}</span>
      {REGISTERED_GAMES.map((g) => {
        const idx = picker.indexOf(g);
        return (
          <button
            key={g}
            type="button"
            className={`${styles.gameCard} ${idx >= 0 ? styles.gameCardOn : ''}`}
            aria-pressed={idx >= 0}
            onClick={() => setPicker((l) => toggleLineup(l, g, ROUNDS_PER_SESSION))}
            data-testid={`${testIdPrefix}-${g}`}
          >
            {idx >= 0 ? <span className={styles.gameNo}>{formatNumber(idx + 1)}</span> : null}
            {t(`game.${g}.name`)}
          </button>
        );
      })}
      {!valid ? (
        <span className={styles.hint} role="status">
          {t('host.lineup.need', { n: formatNumber(ROUNDS_PER_SESSION), count: ROUNDS_PER_SESSION })}
        </span>
      ) : null}
      {error ? (
        <span className={styles.hint} role="alert">
          {t(error)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * "next games ▾" (H2–H5): opens the lineup picker for the pending session;
 * New session then turns it into the lobby with this lineup (ADR-010, AC2.4).
 */
export function NextGamesButton({ host, pending }: { host: HostController; pending: SessionRow | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!pending) return null;
  return (
    <>
      <button
        type="button"
        className={`${ui.button} ${ui.buttonSecondary} ${styles.control}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="host-next-games"
      >
        {t('host.lineup.next_title')}
      </button>
      {open ? (
        <div className={styles.popover} role="dialog" aria-label={t('host.lineup.next_title')} data-testid="next-games-dialog">
          <LineupPicker host={host} session={pending} titleKey="host.lineup.title" testIdPrefix="next-lineup" />
          <button
            type="button"
            className={`${ui.button} ${styles.control}`}
            onClick={() => setOpen(false)}
            data-testid="next-games-done"
          >
            {t('common.done')}
          </button>
        </div>
      ) : null}
    </>
  );
}
