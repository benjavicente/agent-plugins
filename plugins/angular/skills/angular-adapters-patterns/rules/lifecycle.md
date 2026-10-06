# Lifecycle and cleanup

## Owner vs effect cleanup

`[design]` Prefer effect cleanup for instances and connections read or acquired
by an effect. Use `DestroyRef` for lifetime resources outside that effect's
ownership. Callers should not have to release adapter resources themselves.

Effects align acquisition and cleanup with Angular's deferred initialization:
the effect reads the lazy instance when inputs are available, and cleanup captures
that instance. A `DestroyRef` callback can run before this initialization, so
reading a lazy factory there may unexpectedly construct a resource or read an
unset required input during destruction.

## No side effects in the reactive graph

`[correctness]` Keep `computed`, `linkedSignal`, binding factories, and snapshot
readers free of adapter side effects. Do not subscribe, start work, write
adapter state, acquire tasks, or register cleanup there, even inside `untracked`.
Inert construction and the documented
[core-owned bookkeeping exception](options-and-construction.md#lazy-inert-core)
are permitted.

Register cleanup in the owning effect or imperative acquisition boundary.
Neither tracking suppression nor zone isolation establishes resource ownership.

## Cleanup acquired resources

`[correctness]` Capture the resource in its owning effect and register cleanup
there. For an inert instance created by a computed, keep constructor option reads
untracked so option changes do not recreate or dispose the instance:

```ts
const core = computed(() => new InertCore(untracked(options)));

effect((onCleanup) => {
  const current = core();
  onCleanup(() => current.dispose());
});
```

This effect reads only the core identity. Apply changing options in a separate
effect; disposing the stable instance on each options-effect rerun is incorrect.
Do not write disposal handles inside the computed or call `core()` from teardown
to discover what to dispose.

For a connection replaced by an effect, capture its cleanup in that effect:

```ts
effect((onCleanup) => {
  const current = core();
  const disconnect = untracked(() => current.subscribe(invalidate));
  onCleanup(disconnect);
});
```

Construction that starts work or acquires adapter subscriptions belongs in an
owned effect or imperative boundary, with cleanup established at acquisition.

Keep one owner for a connection. An early pending task does not by itself require
an early subscription or guarantee per-call callbacks before connection.
Implement early connection only when the requested callback/core contract needs
it, and share the same cleanup path rather than subscribing twice.

## Destroy disconnects

`[design]` On destruction, stop observation and release adapter-owned resources
and pending tasks. This does not imply canceling core work or delivering every
per-call callback; preserve those core/sibling contracts independently.

Do not add destruction errors, no-op methods, or temporary connections for a new
post-destruction guarantee. Guard acquisition of Angular-owned resources where
required. A previously returned computed may remain readable, but disconnection
alone provides no live external freshness guarantee.
