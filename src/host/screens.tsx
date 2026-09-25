/**
 * Host screens H1 lobby and H2 round live, v3 "Stage and Rail" (ADR-135,
 * `docs/plans/host-v3.md` §4.2–4.3). H3 is in Intermission.tsx, H4/H5 in
 * Results.tsx. Every screen: brand strip · stage (12 columns, no controls) ·
 * rail (every control, nothing for the room).
 */
import { useEffect, useMemo, useState } from 'react';
import { ROUNDS_PER_SESSION } from '../config';
import { formatNumber, useT } from '../i18n';
import { adminRemovePlayer, adminStartSession, fetchRoundBoard, type PlayerRow } from '../lib/api';
import { displayName, mergeBoard, type RankedRow } from '../lib/boards';
import { replaceEqualDeep } from '../lib/equal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { QrCode } from '../components/QrCode';
import { Trans } from '../components/Trans';
import { useSteppedNow } from '../components/useSteppedNow';
import styles from './host.module.css';
import { BoardTable } from './BoardTable';
import { Bilingual, CornerCode, Framed, HostHeader, LineupPicker, LineupSummary, NextGamesButton, Rail, SettingsMenu } from './common';
import { displayUrl, shortUrl } from './urls';
import { roundTimeLeftSeconds } from './hostLoop';
import { isLineupValid } from './lineup';
import { usePresenceDots } from './presence';
import { REGISTERED_GAMES, type HostController, type HostData } from './useHost';

const JOIN_STEPS = ['host.lobby.step_scan', 'host.lobby.step_code', 'host.lobby.step_name'] as const;

/** Board slots on the projector (plan §4.3): always ten rows, filled from the top. */
const BOARD_SLOTS = 10;

/** A stable empty board while the first query runs (keeps the memoised BoardTable skipped). */
const NO_ROWS: readonly RankedRow[] = [];

/** Placeholder rows under the empty lobby's message (2 columns × 3). */
const EMPTY_ROWS = 6;

/**
 * Splits a translated sentence around its number, so the number can be set
 * large and the words small without changing the text (e2e reads it whole):
 * "12 players" → ["", "12", " players"]. No number in the text (Arabic
 * "لاعبان") → [text, "", ""].
 */
function aroundNumber(text: string, num: string): [string, string, string] {
  const at = text.indexOf(num);
  if (at < 0) return [text, '', ''];
  return [text.slice(0, at), num, text.slice(at + num.length)];
}

// ------------------------------------------------------------------ H1

export function HostLobby({ host, data }: { host: HostController; data: HostData }) {
  const t = useT();
  const { session, players } = data;
  const joined = useMemo(() => players.filter((p) => p.status === 'joined'), [players]);
  // Newest first: a guest who just joined finds their name at the top; a long list scrolls in its area.
  const shown = useMemo(() => [...joined].reverse(), [joined]);
  const [confirmRemove, setConfirmRemove] = useState<PlayerRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Bigger QR" on the rail: the stage shows only the QR (and the code) as large as it fits.
  const [qrBig, setQrBig] = useState(false);
  useEffect(() => {
    if (!qrBig) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQrBig(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [qrBig]);

  // ---- presence dots (ADR-103): re-renders the lobby only when a dot flips
  const dotOf = usePresenceDots(
    joined.map((p) => p.player_id),
    host.presentIds,
  );

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
  const countNum = formatNumber(joined.length);
  const [countBefore, countDigits, countAfter] = aroundNumber(
    t('host.lobby.players', { count: joined.length, n: countNum }),
    countNum,
  );

  return (
    <>
      <HostHeader withLogo />
      {qrBig ? (
        <main className={styles.qrFull} data-testid="host-lobby">
          {/* Clicking the QR also brings it back (as the rail button and Escape do). */}
          <button
            type="button"
            className={styles.qrFullWrap}
            onClick={() => setQrBig(false)}
            aria-label={t('host.lobby.qr_smaller')}
            data-testid="host-qr-full"
          >
            <QrCode value={url} label={t('host.lobby.scan')} />
          </button>
          <div className={styles.qrFullSide}>
            <Bilingual k="host.lobby.code_label" stacked className={styles.eyebrow} />
            <p className={styles.qrFullCode} dir="ltr" data-testid="host-code">
              {session.code}
            </p>
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
          </div>
        </main>
      ) : (
      <main className={`${styles.body} ${styles.lobby}`} data-testid="host-lobby">
        {/* Join block: the code is the one hero; the QR, URL and steps sit under it. */}
        <section className={styles.join} aria-label={t('host.lobby.join_title')}>
          <Bilingual k="host.lobby.code_label" stacked className={styles.eyebrow} />
          <div className={styles.codeRow}>
            <Framed className={styles.codeFrame}>
              <p className={styles.code} dir="ltr" data-testid="host-code">
                {session.code}
              </p>
            </Framed>
          </div>
          <div className={styles.qrRow}>
            <div className={styles.qrWrap}>
              <QrCode value={url} label={t('host.lobby.scan')} />
            </div>
            <div className={styles.joinText}>
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
                    <span>{t(k)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className={styles.playersCol}>
          <p className={styles.count} data-testid="host-player-count">
            {countBefore ? <span className={countDigits ? styles.countWord : styles.countPhrase}>{countBefore}</span> : null}
            {countDigits ? <span className={styles.countNum}>{countDigits}</span> : null}
            {countAfter ? <span className={styles.countWord}>{countAfter}</span> : null}
          </p>
          {joined.length === 0 ? (
            <div className={styles.emptyPlayers}>
              <ul className={styles.players} aria-hidden="true">
                {Array.from({ length: EMPTY_ROWS }, (_, i) => (
                  <li key={i} className={styles.placeholder} />
                ))}
              </ul>
              {/* The message sits on the first two placeholder rows, one line per row. */}
              <div className={styles.emptyOver}>
                <p className={styles.emptyText}>{t('host.lobby.empty')}</p>
                <p className={styles.emptyHint}>{t('host.lobby.empty_hint')}</p>
              </div>
            </div>
          ) : (
            <ul className={`${styles.players} ${styles.playersScroll}`} data-testid="host-players">
              {shown.map((p) => {
                const dot = dotOf(p.player_id);
                const name = displayName(p.name, p.display_suffix);
                return (
                  <li
                    key={p.id}
                    className={`${styles.player} ${dot === 'off' ? styles.playerAway : ''}`}
                    data-testid="host-player"
                    data-presence={dot}
                    data-online={host.presentIds.has(p.player_id) ? 'true' : 'false'}
                    data-name={name}
                  >
                    <span className={`${styles.dot} ${dot === 'on' ? styles.dotOn : styles.dotOff}`} aria-hidden="true" />
                    <span className={styles.playerName}>
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
      )}
      <Rail
        tray
        start={
          <div className={styles.trayWrap} data-testid="host-lineup">
            <LineupPicker
              host={host}
              session={session}
              titleKey="host.lineup.title"
              onSyncedChange={setPickerSynced}
              actions={
                <>
                  <button
                    type="button"
                    className={styles.textButton}
                    aria-pressed={qrBig}
                    onClick={() => setQrBig((b) => !b)}
                    data-testid="host-qr-toggle"
                  >
                    <svg className={styles.gear} viewBox="0 0 24 24" aria-hidden="true">
                      {qrBig ? (
                        <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
                      ) : (
                        <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
                      )}
                    </svg>
                    {t(qrBig ? 'host.lobby.qr_smaller' : 'host.lobby.qr_bigger')}
                  </button>
                  <SettingsMenu />
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={!canStart}
                    onClick={() => void start()}
                    data-testid="host-start"
                  >
                    {t('host.start')}
                  </button>
                </>
              }
              note={
                error ? (
                  <span className={styles.hint} role="alert">
                    {t(error)}
                  </span>
                ) : joined.length === 0 ? (
                  <span className={styles.hint}>{t('host.start_disabled_hint')}</span>
                ) : null
              }
            />
          </div>
        }
      />
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

/**
 * "Time left" on H2, a leaf with its own clock: checked every 250 ms,
 * re-rendered once a second, so the rest of the round screen (board
 * included) doesn't re-render with it. The number is the stat hero; the
 * words of `round.time_left` go on one muted line under it.
 */
function TimeLeft({ startedAt, offset }: { startedAt: string | null; offset: number }) {
  const t = useT();
  const leftAt = (localNow: number) => roundTimeLeftSeconds(startedAt, localNow + offset);
  const left = leftAt(useSteppedNow(leftAt, 250));
  const [before, after] = t('round.time_left').split('{s}');
  const unit = [before, after].map((s) => s?.trim() ?? '').filter(Boolean).join(' ');
  return (
    <p className={styles.timeLeft} data-testid="host-time-left" aria-label={t('round.time_left', { s: formatNumber(left) })}>
      <span className={styles.timeNum} dir="ltr">
        {formatNumber(left)}
      </span>
      <span className={styles.timeUnit}>{unit}</span>
    </p>
  );
}

/** "12/18 finished": a thin live bar, then the numbers at t2 and the word at t1 (text unchanged). */
function Finished({ done, total }: { done: number; total: number }) {
  const t = useT();
  const text = t('host.round.finished');
  const from = text.indexOf('{done}');
  const to = text.indexOf('{total}') + '{total}'.length;
  const nums = text.slice(from, to).replace('{done}', formatNumber(done)).replace('{total}', formatNumber(total));
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className={styles.finished}>
      <span className={styles.bar} aria-hidden="true">
        <span className={styles.barFill} style={{ transform: `scaleX(${ratio})` }} />
      </span>
      <p className={styles.finishedText} data-testid="host-finished">
        {from > 0 ? <span className={styles.finishedWord}>{text.slice(0, from)}</span> : null}
        <span className={styles.finishedNums} dir="ltr">
          {nums}
        </span>
        <span className={styles.finishedWord}>{text.slice(to)}</span>
      </p>
    </div>
  );
}

export function HostRound({ host, data, preview }: { host: HostController; data: HostData; preview?: RoundPreview }) {
  const t = useT();
  const round = data.rounds.find((r) => r.status === 'playing') ?? null;
  const [fetched, setBoard] = useState<RankedRow[] | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);

  // Board: re-queried on every (throttled) score insert or hidden-name change (ADR-112).
  // Scores only: Stop the Clock guesses stay hidden until the intermission reveal.
  const roundId = round?.id ?? null;
  const live = !preview;
  useEffect(() => {
    if (!roundId || !live) return;
    let alive = true;
    void fetchRoundBoard(roundId)
      .then((page) => {
        if (!alive) return;
        // Re-queried on every score and the 3 s safety net: keep the rows when nothing changed.
        const next = mergeBoard(page.top, null, null);
        setBoard((prev) => replaceEqualDeep(prev, next));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roundId, host.scoresVersion, live]);
  const board = preview ? preview.board : fetched;

  const joined = data.players.filter((p) => p.status === 'joined').length;
  const lineup = useMemo(() => [...data.rounds].sort((a, b) => a.round_no - b.round_no).map((r) => r.game), [data.rounds]);

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
        {/* The scorebug: small, fixed; the board is the main event. */}
        <aside className={`${styles.side} ${styles.scorebug}`}>
          <h1 className={styles.titleBlock} data-testid="host-round-title">
            {round ? (
              <>
                <span className={styles.eyebrow}>{t('round.label', { n: round.round_no, total: data.rounds.length })}</span>
                <span className={styles.titleSep}>{' · '}</span>
                <span className={styles.title}>{t(`game.${round.game}.name`)}</span>
              </>
            ) : null}
          </h1>
          <TimeLeft startedAt={round?.started_at ?? null} offset={host.offset ?? 0} />
          <Finished done={host.scoredCount ?? 0} total={joined} />
          {lineup.length > 1 ? (
            <div className={styles.sideSummary}>
              <LineupSummary games={lineup} current={round?.round_no} list />
            </div>
          ) : null}
        </aside>
        <section className={styles.boardArea} aria-label={t('round.board_title')}>
          <BoardTable
            rows={board ?? NO_ROWS}
            slots={BOARD_SLOTS}
            emptyText={board && board.length === 0 ? t('host.round.no_scores_yet') : undefined}
            celebrateLeader
            testId="host-round-board"
          />
        </section>
      </main>
      <Rail start={<NextGamesButton host={host} pending={data.pending} />}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => setConfirmEnd(true)}
          disabled={!round || ending}
          data-testid="host-end-round"
        >
          {t('host.round.force_end')}
        </button>
      </Rail>
      {confirmEnd ? (
        <ConfirmDialog busy={ending} onCancel={() => setConfirmEnd(false)} onConfirm={() => void forceEnd()}>
          {t('host.round.force_end_confirm')}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
