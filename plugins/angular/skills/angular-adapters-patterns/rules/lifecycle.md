# Lifecycle and cleanup

Contents: [Owner vs effect cleanup](#owner-vs-effect-cleanup) ·
[No side effects in the reactive graph](#no-side-effects-in-the-reactive-graph)
· [Effect captures resource](#effect-captures-resource) ·
[Destroy disconnects](#destroy-disconnects)

## Owner vs effect cleanup

`[design]` Use `DestroyRef` for the utility's lifetime and effect cleanup for
subscriptions that must be replaced when their inputs change. Callers should not
need to release resources manually.

## No side effects in the reactive graph

`[correctness]` Keep reactive computations, such as `computed` and
`linkedSignal`, free of side effects. Registering a cleanup callback is a side
effect, and so are subscribing, starting work, and writing state. Constructing
an inert core is fine. Never do these while evaluating a computation, even
inside `untracked`. Register `DestroyRef.onDestroy` during utility setup. For
resources obtained through the reactive graph, use a separate effect's
`onCleanup`.

## Effect captures resource

`[correctness]` Capture resources in the owning effect's cleanup instead of
mirroring a computed instance in an `initialized` variable. Establish ownership
before starting owned work; avoid lifecycle bookkeeping as a side effect of
computing state.

**Incorrect (reads record lifecycle state for cleanup):**

```ts
let used = false;
const core = computed(() => {
  used = true;
  return new Core(untracked(options));
});

owner.onDestroy(() => {
  if (used) core().dispose();
});
```

What breaks: lifecycle state is written whenever something reads the core, so
ownership depends on read order, and cleanup needs a flag to avoid building a
core just to dispose it. Storing `used` in a signal does not change that.

**Correct (the owning effect captures the instance):**

```ts
const core = computed(() => new Core(untracked(options)));

effect((onCleanup) => {
  const current = core();
  onCleanup(() => current.dispose());
});
```

This effect reads only `core()`, so option changes, applied in their own effect,
do not dispose the instance.

The effect only runs after setup. Operations that start owned work before it has
run register that work with `DestroyRef` themselves, as
[own-at-operation](pending-tasks.md#own-at-operation) does for tasks. Otherwise
an owner destroyed before the first effect run leaves the work undisposed.

## Destroy disconnects

`[design]` Destruction disconnects subscriptions; it does not make the object
uncallable. Avoid custom destruction errors and teardown flags. Keep normal core
behavior or use a no-op where appropriate. Only guard against reconnecting
subscriptions or starting new work owned by a destroyed context.
