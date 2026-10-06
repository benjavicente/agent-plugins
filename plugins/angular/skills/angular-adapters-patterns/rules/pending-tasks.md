# Pending tasks

## What to await

`[correctness]` Register work Angular must await for test stability and SSR.
Pending tasks let tests using `fixture.whenStable()` wait for relevant adapter
work, and let SSR wait before serializing the rendered application. Without
ownership, tests may assert before results arrive and SSR may emit unfinished
state, even when later signal writes correctly update a browser view.

This includes work started by subscriptions or option changes, not only public
operations. A queued synchronous callback can count; an idle instance or
subscription alone does not.

A test that waits for stability should see loaded state without sleeps or manual
flushes:

```ts
it("shows loaded todos once stable", async () => {
  const fixture = TestBed.createComponent(TodoList);
  await fixture.whenStable();
  expect(fixture.nativeElement.textContent).toContain("Buy milk");
});

// Incorrect: the load runs, but nothing is pending.
core.load().then((list) => todos.set(list));

// Correct: the load holds a task until its result is applied.
const release = pendingTasks.add();
core
  .load()
  .then(
    (list) => todos.set(list),
    (e) => error.set(e),
  )
  .finally(release);
```

With the incorrect version, `whenStable()` resolves before the load finishes and
the test sees the empty list. Zone.js does not help when core work runs
[outside the zone](operations.md#outside-zone). On the server,
`ApplicationRef.whenStable()` resolves early and the empty state is serialized.
In the correct version, a rejection becomes state rather than an unhandled
rejection; if `load()` can throw synchronously, release in a `catch` too.

## Use the helper

`[design]` Use [injectPendingTask](../references/inject-pending-task.ts) because
Angular does not automatically account for every core's asynchronous work. The
helper centralizes task release and owner cleanup while preserving operation
results and errors, avoiding repeated lifetime handling in each utility.

Synchronize store pending state in an effect; keep subscriptions focused on
invalidating snapshots.

Choose the ownership mode that matches the core:

- `set` follows authoritative pending state while completion remains observable.
- `run` owns one invocation until its result is applied, preserving its promise
  result or rejection.

```ts
const pending = injectPendingTask();

// State-owned work: disconnection must not leave a task tied to stale state.
effect(() => pending.set(isConnected() && snapshot().pending));

// Operation-owned work: each invocation has its own lifetime.
const execute = () => pending.run(() => getCurrentCore().execute());
```

These are alternative ownership patterns; do not automatically use both for the
same work. The caller decides which work should block stability.

## Choose authoritative ownership

`[correctness]` A cached pending flag is insufficient when the connection no
longer observes completion. Use per-operation ownership when work starts before
effects connect, overlaps, or outlives displayed state. Clearing state does not
necessarily cancel outstanding work.

```ts
// Incorrect: mutate() before the effect runs starts work without a task, and a
// reset or a later run finishing first releases it while earlier work runs.
effect(() => pending.set(state().isPending));
const mutate = (input: Input) => untracked(() => core().mutate(input));

// Correct: store state stays in `set`; each invocation owns a task in `run`.
const mutateAsync = (input: Input) => pending.run(() => core().mutate(input));
const mutate = (input: Input) => {
  mutateAsync(input).catch(() => {}); // the failure is readable from state
};
```

Apply the result inside the function passed to `run`, so the task is released
only after the result is applied. `mutate` is safe to call and ignore, for
example from a template; `mutateAsync` is for callers that await it and handle
the rejection.

The helper preserves awaited errors for the caller, unlike Angular's
`PendingTasks.run`, which returns `void` and reports failures globally. For
fire-and-forget operations, consume rejection only when the documented API also
exposes the failure through state or callbacks. Task ownership does not imply
callback delivery or cancellation.

Prefer `PendingTasks.add()` with an explicit release, or the helper that
packages it, over `PendingTasks.run`. Since Angular 20, `run` reports a
rejection to `ErrorHandler`, which conflicts with
[errors](angular-integration.md#errors). Before 22.0.1, a synchronous throw from
its function also leaked the task; since then, `run` forwards that throw to
`ErrorHandler` too. When handling tasks manually, check `DestroyRef.destroyed`
before `onDestroy`: it throws on a destroyed owner, which would skip the release
and leave the task pending.
