/**
 * Realtime channel and presence helpers (`DATA_MODEL.md` §8, ADR-103, ADR-112).
 *
 * Fan-out rule: phones subscribe only to their own session's `sessions` and
 * `rounds` rows and their own `players` row, and poll leaderboards; only the
 * host subscribes to `players`, `scores` and `hidden_names`. Never add a
 * phone subscription to `scores`.
 *
 * Channels are shared and reference-counted per topic, so React StrictMode's
 * mount → unmount → mount (and two components listening to the same channel)
 * never creates a duplicate channel or tears one down that is still wanted.
 * A topic always implies the same bindings (see the spec builders below).
 */
import type { RealtimeChannel, RealtimeChannelOptions } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR' | 'CONNECTING';

export type ChannelEvent =
  | { type: 'status'; status: ChannelStatus }
  | { type: 'change'; table: string; eventType: string; row: Record<string, unknown> }
  | { type: 'presence'; keys: string[] };

export type ChannelListener = (event: ChannelEvent) => void;
type Emit = (event: ChannelEvent) => void;

export interface ChannelSpec {
  topic: string;
  config?: RealtimeChannelOptions['config'];
  /** Registers the channel's bindings; called once, before subscribe. */
  bind(channel: RealtimeChannel, emit: Emit): void;
  /** Called on every successful (re)join, e.g. to (re)track presence. */
  onSubscribed?(channel: RealtimeChannel): void;
}

interface Shared {
  channel: RealtimeChannel;
  listeners: Set<ChannelListener>;
  refs: number;
  status: ChannelStatus;
  removeTimer: ReturnType<typeof setTimeout> | null;
}

/** Grace period before an unreferenced channel is removed (covers StrictMode remounts). */
const REMOVE_DELAY_MS = 1000;

const shared = new Map<string, Shared>();

/**
 * Subscribes `listener` to the channel described by `spec`, creating and
 * subscribing it on first use. Returns a release function. The listener
 * immediately receives the current status.
 */
export function acquireChannel(spec: ChannelSpec, listener: ChannelListener): () => void {
  let entry = shared.get(spec.topic);
  if (!entry) {
    const channel = supabase.channel(spec.topic, spec.config ? { config: spec.config } : undefined);
    const created: Shared = { channel, listeners: new Set(), refs: 0, status: 'CONNECTING', removeTimer: null };
    const emit: Emit = (event) => {
      for (const l of created.listeners) l(event);
    };
    spec.bind(channel, emit);
    channel.subscribe((status) => {
      created.status = status as ChannelStatus;
      if (status === 'SUBSCRIBED') spec.onSubscribed?.(channel);
      emit({ type: 'status', status: created.status });
    });
    shared.set(spec.topic, created);
    entry = created;
  }
  if (entry.removeTimer) {
    clearTimeout(entry.removeTimer);
    entry.removeTimer = null;
  }
  entry.refs += 1;
  entry.listeners.add(listener);
  listener({ type: 'status', status: entry.status });

  const current = entry;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    current.listeners.delete(listener);
    current.refs -= 1;
    if (current.refs <= 0) {
      current.removeTimer = setTimeout(() => {
        if (current.refs > 0) return;
        shared.delete(spec.topic);
        void supabase.removeChannel(current.channel);
      }, REMOVE_DELAY_MS);
    }
  };
}

function changeEmitter(table: string, emit: Emit) {
  return (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) =>
    emit({
      type: 'change',
      table,
      eventType: payload.eventType,
      row: payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old,
    });
}

/**
 * Phone: `session:<sid>`: own session row, its rounds, own player row only
 * (ADR-112). No scores, no other players.
 */
export function phoneSessionChannel(sessionId: string, playerRowId: string): ChannelSpec {
  return {
    topic: `session:${sessionId}`,
    bind(channel, emit) {
      channel
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
          changeEmitter('sessions', emit),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rounds', filter: `session_id=eq.${sessionId}` },
          changeEmitter('rounds', emit),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${playerRowId}` },
          changeEmitter('players', emit),
        );
    },
  };
}

/** Phone: `presence:<sid>`, keyed by playerId; tracks once per (re)join (ADR-103). */
export function phonePresenceChannel(sessionId: string, playerId: string): ChannelSpec {
  return {
    topic: `presence:${sessionId}`,
    config: { presence: { key: playerId } },
    bind(channel) {
      channel.on('presence', { event: 'sync' }, () => {});
    },
    onSubscribed(channel) {
      void channel.track({ player_id: playerId });
    },
  };
}

/**
 * Host: `session:<sid>`: session, rounds, all players and score inserts of
 * the session, and hidden names (`DATA_MODEL.md` §8).
 */
export function hostSessionChannel(sessionId: string): ChannelSpec {
  return {
    topic: `session:${sessionId}`,
    bind(channel, emit) {
      channel
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
          changeEmitter('sessions', emit),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rounds', filter: `session_id=eq.${sessionId}` },
          changeEmitter('rounds', emit),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
          changeEmitter('players', emit),
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'scores', filter: `session_id=eq.${sessionId}` },
          changeEmitter('scores', emit),
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'hidden_names' }, changeEmitter('hidden_names', emit));
    },
  };
}

/** Host: reads `presence:<sid>` state; emits the present player ids on every sync. */
export function hostPresenceChannel(sessionId: string): ChannelSpec {
  return {
    topic: `presence:${sessionId}`,
    bind(channel, emit) {
      channel.on('presence', { event: 'sync' }, () => {
        emit({ type: 'presence', keys: Object.keys(channel.presenceState()) });
      });
    },
  };
}
