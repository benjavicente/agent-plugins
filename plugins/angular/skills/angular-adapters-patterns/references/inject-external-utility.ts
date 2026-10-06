// Assumes Angular 20.1 or later.
import { assertInInjectionContext, computed, effect, untracked } from "@angular/core";
import type { Signal } from "@angular/core";
import { injectExternalStore } from "./inject-external-store.js";
import { injectOutsideZone } from "./inject-outside-zone.js";

interface Options {
  step: number;
}

/** A small synchronous store, standing in for a library's existing core. */
class CounterStore {
  #options: Options;
  #value = 0;
  #listeners = new Set<() => void>();

  constructor(options: Options) {
    this.#options = options;
  }

  // Core update protocol; the Angular ref does not expose a public setter.
  setOptions(options: Options): void {
    this.#options = options;
  }

  getSnapshot(): number {
    return this.#value;
  }

  subscribe(notify: () => void): () => void {
    this.#listeners.add(notify);
    return () => {
      this.#listeners.delete(notify);
    };
  }

  next(): void {
    this.#value += this.#options.step;
    for (const notify of this.#listeners) notify();
  }
}

interface UtilityRef {
  readonly value: Signal<number>;
  next(): void;
}

/** Adapt an external utility without exposing or proxying its core instance. */
export function injectExternalUtility(
  options: Partial<Options> | (() => Partial<Options>),
  select: (value: number) => number = (value) => value,
): UtilityRef {
  if (typeof ngDevMode === "undefined" || ngDevMode) {
    assertInInjectionContext(injectExternalUtility);
  }
  const outsideZone = injectOutsideZone();
  // Supplied options are the public configuration path; no imperative overrides.
  const wrappedOptions = computed(() => (typeof options === "function" ? options() : options));
  const resolvedOptions = computed(() => ({ step: 1, ...wrappedOptions() }));
  // Initialize lazily through the reactive graph, without tracking options.
  const instance = computed(() =>
    outsideZone(() => untracked(() => new CounterStore(resolvedOptions()))),
  );

  // Apply changing options to the existing instance through an effect.
  effect(() => {
    const current = instance();
    const latest = resolvedOptions();
    outsideZone(() => untracked(() => current.setOptions(latest)));
  });

  // The bridge owns subscription cleanup; this store has no other resources.
  const snapshot = injectExternalStore(() => {
    const current = instance();
    return {
      // Signal reads in select() update the value without reconnecting the store.
      getSnapshot: () => select(current.getSnapshot()),
      subscribe: (notify) => current.subscribe(notify),
    };
  });

  return {
    value: snapshot,
    next: () =>
      outsideZone(() =>
        untracked(() => {
          const current = instance();
          current.setOptions(resolvedOptions());
          current.next();
        }),
      ),
  };
}
