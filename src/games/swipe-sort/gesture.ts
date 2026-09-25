/**
 * Swipe Sort's gesture recogniser: a pure reducer over pointer events.
 * Source of truth: docs/games/swipe-sort.md §3 ("Gesture").
 *
 * `down` starts a drag for one pointer; a `move` registers a swipe the moment
 * |dx| >= 40 px and |dx| > |dy| (the "gesture completion" instant), in the
 * sign of dx. A release before that, a mostly vertical drag or a cancel
 * registers nothing. A second finger is ignored while one is tracked, and a
 * touch that starts in the 24 px edge band (outside the inset surface, where
 * iOS starts its edge-swipe-back) never starts a drag.
 *
 * Directions are PHYSICAL left/right (screen x), never logical start/end: the
 * game geometry is the same in Arabic and English.
 */

/** Horizontal travel that registers a swipe. */
export const SS_SWIPE_PX = 40;

/** Touches starting closer than this to either viewport edge are ignored (= `--swipe-safe-inset`). */
export const SS_EDGE_GUARD_PX = 24;

export type SwipeDirection = 'left' | 'right';

export interface GestureState {
  /** The tracked pointer, or null when idle. */
  pointerId: number | null;
  startX: number;
  startY: number;
}

export const GESTURE_IDLE: GestureState = { pointerId: null, startX: 0, startY: 0 };

export type GestureEvent =
  | { type: 'down'; pointerId: number; x: number; y: number; viewportWidth: number }
  | { type: 'move'; pointerId: number; x: number; y: number }
  | { type: 'up'; pointerId: number }
  | { type: 'cancel'; pointerId: number };

export interface GestureStep {
  state: GestureState;
  /** Set on the one event that registers the swipe; null otherwise. */
  swipe: SwipeDirection | null;
  /** Horizontal offset of the tracked drag (for the follow-the-finger transform); 0 when idle. */
  dx: number;
}

/** True for an x (CSS px) that lies in the edge band of a viewport this wide. */
export function isInEdgeBand(x: number, viewportWidth: number, guard = SS_EDGE_GUARD_PX): boolean {
  return x < guard || x > viewportWidth - guard;
}

export function reduceGesture(state: GestureState, event: GestureEvent): GestureStep {
  switch (event.type) {
    case 'down': {
      // One pointer at a time; an edge-started touch never starts a drag.
      if (state.pointerId !== null || isInEdgeBand(event.x, event.viewportWidth)) {
        return { state, swipe: null, dx: 0 };
      }
      return { state: { pointerId: event.pointerId, startX: event.x, startY: event.y }, swipe: null, dx: 0 };
    }
    case 'move': {
      if (state.pointerId === null || event.pointerId !== state.pointerId) return { state, swipe: null, dx: 0 };
      const dx = event.x - state.startX;
      const dy = event.y - state.startY;
      if (Math.abs(dx) >= SS_SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
        // Registered: the drag is consumed, the rest of this touch does nothing.
        return { state: GESTURE_IDLE, swipe: dx < 0 ? 'left' : 'right', dx };
      }
      return { state, swipe: null, dx };
    }
    case 'up':
    case 'cancel': {
      if (state.pointerId === null || event.pointerId !== state.pointerId) return { state, swipe: null, dx: 0 };
      return { state: GESTURE_IDLE, swipe: null, dx: 0 };
    }
    default:
      return { state, swipe: null, dx: 0 };
  }
}
