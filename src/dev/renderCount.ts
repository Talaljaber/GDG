/**
 * Dev-only render counter (`TESTING.md` §9 "Render budget"). Counts, per
 * component name, how many times React actually ran a component's render in
 * a committed update, for every component in the app, without touching any
 * component: it listens to React's DevTools hook (`onCommitFiberRoot`) and
 * walks the committed tree.
 *
 * A component counts once per commit in which its render ran (the fiber's
 * PerformedWork flag is set and it is a new fiber object at that spot; a
 * subtree React skipped keeps last commit's fiber objects). StrictMode's
 * second render in dev is never committed separately, so it isn't counted.
 *
 * Use from a browser console or a Playwright script:
 *   window.__gdgRenders.reset();  …;  window.__gdgRenders.snapshot()
 *
 * Production: `import.meta.env.DEV` is false, so the whole body is dropped
 * and the module is empty (checked by grepping the build for `__gdgRenders`).
 * It must be imported before react-dom (first import in main.tsx), so the
 * hook is patched before React reads it.
 */

interface Fiber {
  tag: number;
  flags: number;
  type: unknown;
  child: Fiber | null;
  sibling: Fiber | null;
}

interface DevtoolsHook {
  onCommitFiberRoot?: (id: unknown, root: { current: Fiber }, ...rest: unknown[]) => unknown;
  [key: string]: unknown;
}

export interface RenderCounter {
  /** Renders per component name since the last reset. */
  snapshot(): Record<string, number>;
  /** Committed updates since the last reset. */
  commits(): number;
  reset(): void;
}

declare global {
  interface Window {
    __gdgRenders?: RenderCounter;
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook;
  }
}

// React fiber tags / flags (react-reconciler, React 18).
const FUNCTION = 0;
const CLASS = 1;
const FORWARD_REF = 11;
const SIMPLE_MEMO = 15;
const PERFORMED_WORK = 1;

function nameOf(fiber: Fiber): string | null {
  const type = fiber.type as { displayName?: string; name?: string; render?: { displayName?: string; name?: string } } | null;
  if (!type) return null;
  if (fiber.tag === FORWARD_REF) return type.displayName || type.render?.displayName || type.render?.name || 'ForwardRef';
  return type.displayName || type.name || 'Anonymous';
}

function install(): void {
  const counts = new Map<string, number>();
  let commits = 0;
  let previous = new WeakSet<Fiber>();

  const onCommit = (root: { current: Fiber }) => {
    commits += 1;
    const seen = new WeakSet<Fiber>();
    const stack: Fiber[] = root.current ? [root.current] : [];
    while (stack.length > 0) {
      const fiber = stack.pop() as Fiber;
      const { tag } = fiber;
      if (tag === FUNCTION || tag === CLASS || tag === FORWARD_REF || tag === SIMPLE_MEMO) {
        seen.add(fiber);
        if ((fiber.flags & PERFORMED_WORK) !== 0 && !previous.has(fiber)) {
          const name = nameOf(fiber);
          if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    previous = seen;
  };

  // The React Refresh preamble (dev) has already created the hook; wrap it, or create a minimal one.
  const hook: DevtoolsHook =
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ??
    (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map(),
      supportsFiber: true,
      inject: () => 1,
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    });
  const original = hook.onCommitFiberRoot;
  hook.onCommitFiberRoot = function (this: unknown, id, root, ...rest) {
    try {
      onCommit(root);
    } catch {
      // never break the app for a dev counter
    }
    return original?.call(this, id, root, ...rest);
  };

  window.__gdgRenders = {
    snapshot: () => Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1])),
    commits: () => commits,
    reset: () => {
      counts.clear();
      commits = 0;
    },
  };
}

if (import.meta.env.DEV && typeof window !== 'undefined') install();
