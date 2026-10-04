---
name: angular-adapters-patterns
description:
  Design and implement Angular inject* utilities and adapters that wrap a
  framework-agnostic library core with signals, effects, DestroyRef,
  PendingTasks, and TransferState. Use when creating, migrating, or reviewing an
  Angular adapter or a signal-based utility API.
---

# Angular Adapter Patterns

For library authors adapting an existing core, and its React, Vue, or Solid
adapters, to Angular. The guidance is library-agnostic; the references use a
small generic store.

Terms used throughout: **core** is the library instance; **snapshot** is its
current state, read synchronously; **ref** is the object a utility returns; an
**operation** is a ref method that starts work; a **selector** is a
caller-supplied function that derives the returned state from the snapshot; the
**owner** is the injection context's `DestroyRef`.

## File naming

Organize and name files following the
[Angular style guide](https://angular.dev/style-guide). One exception: for
components with template and style files, keep `{name}.component.{ts,html,css}`
names. Prettier-compatible formatters, including oxfmt, choose the Angular
template parser from `*.component.html`; a plain `.html` file is formatted as
HTML, so control flow such as `@if` is not indented as Angular. oxfmt has no
per-file parser override
([oxc#17852](https://github.com/oxc-project/oxc/issues/17852)), so this cannot
be configured away.

The guide does not cover adapter files. Name each public utility's file
`inject-<utility>.ts`, and provider functions `providers.ts` or
`provide-<utility>.ts`.

## Ref shape

Return a stable object with stable signal and method references. Reading or
destructuring its properties should obtain those references without evaluating
reactive inputs.

```ts
interface ExampleRef<T> {
  readonly value: Signal<T>;
  next(): void;
}

const example = injectExample();

// injectOperation accepts () => T, so example.value passes without being read
const result = injectOperation(example.value);
```

Map repeated state fields with [signalFields](references/signal-fields.ts) and
keep operations outside the mapping:

```ts
return {
  ...signalFields(snapshot, ["value", "status"]),
  next,
};
```

### Injection context

Functions that depend on the injection context should be prefixed with `inject`
and should not accept an explicit injector argument.

This makes the dependency on the injection context explicit.

This differs from Angular APIs such as `effect`, `toSignal`, `resource`,
`httpResource`, and `afterNextRender`, which accept `{ injector }`. Utilities
keep one signature instead: an injector parameter tends to hide which context
owns the utility's lifetime and makes the implementation more complicated.

In the rare cases when a different injection context is needed, use
`runInInjectionContext` rather than passing an injector manually. Those cases
can indicate API design issues.

Assert the injection context on a branch that can be removed during
minification, so the production build can drop the assertion and its function
name. The assertion only improves the error message: `inject()` already fails
with NG0203 outside an injection context in production.

```ts
function injectSomething() {
  if (typeof ngDevMode === "undefined" || ngDevMode) {
    assertInInjectionContext(injectSomething);
  }
}
```

## Workflow

1. Read the core API and every sibling framework adapter.
2. List every exported utility, including ancillary selectors, collections, and
   providers. Each one follows these rules, not only the main utility.
3. For each utility, decide its state fields and operations from the API
   contract.
4. Before writing a part of the adapter, read the rule file for that concern.
   Each rule there explains why, with incorrect and correct code.
5. Run the completion checks on every exported utility.

## Rules

`[correctness]` rules prevent observable bugs. `[design]` rules keep the adapter
reviewable.

### Public API — [rules/api-shape.md](rules/api-shape.md)

- `[correctness]` Return an ordinary object of real signals and methods; declare
  fields without reading the source, with no `Proxy` or reflection.
  `ordinary-ref`
- `[design]` An exported utility's ref is an object of named fields, never a
  tuple: callers store it in a class field and access it by name.
  `never-return-an-array`
- `[design]` Map repeated state fields with `signalFields` and an explicit field
  list. `known-fields`
- `[correctness]` Define each operation once, outside snapshot computations;
  never forward function-valued snapshot fields. `explicit-operations`
- `[design]` Keep sibling adapters' concepts, names, and arguments; differ only
  for Angular reactivity and lifecycle. `sibling-concepts`
- `[design]` Accept reactive options as one options factory, not property
  getters; return individual signals for common fields. `options-factory`

### Inputs and types — [rules/inputs-and-types.md](rules/inputs-and-types.md)

- `[correctness]` Don't read required inputs or view queries during
  initialization, in the utility or at the call site. `defer-reads`
- `[design]` Accept a value or a function when values are the common case.
  `value-or-function`
- `[design]` Accept loosely typed functions (`() => T`); return strongly typed
  signals. `loose-in-strong-out`
- `[correctness]` Return types describe actual values; no casts for unavailable
  initial values or default selectors. `honest-types`

### Options and the core — [rules/options-and-construction.md](rules/options-and-construction.md)

- `[correctness]` Normalize static options and factories through one lazy
  `computed` path; the ref exists before any effect runs. `one-lazy-path`
- `[design]` Compose visibly: defaults, then supplied options, then explicit
  overrides. `visible-precedence`
- `[correctness]` Construct the core in a lazy `computed` with untracked
  options; apply later options in an effect; constructors start no work.
  `lazy-inert-core`
- `[correctness]` Explicit updates go through overrides, resolved options, and
  the core's options API; omission and reset follow the library. Use a
  `linkedSignal` when updates should reset with the given options.
  `explicit-updates`

### External state — [rules/external-store.md](rules/external-store.md)

- `[correctness]` Notifications only invalidate (bump a revision); reads go
  through a tracked `getSnapshot` that applies selectors. Never copy
  subscription results into a signal or `linkedSignal`. `track-and-invalidate`
- `[correctness]` Invalidate once after subscribing, so reads taken before
  connection catch up. `close-setup-gap`
- `[design]` Invalidate directly and let Angular schedule re-reads; don't route
  notifications through the core's scheduler or another adapter's batching.
  `direct-invalidation`

### Operations — [rules/operations.md](rules/operations.md)

- `[correctness]` Apply the current options before an operation starts work; the
  options effect may not have run. `current-options`
- `[correctness]` Operations wrap imperative work in `untracked`; keep snapshot
  reads tracked. `untracked-boundary`
- `[correctness]` `untracked` is not zone isolation; run core work, timers, and
  subscription setup outside NgZone. `outside-zone`

### Lifecycle — [rules/lifecycle.md](rules/lifecycle.md)

- `[design]` Use `DestroyRef` for the utility's lifetime and effect cleanup for
  replaced subscriptions; callers never release resources.
  `owner-vs-effect-cleanup`
- `[correctness]` No side effects inside the reactive graph, including
  registering cleanup or subscriptions in a `computed`, even inside `untracked`.
  `no-side-effects-in-the-reactive-graph`
- `[correctness]` Capture resources in the owning effect's cleanup; no mirrored
  `initialized` or `used` state. Work started before that effect runs registers
  with `DestroyRef` itself. `effect-captures-resource`
- `[design]` Destruction disconnects; the ref stays callable, without teardown
  flags or destruction errors. `destroy-disconnects`

### Pending tasks — [rules/pending-tasks.md](rules/pending-tasks.md)

- `[correctness]` Register work Angular must wait for, including delayed
  synchronous work, so `whenStable` in tests and SSR waits for it; not an
  instance or a debouncer with nothing queued. `what-to-await`
- `[design]` Sync authoritative store pending state in an effect with the
  helper's `set`, not in the subscription. `store-state-effect`
- `[correctness]` When state is late or misses outstanding work, each operation
  owns its task until its result is applied, using the helper's `run`.
  `own-at-operation`
- `[design]` Add and release tasks yourself, or with the helper's `run`; prefer
  either over `PendingTasks.run`. `manual-release`

### Helpers — [rules/focused-helpers.md](rules/focused-helpers.md)

- `[design]` Give each helper one responsibility; keep option composition and
  operations visible in the utility. `one-responsibility`
- `[design]` Return the object directly or with a simple spread. `direct-return`
- `[design]` Use signals only for reactively consumed values; no pass-through or
  bookkeeping nodes. `nodes-need-consumers`

### Angular integration — [rules/angular-integration.md](rules/angular-integration.md)

- `[correctness]` Use `effect` for client and server work, `afterRenderEffect`
  for DOM work. `choose-effects`
- `[correctness]` Leave error handling to the user: expose failures as state or
  operation results, not through `ErrorHandler` or `NgZone.onError`; pair a
  throwing read with a non-throwing guard. `errors`
- `[design]` Signals for current state; callbacks or Observables for events.
  `state-vs-events`
- `[correctness]` Use `TransferState` to reuse server state on the client:
  serialize lazily, remove after reading. `hydration`
- `[design]` Add provider functions for state a provider tree shares, app-wide
  or scoped defaults (the nearest provider wins); use
  `provideEnvironmentInitializer` only for work that must run in an injection
  context at initialization. `providers`
- `[design]` Target Angular's LTS window; raise the minimum when it simplifies
  the adapter. The references assume Angular 20.1 or later. `version-support`
- `[design]` Use `#private` fields in classes. `private-fields`

## Completion checks

Run these on every exported utility before finishing:

- Create, enumerate, and destructure the ref while required inputs are unset:
  nothing throws.
- Change a selector, then read state before effects run: the read reflects the
  change. If the core can compute a snapshot for given options, changing options
  does too; otherwise state reflects new options once the options effect applies
  them.
- Change options, then call an operation before effects run: it uses the new
  options.
- Call each operation inside a consumer `effect`: the effect gains no adapter
  dependencies.
- Destroy the owner: observation stops, and later calls do not throw custom
  errors.
- Start work before any effect, overlap it, reset, fail, and destroy: Angular
  waits for exactly the outstanding work.
- Trigger a library failure: it is readable from state or the operation, with no
  global error report.
- Every state field passes `isSignal`.

## Files

The TypeScript references assume Angular 20.1 or later.

| File                                                                | Read when                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [rules/](rules/)                                                    | Writing the part of the adapter a rule group covers                          |
| [inject-external-utility.ts](references/inject-external-utility.ts) | Wrapping a core: options, lazy construction, bridge, and operations together |
| [inject-external-store.ts](references/inject-external-store.ts)     | Bridging any synchronous store into a signal                                 |
| [signal-fields.ts](references/signal-fields.ts)                     | Mapping repeated state fields                                                |
| [inject-pending-task.ts](references/inject-pending-task.ts)         | Owning tasks: store pending state (`set`) or each operation (`run`)          |
| [inject-outside-zone.ts](references/inject-outside-zone.ts)         | Running core work outside NgZone                                             |
| [tanstack-query-adapter.md](references/tanstack-query-adapter.md)   | Seeing this shape at production scale, across many utilities                 |
