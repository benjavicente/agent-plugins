// Assumes Angular 20.1 or later.
import { assertInInjectionContext, computed, effect, signal, untracked } from "@angular/core";
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
  setOptions(options: Partial<Options>): void;
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
  // Normalize supplied options; keep their composition visible below.
  const wrappedOptions = computed(() => (typeof options === "function" ? options() : options));
  const overrides = signal<Partial<Options>>({});
  const resolvedOptions = computed(() => ({ step: 1, ...wrappedOptions(), ...overrides() }));
  // Initialize lazily through the reactive graph, without tracking options.
  const instance = computed(() => new CounterStore(untracked(resolvedOptions)));

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
    setOptions: (update) =>
      outsideZone(() =>
        untracked(() => {
          overrides.update((previous) => ({ ...previous, ...update }));
          instance().setOptions(resolvedOptions());
        }),
      ),
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
