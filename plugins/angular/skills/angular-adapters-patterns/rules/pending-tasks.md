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

## Use the helper

`[design]` Use [injectPendingTask](../references/inject-pending-task.ts) because
Angular does not automatically account for every core's asynchronous work.
The helper centralizes task release and owner cleanup while preserving
operation results and errors, avoiding repeated lifetime handling in each utility.

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

The helper preserves awaited errors for the caller, unlike Angular's
`PendingTasks.run`, which returns `void` and reports failures globally. For
fire-and-forget operations, consume rejection only when the documented API also
exposes the failure through state or callbacks. Task ownership does not imply
callback delivery or cancellation.
