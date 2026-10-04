# External state

Contents: [Track and invalidate](#track-and-invalidate) ·
[Close setup gap](#close-setup-gap) ·
[Direct invalidation](#direct-invalidation)

For complicated or repeated store subscriptions, consider creating an
[`injectExternalStore`](../references/inject-external-store.ts) utility. See the
[full store example](../references/inject-external-utility.ts) for computed
options, lazy construction, effect-owned subscriptions, tracked snapshots, and
the public API together.

## Track and invalidate

`[correctness]` This applies when the source has a synchronous `getSnapshot`
that is safe to call inside the reactive graph. Event or measurement sources,
such as `ResizeObserver` and DOM layout, are not covered; see
[defer reads](inputs-and-types.md#from-the-utility-side). For such a store,
notifications should only invalidate the snapshot; the next read gets current
state through `getSnapshot`. Do not keep another writable signal, including a
`linkedSignal`, populated with copies of subscription results.

The store bridge runs `getSnapshot` in a tracked computation. Apply selectors or
other reactive derivations there when they define the returned state; their
signal dependencies do not need to reconnect the subscription. Add a separate
computed when it serves a distinct purpose, such as deriving from a shared full
snapshot. Keep snapshot reads tracked when they intentionally depend on signals.

If the core can compute a snapshot for given options, such as Query's
`getOptimisticResult`, pass the resolved options to that read so option changes
show before the options effect runs. Otherwise state follows options once the
effect applies them. `setOptions` is a side effect, so it stays in the effect
and out of the reactive graph, including `getSnapshot`; see
[no side effects in the reactive graph](lifecycle.md#no-side-effects-in-the-reactive-graph).

**Incorrect (a subscription callback sets a `linkedSignal`):**

```ts
// The core applies options().select, for example:
// select: (todos) => todos.filter((todo) => todo.done === showDone())
const value = linkedSignal(() => core().getResultFor(options()));

effect((onCleanup) => {
  const current = core();
  onCleanup(current.subscribe((result) => value.set(result)));
});
```

What breaks: the store runs `select` while notifying, outside any reactive
context, so the signals it reads are not tracked. `value` only tracks what its
last computation read. If that ran before the todos loaded, `filter` never
called `showDone()`. After a notification sets the loaded list, toggling
`showDone()` leaves `value` stale until the store happens to notify again.

**Correct (a notification invalidates; the read stays tracked):**

```ts
const revision = signal(0);
const invalidate = () => revision.update((n) => n + 1);

effect((onCleanup) => {
  const current = core();
  untracked(() => onCleanup(current.subscribe(invalidate)));
});

const value = computed(() => {
  revision();
  return core().getResultFor(options());
});
```

The subscription never carries the result. It only bumps `revision`, which
invalidates `value`. The next read recomputes inside `computed`, so the store
runs `select` in a tracked context: whatever signals it reads in that run, such
as `showDone()`, become dependencies. Options changes invalidate the same
computation without reconnecting the subscription.

The [`injectExternalStore`](../references/inject-external-store.ts) reference
wraps this technique in a reusable helper. It adds what the sketch leaves out:
running store work outside NgZone, the
[setup-gap invalidation](#close-setup-gap), destruction during subscription
setup, and snapshot equality.

## Close setup gap

`[correctness]` The subscription bridge invalidates after connecting to cover
changes between the first read and subscription setup. A field initializer,
template, or operation can read the snapshot before the subscription effect
runs, and a change in that window notifies no one:

```ts
effect((onCleanup) => {
  const current = core();
  untracked(() => {
    onCleanup(current.subscribe(invalidate));
    invalidate(); // an earlier read may hold a pre-connection snapshot
  });
});
```

The [reference bridge](../references/inject-external-store.ts) does this in its
subscription effect.

## Direct invalidation

`[design]` Prefer direct snapshot invalidation, and let Angular's scheduling
decide when dependents re-read. Signals already coalesce synchronous
invalidations, and effects and change detection run on Angular's schedule. Do
not route notifications through the core library's scheduler or batching
utilities unless Angular has a specific need. This matters most when the
library's other framework adapters do not use those utilities either. Likewise,
do not copy render batching from another adapter; compare the relevant
client/server paths of other signal-based adapters.

**Incorrect (the library's scheduler delays invalidation):**

```ts
subscribe: (notify) => current.subscribe(scheduler.batchCalls(notify)),
```

What breaks: until the library's scheduler flushes, reads return the previous
snapshot. Updates then reach Angular on the library's timing, which Angular's
scheduling and tests do not see.

**Correct (invalidate directly; Angular schedules the re-read):**

```ts
subscribe: (notify) => current.subscribe(notify),
```
