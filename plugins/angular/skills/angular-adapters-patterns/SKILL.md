---
name: angular-adapters-patterns
description:
  Design, implement, migrate, or review Angular adapters for framework-agnostic
  libraries, including signal utilities, providers, components, and directives.
  Use when translating a library's state, operations, lifecycle, or UI contracts
  into Angular APIs.
---

# Angular Adapter Patterns

Adapt the library's contract to Angular. These rules cover stateful cores, DOM
libraries, and libraries with components or directives. Apply each rule to the
API or protocol it concerns.

Preserve the requested API and relevant sibling concepts. The skill does not
require additional utilities, overloads, convenience fields, or stronger
callback and post-destruction guarantees.

**Core** means the wrapped library instance. A **snapshot** is its synchronously
readable state; a **ref** is a utility's public result; an **operation** starts
imperative work; a **selector** derives returned state from a snapshot; the
**owner** is the injection context's `DestroyRef`.

## Workflow

1. Read the core and relevant sibling adapters for the APIs in scope. Identify
   state reads, construction, option updates, operations, subscriptions,
   notification timing, callbacks, and resource release.
2. Inventory the public APIs in scope, including ancillary selectors,
   collections, providers, components, and directives. Map each to those
   contracts, share integration where protocols match, and explain departures
   needed for Angular.
3. Use the rule index below to identify applicable guidance. Read those rule
   sections before implementing the concern; component rules apply when the
   adapter includes components or directives.
4. Review every in-scope public API against the applicable rules and cases in
   [Review the result](#review-the-result).

## Rule index

`[correctness]` rules address observable behavior. `[design]` rules describe
preferred structure. Core and requested API constraints take precedence over
design preferences; explain exceptions and their ownership or timing effects.

Every rule is listed here with its category, a short instruction, and a link to
its explanation. When adding, renaming, or removing a rule, update this index
and its detail section together. Keep rationale and examples in the rule files
so humans can review the full inventory here and agents can load only relevant
details.

Rule snippets omit zone wrappers to focus on the concern being explained.
Consider the [zone boundary](rules/operations.md#outside-zone) when supporting
zone-based core scheduling; the complete TypeScript references include it.

### Public API — [rules/api-shape.md](rules/api-shape.md)

- `[design]` [File naming](rules/api-shape.md#file-naming): follow established
  layout; use `inject-<utility>.ts` and provider files, and keep helpers out of
  the public barrel. Keep `.component.{ts,html,css}` names for separate
  component files.
- `[design]` [Utility prefix](rules/api-shape.md#utility-prefix): name
  context-dependent utilities with an `inject` prefix.
- `[design]` [Implicit injector](rules/api-shape.md#implicit-injector): prefer
  the current context and `runInInjectionContext` over explicit injector
  arguments; preserve required ownership contracts and existing signatures.
- `[design]` [Context diagnostics](rules/api-shape.md#context-diagnostics): use
  removable assertions when they improve setup errors; direct `inject()` already
  enforces the context.
- `[correctness]` [Ordinary ref](rules/api-shape.md#ordinary-ref): return real
  signals and stable methods without reading state during property access; avoid
  proxies, reflection, and descriptor copying.
- `[design]` [Named fields](rules/api-shape.md#named-fields): use named fields
  for multiple outputs; a single-output utility with no operations may return
  its signal directly.
- `[design]` [Known fields](rules/api-shape.md#known-fields): use `signalFields`
  with an explicit list for repeated mapping; direct computed fields are fine
  for small refs.
- `[correctness]` [Explicit operations](rules/api-shape.md#explicit-operations):
  define methods once outside snapshot computations; classify function-valued
  data separately from operations.
- `[design]` [Sibling concepts](rules/api-shape.md#sibling-concepts): preserve
  relevant names, arguments, behavior, and shared integration while adapting
  state and lifecycle to Angular.
- `[correctness]` [Supported options](rules/api-shape.md#supported-options):
  implement options the adapter exposes, or explicitly omit/document unsupported
  sibling behavior rather than accepting it silently.
- `[design]` [Options factory](rules/api-shape.md#options-factory): accept
  reactive options as one factory, static options where useful, and expose
  existing common state fields as individual signals.

### Inputs and types — [rules/inputs-and-types.md](rules/inputs-and-types.md)

- `[correctness]` [Defer reads](rules/inputs-and-types.md#defer-reads): do not
  read required inputs or view queries during setup, including at call sites;
  defer DOM-dependent work to render callbacks.
- `[design]` [Value or function](rules/inputs-and-types.md#value-or-function):
  accept values or factories when static values are common and the forms are
  unambiguous; normalize lazily.
- `[design]`
  [Loose in, strong out](rules/inputs-and-types.md#loose-in-strong-out): accept
  reactive arguments as `() => T`; return real `Signal<T>` values.
- `[correctness]` [Honest types](rules/inputs-and-types.md#honest-types):
  describe reachable values and selected results without casting away
  unavailable values or casting default selectors to caller-chosen types.

### Options and construction — [rules/options-and-construction.md](rules/options-and-construction.md)

- `[correctness]`
  [One lazy path](rules/options-and-construction.md#one-lazy-path): normalize
  static options and factories through the same lazy path; creating the ref must
  not evaluate required inputs.
- `[design]`
  [Visible precedence](rules/options-and-construction.md#visible-precedence):
  compose built-in defaults, scoped defaults, and supplied options; include
  overrides only for a required public update contract.
- `[design]`
  [Lazy inert core](rules/options-and-construction.md#lazy-inert-core): prefer
  one lazy instance for cores that update in place, with untracked constructor
  reads and tracked option updates; establish ownership whenever construction or
  updates acquire resources or start work.
- `[design]`
  [Explicit updates](rules/options-and-construction.md#explicit-updates): prefer
  changes through the options factory; add a public update method only for a
  sibling contract or explicit task requirement, preserving its semantics.

### External state — [rules/external-store.md](rules/external-store.md)

- `[correctness]`
  [Track and invalidate](rules/external-store.md#track-and-invalidate):
  synchronous-store notifications invalidate; tracked reads retrieve snapshots
  and run selectors. Read snapshot-only filters/options without reconnecting.
- `[correctness]`
  [Options-aware reads](rules/external-store.md#options-aware-reads): use
  current options for synchronous reads when the core supports it; otherwise
  document effect timing. Keep option writes out of snapshot readers.
- `[correctness]` [Close setup gap](rules/external-store.md#close-setup-gap):
  invalidate after connecting so earlier reads catch unobserved state changes.
- `[design]` [Direct invalidation](rules/external-store.md#direct-invalidation):
  notify Angular directly; avoid copying sibling schedulers or batching unless
  the core contract requires it.

### Operations — [rules/operations.md](rules/operations.md)

- `[correctness]` [Current options](rules/operations.md#current-options): apply
  resolved options before work starts, even before the options effect runs;
  avoid redundant applications with meaningful side effects.
- `[correctness]` [Untracked boundary](rules/operations.md#untracked-boundary):
  run imperative operations, subscription setup, and event callbacks untracked;
  keep snapshot derivations and selectors tracked.
- `[design]` [Outside zone](rules/operations.md#outside-zone): consider
  isolation for core scheduling in zone-based apps; a missing wrapper alone is
  not a correctness defect and zoneless integration does not require it.

### Lifecycle — [rules/lifecycle.md](rules/lifecycle.md)

- `[design]`
  [Owner vs effect cleanup](rules/lifecycle.md#owner-vs-effect-cleanup): prefer
  effect cleanup for owned instances and connections; use `DestroyRef` for
  lifetime resources outside an effect's ownership.
- `[correctness]`
  [No side effects in the reactive graph](rules/lifecycle.md#no-side-effects-in-the-reactive-graph):
  keep computations and snapshot readers free of adapter writes, subscriptions,
  task acquisition, and cleanup registration; document core-owned bookkeeping.
- `[correctness]`
  [Cleanup acquired resources](rules/lifecycle.md#cleanup-acquired-resources):
  capture resources and register cleanup in their owning effect; keep instance
  disposal separate from changing options and out of computations.
- `[design]` [Destroy disconnects](rules/lifecycle.md#destroy-disconnects):
  release observation, resources, and tasks without inventing cancellation,
  callback, or post-destruction guarantees.

### Pending tasks — [rules/pending-tasks.md](rules/pending-tasks.md)

- `[correctness]` [What to await](rules/pending-tasks.md#what-to-await): account
  for work Angular must await for test stability and SSR, including automatic
  work from options or subscriptions; idle instances do not count.
- `[design]` [Use the helper](rules/pending-tasks.md#use-the-helper): centralize
  task release and owner cleanup with `injectPendingTask`; use `set` for
  observed pending state or `run` for one invocation while preserving
  results/errors. Prefer explicit release over `PendingTasks.run`.
- `[correctness]`
  [Choose authoritative ownership](rules/pending-tasks.md#choose-authoritative-ownership):
  own work that starts early, overlaps, or outlives displayed state; stale
  pending flags and resets do not prove completion or cancellation.

### Helpers — [rules/focused-helpers.md](rules/focused-helpers.md)

- `[design]` [One responsibility](rules/focused-helpers.md#one-responsibility):
  share coherent integration protocols while keeping utility-specific options,
  state fields, and operations visible.
- `[design]` [Direct return](rules/focused-helpers.md#direct-return): return
  refs directly or with a simple spread rather than staged or descriptor
  mutation.
- `[design]`
  [Nodes need consumers](rules/focused-helpers.md#nodes-need-consumers): use
  signals for reactive consumers; avoid pass-through nodes, duplicate
  subscriptions, and reactive ownership bookkeeping.

### Angular integration — [rules/angular-integration.md](rules/angular-integration.md)

- `[correctness]` [Choose effects](rules/angular-integration.md#choose-effects):
  use `effect` for client/server work and render effects/callbacks for DOM work;
  choose explicit DOM read/write phases where needed.
- `[design]` [Modern APIs](rules/angular-integration.md#modern-apis): prefer
  signals, `input`/`model`, `output`, signal queries, `host`, render callbacks,
  effects, and `DestroyRef` over decorator APIs and lifecycle hooks they
  replace.
- `[design]`
  [Attribute selectors](rules/angular-integration.md#attribute-selectors): for
  components wrapping native behavior, prefer a host such as `button[my-button]`
  (directives already attach to a host); preserve native attributes, events,
  focus, forms, and host styling/binding precedence.
- `[correctness]` [Errors](rules/angular-integration.md#errors): expose expected
  failures through state, callbacks, or operation results; pair throwing reads
  with non-throwing guards and leave reporting to the user.
- `[design]` [State vs events](rules/angular-integration.md#state-vs-events):
  signals represent current state; callbacks or Observables preserve
  occurrences.
- `[correctness]` [Hydration](rules/angular-integration.md#hydration): reuse
  server state through lazy `TransferState` serialization and one-time client
  restoration; define replay semantics if runtime hydration is required.
- `[design]` [Providers](rules/angular-integration.md#providers): provide shared
  state and scoped defaults; nearest defaults win. Reserve environment
  initializers for setup work and plain providers for component scopes.
- `[correctness]`
  [Provider factory](rules/angular-integration.md#provider-factory): create
  app-level state through an injector-owned factory for request-local SSR
  ownership; preserve required existing signatures with documented ownership.
- `[design]` [Version support](rules/angular-integration.md#version-support):
  prefer APIs within Angular's LTS window, honor the supported range, and favor
  a higher permitted minimum over complex compatibility workarounds.
- `[design]` [Private fields](rules/angular-integration.md#private-fields):
  prefer ECMAScript `#private` fields in classes, considering the compilation
  target.

## References

Read the example for the protocol being implemented. These examples are not a
required architecture for cores with different contracts. The generic TypeScript
references assume Angular 20.1 or later.

- [Complete store adapter](references/inject-external-utility.ts): options,
  construction, snapshots, operations, and cleanup together.
- [Store bridge](references/inject-external-store.ts): a synchronous snapshot
  and an effect-owned subscription.
- [Field mapper](references/signal-fields.ts): explicit repeated state fields.
- [Pending-task helper](references/inject-pending-task.ts): state or invocation
  ownership without duplicating task lifecycle handling.
- [Zone helper](references/inject-outside-zone.ts): core work outside NgZone.
- [TanStack Query reference](references/tanstack-query-adapter.md): optional
  production context with explicit differences from this guidance.

## Review the result

For correctness findings, show what breaks for the caller with a concrete
example: the trigger, expected behavior, and actual failure. Cite the source and
distinguish source reasoning from executed evidence. Report design preferences
separately.

For each in-scope API, trace these applicable cases through the code:

- Setup and property access with required inputs and queries still unset.
- Options or selector changes followed by a read or operation before effects
  run.
- An operation called from a consumer effect, without incidental dependencies.
- A state change between an early read and subscription setup.
- Destruction, connection replacement, and work started before the first effect.
- Overlapping work, reset, cancellation, and failure without premature task
  release.
- Public value/error types and user-controlled error handling.
- Component inputs, outputs, host semantics, and DOM work on client and server.
- Request-local client creation and server state reuse, when SSR is in scope.

Match validation to the task. For source-review-only work, report code evidence
and unresolved behavior without running tests, lint, builds, or other checks.
