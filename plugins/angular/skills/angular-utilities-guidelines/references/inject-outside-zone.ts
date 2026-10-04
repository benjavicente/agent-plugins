import { NgZone, assertInInjectionContext, inject } from "@angular/core";

export function injectOutsideZone(): <T>(fn: () => T) => T {
  if (typeof ngDevMode === "undefined" || ngDevMode) {
    assertInInjectionContext(injectOutsideZone);
  }
  const ngZone = inject(NgZone);
  return <T>(fn: () => T): T => ngZone.runOutsideAngular(fn);
}
