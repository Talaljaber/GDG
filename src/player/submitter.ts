/**
 * Score submission with retry and idempotency (`SESSION_LIFECYCLE.md` §1,
 * §6 E14; ADR-019). The payload is persisted as `pendingSubmit` before the
 * first attempt (by the caller); this module retries every SUBMIT_RETRY_MS
 * until the server acknowledges it. A 23505 unique violation means the score
 * is already stored and counts as success. Permanent refusals (round closed
 * more than 15 s ago, impossible score, not a member) stop the retries.
 */
import type { ErrorKind } from '../lib/errors';
import type { PendingSubmit } from '../lib/storage';

export type SubmitState = 'saving' | 'saved' | 'failed';

export type SubmitDecision = 'saved' | 'failed' | 'retry';

/** What to do after a failed insert, by mapped error kind. */
export function classifySubmitError(kind: ErrorKind): SubmitDecision {
  switch (kind) {
    case 'already_saved':
      return 'saved';
    case 'round_closed':
    case 'impossible_score':
    case 'not_in_session':
      return 'failed';
    default:
      return 'retry';
  }
}

export interface SubmitterDeps {
  /** Performs one insert; rejects with an error carrying `mapped.kind` (ApiError). */
  send(payload: PendingSubmit): Promise<void>;
  /** Reports every state change; `failed` carries the error kind. */
  onState(state: SubmitState, payload: PendingSubmit, kind?: ErrorKind): void;
  retryMs: number;
  /** Timer injection for tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface Submitter {
  /** Starts (or restarts) submitting `payload`. Any previous payload is abandoned. */
  submit(payload: PendingSubmit): void;
  /** Stops retrying (e.g. unmount). */
  cancel(): void;
}

function kindOf(err: unknown): ErrorKind {
  const mapped = (err as { mapped?: { kind?: ErrorKind } } | null)?.mapped;
  return mapped?.kind ?? 'unknown';
}

export function createSubmitter(deps: SubmitterDeps): Submitter {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let generation = 0;
  let timer: unknown = null;

  const stop = () => {
    generation += 1;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const attempt = (payload: PendingSubmit, gen: number) => {
    timer = null;
    deps.send(payload).then(
      () => {
        if (gen !== generation) return;
        deps.onState('saved', payload);
      },
      (err: unknown) => {
        if (gen !== generation) return;
        const kind = kindOf(err);
        const decision = classifySubmitError(kind);
        if (decision === 'saved') {
          deps.onState('saved', payload);
        } else if (decision === 'failed') {
          deps.onState('failed', payload, kind);
        } else {
          timer = setTimer(() => attempt(payload, gen), deps.retryMs);
        }
      },
    );
  };

  return {
    submit(payload) {
      stop();
      const gen = generation;
      deps.onState('saving', payload);
      attempt(payload, gen);
    },
    cancel: stop,
  };
}
