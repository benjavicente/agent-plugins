# Pending tasks

Contents: [What to await](#what-to-await) ·
[Store state effect](#store-state-effect) ·
[Own at operation](#own-at-operation) · [Manual release](#manual-release)

## What to await

`[correctness]` Integrate async work that Angular should wait for with
[PendingTasks](https://angular.dev/api/core/PendingTasks), so server rendering
and testing utilities wait for completion. Release the task on completion,
failure, or cancellation.

The condition should describe work Angular must wait for, not merely a created
instance or a debouncer with nothing queued. Delayed work can matter even when
its callback is synchronous; returning a promise is not what determines whether
Angular should wait.

Tests show the difference directly. A test that waits for the fixture to be
stable should see the loaded state without manual sleeps or flushes:

```ts
it("shows loaded todos once stable", async () => {
  const fixture = TestBed.createComponent(TodoList);
  await fixture.whenStable();
  expect(fixture.nativeElement.textContent).toContain("Buy milk");
});
```

**Incorrect (the work runs, but Angular never sees it):**

```ts
function injectTodos(core: TodoCore) {
  const todos = signal<Todo[]>([]);
  core.load().then((list) => todos.set(list));
  return todos.asReadonly();
}
```

What breaks: nothing is pending, so `fixture.whenStable()` resolves before the
load finishes. The test fails while it still shows the empty list. Zone.js does
not help when core work runs outside NgZone, as
[outside-zone](operations.md#outside-zone) requires. Server rendering has the
same problem: `ApplicationRef.whenStable()` resolves early, and the empty state
is serialized.

**Correct (the load holds a pending task until its result is applied):**

```ts
function injectTodos(core: TodoCore) {
  const pendingTasks = inject(PendingTasks);
  const todos = signal<Todo[]>([]);
  const error = signal<unknown>(undefined);
  const release = pendingTasks.add();
  try {
    core
      .load()
      .then(
        (list) => todos.set(list),
        (e) => error.set(e),
      )
      .finally(release);
  } catch (e) {
    error.set(e);
    release();
  }
  return { todos: todos.asReadonly(), error: error.asReadonly() };
}
```

A rejection becomes state instead of an unhandled rejection, which Zone.js would
not catch outside NgZone and which can end a Node server process. A synchronous
throw from `load()` releases the task too.

## Store state effect

`[design]` For a store with authoritative pending state, synchronize it in an
effect using a focused
[pending-task helper](../references/inject-pending-task.ts). Keep the
subscription responsible for invalidating snapshots, not stability bookkeeping:

```ts
const pendingTask = injectPendingTask();
effect(() => pendingTask.set(state().isPending));
```

`set` holds at most one task, adds none after the owner is destroyed, releases
on destroy, and runs untracked when called from an effect. Reimplement those
guarantees if you skip the helper.

## Own at operation

`[correctness]` If work starts before that state can be observed, or the state
does not represent all outstanding work, own the task at the operation.

**Incorrect (the displayed status decides when work is finished):**

```ts
const pendingTask = injectPendingTask();
effect(() => pendingTask.set(state().isPending));

function mutate(input: Input) {
  return untracked(() => core().mutate(input));
}
```

What breaks: `mutate()` called before the effect runs starts work without a
task. When a reset, or a later run finishing first, makes `isPending` false, the
task is released while earlier work still runs, so `whenStable` and server
rendering finish early.

**Correct (store state stays in `set`; each invocation owns a task in `run`):**

```ts
const pendingTask = injectPendingTask();
effect(() => pendingTask.set(state().isPending));

function mutateAsync(input: Input) {
  return pendingTask.run(() => core().mutate(input));
}
function mutate(input: Input) {
  mutateAsync(input).catch(() => {}); // the failure is readable from state
}
```

The helper's `run` returns a promise that resolves or rejects exactly like the
function you pass; a synchronous throw becomes a rejection. Apply the result
inside that function, so the task is released only after the result is applied.
Here the core writes the result into its store state before `mutate` settles.
`mutate` is safe to call and ignore, for example from a template; `mutateAsync`
is for callers that await it and handle the rejection. Without the helper, each
invocation does this:

```ts
function injectExample(work: () => Promise<void>) {
  const pendingTasks = inject(PendingTasks);
  const owner = inject(DestroyRef);

  return {
    async execute() {
      if (owner.destroyed) return untracked(work); // still callable, no task to own
      const release = pendingTasks.add();
      const unregister = owner.onDestroy(release);
      try {
        await untracked(work);
      } finally {
        unregister();
        release();
      }
    },
  };
}
```

For operation-owned tasks, add the task before scheduling work and release it
after its result has been applied. Check `owner.destroyed` first:
`DestroyRef.onDestroy` throws on a destroyed owner, which would skip the
`finally` and leave the task pending forever. A subscription alone is not a
pending task.

## Manual release

`[design]` Prefer `PendingTasks.add()` with an explicit release over
`PendingTasks.run`. For operation-owned async work, the
[helper's `run`](../references/inject-pending-task.ts) is that manual handling
packaged: it adds the task, releases it in `finally` and on destroy, and returns
`fn`'s own result or error. Manual handling also covers callbacks and scheduled
synchronous work.

The release happens even if the caller ignores the promise. An operation that
callers can fire and forget, for example from a template, should not reject:
expose the failure as state. Keep the rejecting promise for an explicitly
awaited variant, as Query's `mutate` and `mutateAsync` do.

Since Angular 20, `run` reports a rejection to `ErrorHandler`, which conflicts
with [errors](angular-integration.md#errors). Before 22.0.1, a synchronous throw
from `fn` also leaked the task. Since then, `run` catches that throw and
forwards it to `ErrorHandler` too.
