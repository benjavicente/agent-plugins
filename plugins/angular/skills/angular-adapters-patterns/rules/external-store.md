# External state

Use [injectExternalStore](../references/inject-external-store.ts) for a store
with a synchronous snapshot API. Its returned signal stays lazy and an effect
owns the connection. Depart when a required core protocol cannot fit that
contract, rather than adding generic connect/disconnect machinery to operations.

## Track and invalidate

`[correctness]` Subscription notifications invalidate a revision; a tracked
computation then reads the current snapshot. Do not populate a second state
signal or `linkedSignal` with subscription results. Selectors executed only in
notifications run outside Angular tracking and can leave derived state stale.

```ts
// Incorrect: the core applies options().select, for example
// (todos) => todos.filter((todo) => todo.done === showDone()), while notifying.
const value = linkedSignal(() => core().getResultFor(options()));

effect((onCleanup) => {
  const current = core();
  onCleanup(current.subscribe((result) => value.set(result)));
});
```

What breaks: `select` runs during notification, outside any reactive context, so
the signals it reads are not tracked. If `value` last computed before the todos
loaded, `filter` never called `showDone()`; after a notification sets the loaded
list, toggling `showDone()` leaves `value` stale until the store notifies again.

The correct technique bumps a revision and re-reads in a tracked computation:

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

The reference bridge packages it; adapters use it like this:

```ts
const snapshot = injectExternalStore(() => {
  const current = core();
  return {
    getSnapshot: () => select(current.getSnapshot()),
    subscribe: (notify) => current.subscribe(notify),
  };
});
```

Read connection dependencies in the binding factory. Read snapshot-only options,
filters, and selectors inside `getSnapshot`, so changing those signals updates
state without reconnecting. A separate `computed` for selection is also valid
when it derives from a shared full snapshot.

This pattern applies to synchronous stores. DOM measurement and event streams
may write callback results into signals because they have no synchronous
snapshot to re-read; see [defer reads](inputs-and-types.md#defer-reads).

## Options-aware reads

`[correctness]` If the core can compute a result for supplied options, pass
current resolved options into that read so changes appear before the options
effect runs. Otherwise document that state changes after options are applied.
`setOptions` is a side effect, so it stays in the effect or imperative boundary
and out of the reactive graph, including `getSnapshot`; see
[no side effects in the reactive graph](lifecycle.md#no-side-effects-in-the-reactive-graph).

## Close setup gap

`[correctness]` Invalidate once after connecting. A snapshot read before the
subscription effect may otherwise stay cached after an unobserved change:

```ts
effect((onCleanup) => {
  const current = core();
  untracked(() => {
    onCleanup(current.subscribe(invalidate));
    invalidate();
  });
});
```

The [bridge reference](../references/inject-external-store.ts) also handles
owner destruction during subscription setup and snapshot equality. Its signal
remains readable after disconnection; external changes then have no notification
path unless another tracked dependency invalidates it.

## Direct invalidation

`[design]` Notify Angular directly and let its scheduling coalesce re-reads. Do
not copy another framework's batching or wrap `notify` in the core's delayed
scheduler without a required contract: reads before that scheduler flushes would
still see the previous cached snapshot. This matters most when the library's
other framework adapters do not use that scheduler either.

```ts
// Incorrect: reads return the previous snapshot until the library flushes.
subscribe: (notify) => current.subscribe(scheduler.batchCalls(notify)),
// Correct: invalidate directly; Angular schedules the re-read.
subscribe: (notify) => current.subscribe(notify),
```

Keep adapter invalidation private to the bridge. If an imperative transition
changes state without a core notification, first use the core's notification
protocol. A focused adapter invalidation may be needed for that documented
transition; it does not justify exposing refresh/connect methods publicly.
