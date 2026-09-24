/**
 * Host screens H1 lobby, H2 round live, H4 results (`SCREENS.md` §2.2).
 * Everything is on the projector scale; host controls are small and grouped
 * in the inline-end bottom corner.
 */
import { useEffect, useMemo, useState } from 'react';
import { BOARD_POLL_MS, ROUNDS_PER_SESSION } from '../config';
import { formatNumber, translate, useLang, useT, type Lang } from '../i18n';
import {
  adminNewSession,
  adminRemovePlayer,
  adminSetLineup,
  adminStartSession,
  fetchRoundBoard,
  fetchSessionBoard,
  fetchSessionRoundScores,
  type PlayerRow,
  type RoundScoreRow,
} from '../lib/api';
import { displayName, mergeBoard, type RankedRow } from '../lib/boards';
import { supabase } from '../lib/supabase';
import type { GameId } from '../games/types';
import logo from '../assets/logo.png';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Leaderboard } from '../components/Leaderboard';
import { QrCode } from '../components/QrCode';
import { Trans } from '../components/Trans';
import ui from '../components/ui.module.css';
import styles from './host.module.css';
import { roundTimeLeftSeconds } from './hostLoop';
import { isLineupValid, sameLineup, toggleLineup } from './lineup';
import { presenceDot, updateLastSeen } from './presence';
import { REGISTERED_GAMES, type HostController, type HostData } from './useHost';

const PRESENCE_TICK_MS = 1000;

function shortUrl(): string {
  return import.meta.env.VITE_PUBLIC_SHORT_URL || window.location.origin;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function CornerControls({ children }: { children?: React.ReactNode }) {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <div className={styles.controls}>
      {children}
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
function Bilingual({ k, params, className }: { k: string; params?: Record<string, string>; className?: string }) {
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

// ------------------------------------------------------------------ H1

export function HostLobby({ host, data }: { host: HostController; data: HostData }) {
  const t = useT();
  const { session, players } = data;
  const joined = useMemo(() => players.filter((p) => p.status === 'joined'), [players]);
  const [confirmRemove, setConfirmRemove] = useState<PlayerRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- presence dots (ADR-103)
  const [now, setNow] = useState(() => Date.now());
  const [lastSeen, setLastSeen] = useState<Map<string, number>>(() => new Map());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), PRESENCE_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  const joinedIds = joined.map((p) => p.player_id).join(',');
  useEffect(() => {
    setLastSeen((prev) => updateLastSeen(prev, host.presentIds, joinedIds ? joinedIds.split(',') : [], Date.now()));
  }, [host.presentIds, joinedIds, now]);

  // ---- lineup picker (ADR-012, ADR-120): registered games only, ROUNDS_PER_SESSION of them
  const [picker, setPicker] = useState<GameId[]>(() => [...session.lineup]);
  const sessionLineup = session.lineup.join(',');
  useEffect(() => {
    setPicker(sessionLineup ? (sessionLineup.split(',') as GameId[]) : []);
  }, [sessionLineup]);
  const lineupValid = isLineupValid(picker, REGISTERED_GAMES, ROUNDS_PER_SESSION);
  const lineupSynced = sameLineup(picker, session.lineup);
  useEffect(() => {
    if (!lineupValid || lineupSynced) return;
    void host.act(() => adminSetLineup(session.id, picker)).catch(() => setError('sys.generic_error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker.join(','), lineupValid, lineupSynced, session.id]);

  const canStart = joined.length >= 1 && lineupValid && lineupSynced && session.status === 'lobby' && !busy;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await host.act(() => adminStartSession(session.id));
    } catch {
      setError('sys.generic_error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: PlayerRow) => {
    setBusy(true);
    try {
      await host.act(() => adminRemovePlayer(p.id));
    } catch {
      setError('sys.generic_error');
    } finally {
      setBusy(false);
      setConfirmRemove(null);
    }
  };

  const url = shortUrl();

  return (
    <>
      <header className={styles.header}>
        <img src={logo} alt={t('app.name')} className={ui.projLogo} />
        <p className={styles.big} data-testid="host-player-count">
          {t('host.lobby.players', { n: formatNumber(joined.length), count: joined.length })}
        </p>
      </header>
      <div className={styles.main} data-testid="host-lobby">
        <div className={styles.joinCol}>
          <QrCode value={url} label={t('host.lobby.scan')} />
          <Bilingual k="host.lobby.scan" className={styles.big} />
          <Bilingual k="host.lobby.or_visit" params={{ url: displayUrl(url) }} className={styles.url} />
        </div>
        <div className={styles.codeCol}>
          <Bilingual k="host.lobby.code_label" className={styles.big} />
          <p className={styles.code} dir="ltr" data-testid="host-code">
            {session.code}
          </p>
        </div>
        <div className={styles.playersCol}>
          {joined.length === 0 ? (
            <p className={`${styles.big} ${styles.muted}`}>{t('host.lobby.empty')}</p>
          ) : (
            <ul className={styles.players} data-testid="host-players">
              {joined.map((p) => {
                const dot = presenceDot(p.player_id, host.presentIds, lastSeen, now);
                const name = displayName(p.name, p.display_suffix);
                return (
                  <li
                    key={p.id}
                    className={`${styles.player} ${dot === 'off' ? styles.playerOff : ''}`}
                    data-testid="host-player"
                    data-presence={dot}
                    data-online={host.presentIds.has(p.player_id) ? 'true' : 'false'}
                    data-name={name}
                  >
                    <span className={`${styles.dot} ${dot === 'on' ? styles.dotOn : styles.dotOff}`} aria-hidden="true" />
                    <bdi>{name}</bdi>
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => setConfirmRemove(p)}
                      aria-label={`${t('host.lobby.remove')} ${name}`}
                      data-testid="host-remove"
                    >
                      <svg className={styles.removeIcon} viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6 L18 18 M18 6 L6 18" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <footer className={styles.footer}>
        <div className={styles.lineup} data-testid="host-lineup">
          <span className={styles.hint}>{t('host.lineup.title', { n: formatNumber(ROUNDS_PER_SESSION) })}</span>
          {REGISTERED_GAMES.map((g) => {
            const idx = picker.indexOf(g);
            return (
              <button
                key={g}
                type="button"
                className={`${styles.gameCard} ${idx >= 0 ? styles.gameCardOn : ''}`}
                aria-pressed={idx >= 0}
                onClick={() => setPicker((l) => toggleLineup(l, g, ROUNDS_PER_SESSION))}
                data-testid={`lineup-${g}`}
              >
                {idx >= 0 ? <span className={styles.gameNo}>{formatNumber(idx + 1)}</span> : null}
                {t(`game.${g}.name`)}
              </button>
            );
          })}
          {!lineupValid ? (
            <span className={styles.hint} role="status">
              {t('host.lineup.need', { n: formatNumber(ROUNDS_PER_SESSION), count: ROUNDS_PER_SESSION })}
            </span>
          ) : null}
        </div>
        <CornerControls>
          {error ? (
            <span className={styles.hint} role="alert">
              {t(error)}
            </span>
          ) : null}
          {joined.length === 0 ? <span className={styles.hint}>{t('host.start_disabled_hint')}</span> : null}
          <button
            type="button"
            className={`${ui.button} ${styles.control}`}
            disabled={!canStart}
            onClick={() => void start()}
            data-testid="host-start"
          >
            {t('host.start')}
          </button>
        </CornerControls>
      </footer>
      {confirmRemove ? (
        <ConfirmDialog busy={busy} onCancel={() => setConfirmRemove(null)} onConfirm={() => void remove(confirmRemove)}>
          <Trans
            k="host.lobby.remove_confirm"
            nodes={{ name: <bdi>{displayName(confirmRemove.name, confirmRemove.display_suffix)}</bdi> }}
          />
        </ConfirmDialog>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ H2

export function HostRound({ host, data }: { host: HostController; data: HostData }) {
  const t = useT();
  const round = data.rounds.find((r) => r.status === 'playing') ?? null;
  const [board, setBoard] = useState<RankedRow[] | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  // Board: re-queried on every (debounced) score insert (ADR-112).
  const roundId = round?.id ?? null;
  useEffect(() => {
    if (!roundId) return;
    let alive = true;
    void fetchRoundBoard(roundId)
      .then((page) => {
        if (alive) setBoard(mergeBoard(page.top, null, null));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roundId, host.scoresVersion]);

  const joined = data.players.filter((p) => p.status === 'joined').length;
  const serverNow = now + (host.offset ?? 0);
  const left = roundTimeLeftSeconds(round?.started_at ?? null, serverNow);

  const forceEnd = async () => {
    setEnding(true);
    try {
      await host.endRound('force_end');
    } catch {
      // state is re-read either way
    } finally {
      setEnding(false);
      setConfirmEnd(false);
    }
  };

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>
          {round
            ? `${t('round.label', { n: round.round_no, total: data.rounds.length })} · ${t(`game.${round.game}.name`)}`
            : null}
        </h1>
        <div className={styles.headerEnd}>
          <p className={styles.timer} data-testid="host-time-left">
            {t('round.time_left', { s: formatNumber(left) })}
          </p>
          <p className={styles.big} data-testid="host-finished">
            {t('host.round.finished', {
              done: formatNumber(host.scoredCount ?? 0),
              total: formatNumber(joined),
            })}
          </p>
        </div>
      </header>
      <div className={styles.main} data-testid="host-round">
        <div className={styles.boardWrap}>
          {board && board.length > 0 ? (
            <Leaderboard rows={board} projector testId="host-round-board" />
          ) : board ? (
            <p className={`${styles.big} ${styles.muted}`}>{t('round.no_scores')}</p>
          ) : null}
        </div>
      </div>
      <footer className={styles.footer}>
        <span />
        <CornerControls>
          <button
            type="button"
            className={`${ui.button} ${styles.control}`}
            onClick={() => setConfirmEnd(true)}
            disabled={!round || ending}
            data-testid="host-end-round"
          >
            {t('host.round.force_end')}
          </button>
        </CornerControls>
      </footer>
      {confirmEnd ? (
        <ConfirmDialog busy={ending} onCancel={() => setConfirmEnd(false)} onConfirm={() => void forceEnd()}>
          {t('host.round.force_end_confirm')}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ H4

export function HostResults({ host, data }: { host: HostController; data: HostData }) {
  const t = useT();
  const { session } = data;
  const [board, setBoard] = useState<RankedRow[] | null>(null);
  const [breakdown, setBreakdown] = useState<RoundScoreRow[]>([]);
  const [busy, setBusy] = useState(false);

  // Late scores (≤ 15 s after the round ended, E22) still arrive: re-query on inserts and every 3 s.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [page, rows] = await Promise.all([fetchSessionBoard(session.id), fetchSessionRoundScores(session.id)]);
        if (!alive) return;
        setBoard(mergeBoard(page.top, null, null));
        setBreakdown(rows);
      } catch {
        // keep last
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), BOARD_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [session.id, host.scoresVersion]);

  const winner = board?.[0] ?? null;
  const newSession = async () => {
    setBusy(true);
    try {
      await host.act(() => adminNewSession());
    } catch {
      // re-read either way
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t('results.title')}</h1>
        <img src={logo} alt={t('app.name')} className={ui.projLogo} />
      </header>
      <div className={styles.main} data-testid="host-results">
        <div className={styles.boardWrap}>
          {winner ? (
            <div className={styles.winner} data-testid="host-winner">
              <span className={styles.winnerLabel}>{t('host.results.winner')}</span>
              <bdi>{displayName(winner.name, winner.displaySuffix)}</bdi>
              <span className={styles.winnerScore}>{formatNumber(winner.value)}</span>
            </div>
          ) : null}
          {board && board.length > 0 ? (
            <Leaderboard rows={board} projector testId="host-session-board" />
          ) : board ? (
            <p className={`${styles.big} ${styles.muted}`}>{t('results.no_scores')}</p>
          ) : null}
          {session.lineup.length > 1 && board && board.length > 0 ? (
            <ul className={styles.hint}>
              {board.map((r) => (
                <li key={r.playerRowId}>
                  <bdi>{displayName(r.name, r.displaySuffix)}</bdi>
                  {': '}
                  {session.lineup
                    .map((g) => {
                      const s = breakdown.find((b) => b.playerRowId === r.playerRowId && b.game === g);
                      return s ? formatNumber(s.score) : t('results.breakdown_missing');
                    })
                    .join(' · ')}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <footer className={styles.footer}>
        <span />
        <CornerControls>
          <button
            type="button"
            className={`${ui.button} ${styles.control}`}
            onClick={() => void newSession()}
            disabled={busy}
            data-testid="host-new-session"
          >
            {t('host.new_session')}
          </button>
        </CornerControls>
      </footer>
    </>
  );
}
