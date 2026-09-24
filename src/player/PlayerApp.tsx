/**
 * The player phone app (`SCREENS.md` §1): tab lock → join flow (P1/P2) →
 * member flow (P3–P9) driven by `derivePlayerView` over the synced DB state
 * and the persisted local state (`SESSION_LIFECYCLE.md` §4.1).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { COUNTDOWN_MS, SUBMIT_RETRY_MS } from '../config';
import { LangProvider } from '../i18n';
import { currentUserId, insertScore, setProgressPlaying, type JoinPayload, type PlayerRow } from '../lib/api';
import { clearCurrent, getCurrent, patchCurrent, type CurrentState, type PendingSubmit } from '../lib/storage';
import type { GameResult } from '../games/types';
import { TopBar } from '../components/TopBar';
import { OfflineBanner } from '../components/OfflineBanner';
import { Spinner } from '../components/Spinner';
import styles from './player.module.css';
import { JoinFlow } from './JoinFlow';
import { useNow, usePresence, useSessionSync, useTabLock } from './hooks';
import { derivePlayerView } from './playerFlow';
import { createSubmitter, type SubmitState, type Submitter } from './submitter';
import {
  EndedScreen,
  GameScreen,
  IntroScreen,
  LobbyScreen,
  OtherTabScreen,
  RemovedScreen,
  ResultsScreen,
  RoundResultScreen,
} from './screens';

export function PlayerApp() {
  return (
    <LangProvider>
      <PlayerRoot />
    </LangProvider>
  );
}

function Shell({ showLangToggle, children }: { showLangToggle: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.app}>
      <OfflineBanner />
      <TopBar showLangToggle={showLangToggle} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}

function hasMembership(s: CurrentState | null): s is CurrentState & { sessionId: string; playerRowId: string } {
  return !!s?.sessionId && !!s.playerRowId;
}

function PlayerRoot() {
  const lock = useTabLock();
  const [local, setLocal] = useState<CurrentState | null>(() => getCurrent());

  const leave = useCallback(() => {
    clearCurrent();
    setLocal(null);
  }, []);

  const onJoined = useCallback((p: JoinPayload) => {
    const next = patchCurrent({
      sessionId: p.session_id,
      playerRowId: p.player_row_id,
      name: p.name,
      displaySuffix: p.display_suffix,
      roundId: null,
      game: null,
      roundStartEpoch: null,
      seed: null,
      gameSnapshot: null,
      pendingSubmit: null,
      submittedRounds: [],
      lastResult: null,
      saveFailedRound: null,
    });
    setLocal(next);
  }, []);

  if (lock === 'pending') {
    return (
      <Shell showLangToggle={false}>
        <Spinner />
      </Shell>
    );
  }
  if (lock === 'denied') {
    return (
      <Shell showLangToggle={false}>
        <OtherTabScreen />
      </Shell>
    );
  }
  if (!hasMembership(local)) {
    return (
      <Shell showLangToggle>
        <JoinFlow onJoined={onJoined} />
      </Shell>
    );
  }
  return (
    <MemberFlow
      key={`${local.sessionId}:${local.playerRowId}`}
      sessionId={local.sessionId}
      playerRowId={local.playerRowId}
      local={local}
      setLocal={setLocal}
      onLeave={leave}
    />
  );
}

function MemberFlow({
  sessionId,
  playerRowId,
  local,
  setLocal,
  onLeave,
}: {
  sessionId: string;
  playerRowId: string;
  local: CurrentState;
  setLocal(next: CurrentState): void;
  onLeave(): void;
}) {
  const sync = useSessionSync(sessionId, playerRowId);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void currentUserId().then((id) => {
      if (!alive) return;
      if (!id) onLeave(); // storage cleared: the membership can't be used any more
      else setUid(id);
    });
    return () => {
      alive = false;
    };
  }, [onLeave]);

  useEffect(() => {
    if (sync.notMember) onLeave();
  }, [sync.notMember, onLeave]);

  const update = useCallback(
    (fn: (cur: CurrentState) => Partial<CurrentState>) => {
      const cur = getCurrent() ?? local;
      setLocal(patchCurrent(fn(cur)));
    },
    [local, setLocal],
  );

  // ---- clock for the countdown / local cap
  const inRound = local.roundId !== null && !local.submittedRounds.includes(local.roundId);
  const now = useNow(250, inRound || sync.session?.status === 'playing');

  const view = derivePlayerView({ local, session: sync.session, rounds: sync.rounds, me: sync.me, now });

  // ---- presence: tracked while this phone is a joined member of a live session
  const sessionLive = !!sync.session && sync.session.status !== 'closed' && sync.me?.status === 'joined';
  usePresence(sessionId, uid, sessionLive);

  // ---- begin a round: persist its local state, then mark progress (SESSION_LIFECYCLE §5)
  const beginRoundId = view.screen === 'intro' && view.begin ? view.round.id : null;
  useEffect(() => {
    if (!beginRoundId || view.screen !== 'intro') return;
    const round = view.round;
    update(() => ({
      roundId: round.id,
      game: round.game,
      roundStartEpoch: Date.now() + COUNTDOWN_MS,
      seed: `${round.id}:${playerRowId}`,
      gameSnapshot: null,
    }));
    void setProgressPlaying(playerRowId, round.round_no).catch(() => {
      // Advisory only (host's x/y finished); the score insert is what counts.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginRoundId]);

  // ---- submission with retry (E14)
  const submitterRef = useRef<Submitter | null>(null);
  const uidRef = useRef(uid);
  uidRef.current = uid;
  useEffect(() => {
    const submitter = createSubmitter({
      retryMs: SUBMIT_RETRY_MS,
      send: async (p) => {
        const playerId = uidRef.current ?? (await currentUserId());
        if (!playerId) throw Object.assign(new Error('no session'), { mapped: { kind: 'network' } });
        await insertScore({ roundId: p.roundId, playerId, score: p.score, durationMs: p.durationMs, raw: p.raw });
      },
      onState: (state, p) => {
        if (state === 'saved') {
          const cur = getCurrent();
          if (!cur) return;
          setLocal(
            patchCurrent({
              pendingSubmit: null,
              lastResult: p,
              submittedRounds: cur.submittedRounds.includes(p.roundId)
                ? cur.submittedRounds
                : [...cur.submittedRounds, p.roundId],
            }),
          );
        } else if (state === 'failed') {
          setLocal(patchCurrent({ pendingSubmit: null, lastResult: p, saveFailedRound: p.roundId }));
        }
      },
    });
    submitterRef.current = submitter;
    return () => submitter.cancel();
  }, [setLocal]);

  const pendingRoundId = local.pendingSubmit?.roundId ?? null;
  useEffect(() => {
    const pending = getCurrent()?.pendingSubmit;
    if (pending && submitterRef.current) submitterRef.current.submit(pending);
  }, [pendingRoundId]);

  const onGameFinish = useCallback(
    (roundId: string) => (result: GameResult) => {
      const payload: PendingSubmit = {
        roundId,
        score: result.score,
        durationMs: Math.max(0, Math.round(result.durationMs)),
        raw: result.raw,
      };
      update(() => ({ pendingSubmit: payload, lastResult: payload }));
    },
    [update],
  );

  const onProgress = useCallback((snapshot: unknown) => {
    // Persist only; the game keeps its own state in memory (no re-render needed).
    patchCurrent({ gameSnapshot: snapshot });
  }, []);

  const onPlayersPolled = useCallback(
    (players: PlayerRow[]) => {
      const own = players.find((p) => p.id === playerRowId);
      if (own && own.status !== sync.me?.status) sync.refresh();
    },
    [playerRowId, sync],
  );

  const roundScreen = view.screen === 'intro' || view.screen === 'game' ||
    (view.screen === 'round_result' && view.round?.status === 'playing');

  let body: React.ReactNode;
  switch (view.screen) {
    case 'loading':
      body = <Spinner />;
      break;
    case 'removed':
      body = <RemovedScreen onCta={onLeave} />;
      break;
    case 'lobby':
      body = sync.session && sync.me ? (
        <LobbyScreen session={sync.session} me={sync.me} pending={view.pending} onPoll={onPlayersPolled} />
      ) : null;
      break;
    case 'intro':
      body = (
        <IntroScreen
          round={view.round}
          roundStartEpoch={view.begin ? null : local.roundStartEpoch}
          totalRounds={Math.max(sync.rounds.length, 1)}
        />
      );
      break;
    case 'game':
      body = (
        <GameScreen
          key={view.round.id}
          round={view.round}
          seed={String(local.seed ?? `${view.round.id}:${playerRowId}`)}
          roundStartEpoch={local.roundStartEpoch ?? Date.now()}
          roundEnded={view.roundEnded}
          onProgress={onProgress}
          onFinish={onGameFinish(view.round.id)}
        />
      );
      break;
    case 'round_result': {
      const result =
        view.round && local.lastResult?.roundId === view.round.id
          ? local.lastResult
          : view.round && local.pendingSubmit?.roundId === view.round.id
            ? local.pendingSubmit
            : null;
      const state: SubmitState | null = !view.round
        ? null
        : local.saveFailedRound === view.round.id
          ? 'failed'
          : local.pendingSubmit?.roundId === view.round.id
            ? 'saving'
            : result
              ? 'saved'
              : null;
      body = sync.session ? (
        <RoundResultScreen
          session={sync.session}
          round={view.round}
          playerRowId={playerRowId}
          result={result}
          submitState={state}
        />
      ) : null;
      break;
    }
    case 'results':
      body = sync.session ? (
        <ResultsScreen session={sync.session} playerRowId={playerRowId} onJoinNext={onLeave} />
      ) : null;
      break;
    case 'ended':
      body = <EndedScreen onJoinNext={onLeave} />;
      break;
  }

  return <Shell showLangToggle={!roundScreen}>{body}</Shell>;
}
