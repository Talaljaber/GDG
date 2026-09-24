/**
 * Host screens H1 lobby and H2 round live (`SCREENS.md` §2.2). H3 is in
 * Intermission.tsx, H4/H5 in Results.tsx. Everything is on the projector
 * scale; host controls are small and grouped in the inline-end bottom corner.
 */
import { useEffect, useMemo, useState } from 'react';
import { ROUNDS_PER_SESSION } from '../config';
import { formatNumber, useT } from '../i18n';
import { adminRemovePlayer, adminStartSession, fetchRoundBoard, type PlayerRow } from '../lib/api';
import { displayName, mergeBoard, type RankedRow } from '../lib/boards';
import logo from '../assets/logo.png';
import { SHATTER_LOGO_CLASS } from '../effects/shatter';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Leaderboard } from '../components/Leaderboard';
import { QrCode } from '../components/QrCode';
import { useRevealRows } from '../components/useRevealRows';
import { Trans } from '../components/Trans';
import ui from '../components/ui.module.css';
import styles from './host.module.css';
import { Bilingual, CornerCode, CornerControls, LineupPicker, NextGamesButton } from './common';
import { displayUrl, shortUrl } from './urls';
import { roundTimeLeftSeconds } from './hostLoop';
import { isLineupValid } from './lineup';
import { presenceDot, updateLastSeen } from './presence';
import { REGISTERED_GAMES, type HostController, type HostData } from './useHost';

const PRESENCE_TICK_MS = 1000;

// ------------------------------------------------------------------ H1

export function HostLobby({ host, data }: { host: HostController; data: HostData }) {
  const t = useT();
  const { session, players } = data;
  const joined = useMemo(() => players.filter((p) => p.status === 'joined'), [players]);
  // Player chips shatter in as they join (SCREENS H1, DESIGN_SYSTEM §6.2).
  const chipsRef = useRevealRows<HTMLUListElement>(joined.map((p) => p.id));
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

  // Start needs the saved lineup to be valid (the picker saves valid picks at once).
  const [pickerSynced, setPickerSynced] = useState(true);
  const lineupValid = isLineupValid(session.lineup, REGISTERED_GAMES, ROUNDS_PER_SESSION);
  const canStart = joined.length >= 1 && lineupValid && pickerSynced && session.status === 'lobby' && !busy;

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
        <img src={logo} alt={t('app.name')} className={`${ui.projLogo} ${SHATTER_LOGO_CLASS}`} data-testid="logo" />
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
            <ul ref={chipsRef} className={styles.players} data-testid="host-players">
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
                    data-reveal-key={p.id}
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
        <div data-testid="host-lineup">
          <LineupPicker host={host} session={session} titleKey="host.lineup.title" onSyncedChange={setPickerSynced} />
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

  // Board: re-queried on every (throttled) score insert or hidden-name change (ADR-112).
  // Scores only: Stop the Clock guesses stay hidden until the intermission reveal.
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
        <h1 className={styles.heading} data-testid="host-round-title">
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
      <div className={styles.main} data-testid="host-round" data-round={round?.round_no} data-game={round?.game}>
        <div className={styles.boardWrap}>
          <h2 className={styles.subheading}>{t('round.board_title')}</h2>
          {board && board.length > 0 ? (
            // New #1 → celebrate shatter on that row (SCREENS H2).
            <Leaderboard rows={board} projector celebrateLeader testId="host-round-board" />
          ) : board ? (
            <p className={`${styles.big} ${styles.muted}`}>{t('round.no_scores')}</p>
          ) : null}
        </div>
      </div>
      <footer className={styles.footer}>
        <CornerCode pending={data.pending} joined={data.pendingPlayers} />
        <CornerControls>
          <NextGamesButton host={host} pending={data.pending} />
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
