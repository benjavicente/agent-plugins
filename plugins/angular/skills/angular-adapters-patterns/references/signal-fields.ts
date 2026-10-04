// Assumes Angular 20.1 or later.
import { computed } from "@angular/core";
import type { Signal } from "@angular/core";

/**
 * Maps declared state fields to stable signals on an ordinary object.
 * Creating the fields never reads the snapshot. Define operations separately.
 */
export function signalFields<T, K extends keyof T>(
  snapshot: Signal<T>,
  fields: readonly K[],
): { [P in K]: Signal<T[P]> } {
  const result = {} as { [P in K]: Signal<T[P]> };
  for (const field of fields) {
    result[field] = computed(() => snapshot()[field]);
  }
  return result;
}
