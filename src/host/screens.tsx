/**
 * Host screens H1 lobby and H2 round live (`SCREENS.md` §2.2). H3 is in
 * Intermission.tsx, H4/H5 in Results.tsx. Layout per DESIGN_SYSTEM §0.2:
 * header strip, a 12-column body, and the operator bar at the bottom.
 */
import { useEffect, useMemo, useState } from 'react';
import { ROUNDS_PER_SESSION } from '../config';
import { formatNumber, useT } from '../i18n';
import { adminRemovePlayer, adminStartSession, fetchRoundBoard, type PlayerRow } from '../lib/api';
import { displayName, mergeBoard, type RankedRow } from '../lib/boards';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { QrCode } from '../components/QrCode';
import { useRevealRows } from '../components/useRevealRows';
import { Trans } from '../components/Trans';
import styles from './host.module.css';
import { BoardTable } from './BoardTable';
import { Bilingual, CornerCode, Framed, HostHeader, LineupPicker, LineupSummary, NextGamesButton, OperatorBar } from './common';
import { displayUrl, shortUrl } from './urls';
import { roundTimeLeftSeconds } from './hostLoop';
import { isLineupValid } from './lineup';
import { presenceDot, updateLastSeen } from './presence';
import { REGISTERED_GAMES, type HostController, type HostData } from './useHost';

const PRESENCE_TICK_MS = 1000;
const EMPTY_SLOTS = 6;
const JOIN_STEPS = ['host.lobby.step_scan', 'host.lobby.step_code', 'host.lobby.step_name'] as const;

// ------------------------------------------------------------------ H1

export function HostLobby({ host, data }: { host: HostController; data: HostData }) {
  const t = useT();
  const { session, players } = data;
  const joined = useMemo(() => players.filter((p) => p.status === 'joined'), [players]);
  // Newest first: a guest who just joined finds their name at the top; a long list scrolls in its panel.
  const shown = useMemo(() => [...joined].reverse(), [joined]);
  // Name tags shatter in as they join (SCREENS H1, DESIGN_SYSTEM §6.2).
  const chipsRef = useRevealRows<HTMLUListElement>(shown.map((p) => p.id));
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
      <HostHeader withLogo />
      <main className={`${styles.body} ${styles.lobby}`} data-testid="host-lobby">
        <section className={styles.join} aria-label={t('host.lobby.join_title')}>
          <div className={styles.qrWrap}>
            <QrCode value={url} label={t('host.lobby.scan')} />
          </div>
          <p className={styles.url}>
            <Trans
              k="host.lobby.or_visit"
              nodes={{
                url: (
                  <span dir="ltr" className={styles.urlText}>
                    {displayUrl(url)}
                  </span>
                ),
              }}
            />
          </p>
          <ol className={styles.steps}>
            {JOIN_STEPS.map((k, i) => (
              <li key={k} className={styles.step}>
                <span className={styles.stepNo}>{formatNumber(i + 1)}</span>
                <Bilingual k={k} />
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.codeHero}>
          <Bilingual k="host.lobby.code_label" className={styles.eyebrow} />
          <Framed>
            <p className={styles.code} dir="ltr" data-testid="host-code">
              {session.code}
            </p>
          </Framed>
        </section>

        <section className={`${styles.panel} ${styles.playersPanel}`}>
          <p className={styles.count} data-testid="host-player-count">
            <Trans
              k="host.lobby.players"
              params={{ count: joined.length }}
              nodes={{ n: <span className={styles.countNum}>{formatNumber(joined.length)}</span> }}
            />
          </p>
          {joined.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.tags} aria-hidden="true">
                {Array.from({ length: EMPTY_SLOTS }, (_, i) => (
                  <span key={i} className={styles.slot} />
                ))}
              </div>
              <p className={styles.emptyText}>{t('host.lobby.empty')}</p>
              <p className={styles.eyebrow}>{t('host.start_disabled_hint')}</p>
            </div>
          ) : (
            <ul ref={chipsRef} className={`${styles.tags} ${styles.tagList}`} data-testid="host-players">
              {shown.map((p) => {
                const dot = presenceDot(p.player_id, host.presentIds, lastSeen, now);
                const name = displayName(p.name, p.display_suffix);
                return (
                  <li
                    key={p.id}
                    className={`${styles.tag} ${dot === 'off' ? styles.tagOff : ''}`}
                    data-testid="host-player"
                    data-presence={dot}
                    data-online={host.presentIds.has(p.player_id) ? 'true' : 'false'}
                    data-name={name}
                    data-reveal-key={p.id}
                  >
                    <span className={`${styles.dot} ${dot === 'on' ? styles.dotOn : styles.dotOff}`} aria-hidden="true" />
                    <span className={styles.tagName}>
                      <bdi>{name}</bdi>
                    </span>
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => setConfirmRemove(p)}
                      aria-label={`${t('host.lobby.remove')} ${name}`}
                      data-testid="host-remove"
                    >
                      <svg className={styles.removeIcon} viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 7 L17 17 M17 7 L7 17" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      <OperatorBar
        start={
          <div data-testid="host-lineup">
            <LineupPicker host={host} session={session} titleKey="host.lineup.title" onSyncedChange={setPickerSynced} />
          </div>
        }
      >
        <div className={styles.actionWithHint}>
          {error ? (
            <span className={styles.eyebrow} role="alert">
              {t(error)}
            </span>
          ) : null}
          <button
            type="button"
            className={styles.primary}
            disabled={!canStart}
            onClick={() => void start()}
            data-testid="host-start"
          >
            {t('host.start')}
          </button>
        </div>
      </OperatorBar>
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

/** Dev preview only: a fixed board instead of the database query. */
export interface RoundPreview {
  board: RankedRow[] | null;
}

export function HostRound({ host, data, preview }: { host: HostController; data: HostData; preview?: RoundPreview }) {
  const t = useT();
  const round = data.rounds.find((r) => r.status === 'playing') ?? null;
  const [fetched, setBoard] = useState<RankedRow[] | null>(null);
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
  const live = !preview;
  useEffect(() => {
    if (!roundId || !live) return;
    let alive = true;
    void fetchRoundBoard(roundId)
      .then((page) => {
        if (alive) setBoard(mergeBoard(page.top, null, null));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roundId, host.scoresVersion, live]);
  const board = preview ? preview.board : fetched;

  const joined = data.players.filter((p) => p.status === 'joined').length;
  const serverNow = now + (host.offset ?? 0);
  const left = roundTimeLeftSeconds(round?.started_at ?? null, serverNow);
  const lineup = [...data.rounds].sort((a, b) => a.round_no - b.round_no).map((r) => r.game);

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
      <HostHeader withLogo={false} end={<CornerCode pending={data.pending} joined={data.pendingPlayers} />} />
      <main
        className={`${styles.body} ${styles.split}`}
        data-testid="host-round"
        data-round={round?.round_no}
        data-game={round?.game}
      >
        <aside className={styles.side}>
          <h1 className={styles.titleBlock} data-testid="host-round-title">
            {round ? (
              <>
                <span className={styles.eyebrow}>{t('round.label', { n: round.round_no, total: data.rounds.length })}</span>
                <span className={styles.titleSep}>{' · '}</span>
                <span className={styles.title}>{t(`game.${round.game}.name`)}</span>
              </>
            ) : null}
          </h1>
          <div className={styles.stats}>
            <p className={styles.stat} data-testid="host-time-left">
              <Trans k="round.time_left" nodes={{ s: <span className={styles.statNum}>{formatNumber(left)}</span> }} />
            </p>
            <p className={styles.stat} data-testid="host-finished">
              <Trans
                k="host.round.finished"
                nodes={{
                  done: <span className={styles.statNum}>{formatNumber(host.scoredCount ?? 0)}</span>,
                  total: <span className={styles.statNum}>{formatNumber(joined)}</span>,
                }}
              />
            </p>
          </div>
          {lineup.length > 1 ? <LineupSummary games={lineup} current={round?.round_no} /> : null}
        </aside>
        <section className={styles.boardArea} aria-label={t('round.board_title')}>
          {board && board.length > 0 ? (
            // New #1 → celebrate shatter on that row (SCREENS H2).
            <BoardTable rows={board} celebrateLeader testId="host-round-board" />
          ) : board ? (
            <p className={styles.emptyBoard}>{t('host.round.no_scores_yet')}</p>
          ) : null}
        </section>
      </main>
      <OperatorBar start={<NextGamesButton host={host} pending={data.pending} />}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => setConfirmEnd(true)}
          disabled={!round || ending}
          data-testid="host-end-round"
        >
          {t('host.round.force_end')}
        </button>
      </OperatorBar>
      {confirmEnd ? (
        <ConfirmDialog busy={ending} onCancel={() => setConfirmEnd(false)} onConfirm={() => void forceEnd()}>
          {t('host.round.force_end_confirm')}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
