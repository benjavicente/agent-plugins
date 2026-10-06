# Operations and reactive boundaries

## Current options

`[correctness]` Before an operation starts work, apply the current resolved
options; the options effect may not have run. Use the core's update protocol and
avoid redundant applications when they have meaningful side effects.

```ts
const next = () => untracked(() => {
  const current = core();
  current.setOptions(resolvedOptions());
  return current.next();
});
```

## Untracked boundary

`[correctness]` Public operations and subscription setup run untracked so a
caller invoking them from an effect gains no incidental dependencies. Read
reactive options in their own tracked computation, then use the resolved value
inside imperative work.

Do not blanket-wrap all user callbacks: selectors deriving returned state need
to execute in a tracked read. Event callbacks and imperative callbacks should
not add dependencies. Cleanup callbacks already run outside tracking need no
additional `untracked` wrapper.

## Outside zone

`[design]` When supporting zone-based applications, consider isolating core
scheduling with [injectOutsideZone](../references/inject-outside-zone.ts).
Background polling or retry timers can trigger unnecessary change detection or
keep zone-based stability open. Apply the boundary where that scheduling begins,
rather than wrapping every pure read or helper call.

Zoneless applications do not need this boundary to notify Angular through signals.
An adapter without a zone wrapper is not automatically incorrect. Report a
correctness issue only when the supported execution mode and actual scheduling
produce a concrete failure, such as an outstanding polling timer preventing
stability. Merely importing or omitting `NgZone` is insufficient evidence.

`untracked` controls dependencies independently of zones. Account for work Angular
should await with [PendingTasks](pending-tasks.md), regardless of zone usage.
Existing `runOutsideAngular` boundaries remain compatible with zoneless apps;
retain or document any required callback execution context. See Angular's
[zoneless compatibility guidance](https://angular.dev/guide/zoneless).
