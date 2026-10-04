// Assumes Angular 20.1 or later.
import {
  DestroyRef,
  PendingTasks,
  assertInInjectionContext,
  inject,
  untracked,
} from "@angular/core";

interface PendingTask {
  /** Holds at most one task while `pending` is true, e.g. for a store's pending state. */
  set(pending: boolean): void;
  /** Holds a task until `fn` settles; resolves or rejects like `fn` (a sync throw rejects). */
  run<T>(fn: () => T | PromiseLike<T>): Promise<T>;
}

/** Owns pending tasks for the injection context; the caller decides which work should block stability. */
export function injectPendingTask(): PendingTask {
  if (typeof ngDevMode === "undefined" || ngDevMode) {
    assertInInjectionContext(injectPendingTask);
  }
  const owner = inject(DestroyRef);
  const pendingTasks = inject(PendingTasks);
  let release: (() => void) | undefined;

  // This can be called from an effect without tracking incidental service reads.
  const set = (pending: boolean) =>
    untracked(() => {
      if (pending) {
        if (!release && !owner.destroyed) release = pendingTasks.add();
        return;
      }
      const cleanup = release;
      release = undefined;
      cleanup?.();
    });

  owner.onDestroy(() => set(false));

  return {
    set,
    async run<T>(fn: () => T | PromiseLike<T>): Promise<T> {
      // onDestroy throws on a destroyed owner; the work still runs, with no task to own.
      if (owner.destroyed) return untracked(fn);
      const releaseRun = pendingTasks.add();
      const unregister = owner.onDestroy(releaseRun);
      try {
        return await untracked(fn);
      } finally {
        unregister();
        releaseRun();
      }
    },
  };
}
