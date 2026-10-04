# Operations and reactive boundaries

Contents: [Current options](#current-options) ·
[Untracked boundary](#untracked-boundary) · [Outside zone](#outside-zone)

## Current options

`[correctness]` Define operations explicitly. Before an operation starts work,
apply the current computed options: the options effect may not have run yet.
Keep this work untracked. The `next` operation in the
[full store example](../references/inject-external-utility.ts) does this:

```ts
next: () =>
  outsideZone(() =>
    untracked(() => {
      const current = instance();
      current.setOptions(resolvedOptions());
      current.next();
    }),
  ),
```

## Untracked boundary

`[correctness]` Read reactive inputs in the tracked computation. Within a
reactive context, use `untracked` for user callbacks, subscription setup, and
imperative work whose incidental reads should not become dependencies. Public
operations should provide that boundary because callers may invoke them from an
effect. Do not wrap callbacks already run outside tracking, such as
`DestroyRef.onDestroy` callbacks.

## Outside zone

`[correctness]` `untracked` only controls signal dependency tracking; it does
not move work outside NgZone. Run core work that can schedule background timers,
subscription setup, and cleanup outside the zone, as
[injectOutsideZone](../references/inject-outside-zone.ts) does in the
references. Account for work Angular should wait for with PendingTasks instead.

Inside the zone, a core's background timers, such as garbage collection,
polling, or retries, keep `NgZone.isStable` false. Server rendering and
`whenStable` then wait for them or hang, and every timer tick triggers app-wide
change detection. Signal writes made outside the zone still schedule rendering:
Angular's hybrid scheduling notices them, and in zoneless apps
`runOutsideAngular` changes nothing. The trade-off is that user callbacks the
core invokes, such as `select` or `onSuccess`, also run outside the zone.
