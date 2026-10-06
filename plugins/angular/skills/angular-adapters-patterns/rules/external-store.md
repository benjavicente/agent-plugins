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
Keep `setOptions` in the imperative boundary, not inside `getSnapshot`.

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

`[design]` Notify Angular directly and let its scheduling coalesce re-reads.
Do not copy another framework's batching or wrap `notify` in the core's delayed
scheduler without a required contract: reads before that scheduler flushes would
still see the previous cached snapshot.

Keep adapter invalidation private to the bridge. If an imperative transition
changes state without a core notification, first use the core's notification
protocol. A focused adapter invalidation may be needed for that documented
transition; it does not justify exposing refresh/connect methods publicly.
