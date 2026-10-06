# Public API shape

## File naming

`[design]` Follow the [Angular style guide](https://angular.dev/style-guide)
and established sibling layout. Name public utilities `inject-<utility>.ts`,
provider functions `providers.ts` or `provide-<utility>.ts`, and keep helpers
absent from the public barrel under `src/utils/` unless the package has an
established alternative. A module export alone does not make a helper public.

For components with separate template and style files, retain
`{name}.component.{ts,html,css}` names (or the project's stylesheet extension).
The `.component.html` suffix lets formatters such as Prettier and oxfmt select
the Angular template parser instead of treating Angular control flow as plain
HTML. This is an intentional naming exception to the style guide.

## Utility prefix

`[design]` Prefix injection-context-dependent utilities with `inject` so callers
can recognize where they may be used. This naming convention is separate from
injector arguments and setup diagnostics.

## Implicit injector

`[design]` Prefer using the current injection context instead of accepting an
explicit injector argument. Callers can use `runInInjectionContext` when choosing
another owner.

## Context diagnostics

`[design]` Use a removable development assertion when it makes setup errors more
useful. A direct `inject()` call already enforces the injection context; absence
of an extra assertion does not establish incorrect ownership or runtime behavior.

```ts
if (typeof ngDevMode === "undefined" || ngDevMode) {
  assertInInjectionContext(injectSomething);
}
```

## Ordinary ref

`[correctness]` Expose state as real `Signal<T>` fields and operations as stable
methods. Declare fields without reading the snapshot. A `Proxy`, dynamic field
discovery, or copied descriptors can evaluate required inputs when the caller
merely accesses or spreads the ref.

```ts
// Incorrect: property access reads state before inputs may be available.
const ref = new Proxy(
  {},
  {
    get(_target, key) {
      const field = untracked(snapshot)[key];
      return typeof field === "function"
        ? field
        : computed(() => snapshot()[key]);
    },
  },
);

// Correct: setup creates references; state is read only when a signal is called.
return {
  value: computed(() => snapshot().value),
  status: computed(() => snapshot().status),
  next,
};
```

This lets field initializers compose utilities by passing `other.value` unread.
Passing `other.value()` still reads too early.

## Named fields

`[design]` Use a named ref rather than a tuple for multiple outputs. Angular
callers typically store it in a class field: `menu = injectMenu()`, then
`menu.open()` and `menu.toggle()`. Tuples force indexed access or extra aliases.

A single-output utility with no operations may return `Signal<T>` directly.
Array-valued state and internal tuples are also fine; this rule concerns a
public ref's shape.

Keep aggregate snapshots internal unless the requested public API includes one.

## Known fields

`[design]` Use [signalFields](../references/signal-fields.ts) when several
utilities repeat the same field mapping. Supply an explicit state-field list
and define operations separately. For a small ref, direct `computed` fields are
equally clear; the helper is not mandatory.

## Explicit operations

`[correctness]` Define each operation once, outside snapshot computations.
Reading state must not manufacture methods tied to an old snapshot. Do not
forward core operation fields through the state-field mapper.

```ts
const reload = () =>
  untracked(() => {
    const current = core();
    current.setOptions(options());
    return current.reload();
  });
```

Function-valued **data** is still data and may be exposed as `Signal<() => T>`;
classify fields by contract, not by `typeof`.

## Sibling concepts

`[design]` Preserve relevant sibling names, arguments, and operation behavior.
Adapt their state to Angular signals rather than copying render-time values or
getter-based refs. Share base integration when ordinary and specialized
utilities use the same protocol; see [focused helpers](focused-helpers.md).

## Supported options

`[correctness]` Expose only options the adapter implements. Some sibling flags
depend on that framework's rendering or error-boundary protocol and have no
automatic effect in the core. Adapt their behavior, or omit/document unsupported
options rather than accepting them silently.

## Options factory

`[design]` Accept reactive options as one factory, for example
`() => ({ wait: delay() })`, instead of requiring getter-property objects.
Accept static options too when that fits or is ergonomic in the API;
normalize both lazily as in
[options and construction](options-and-construction.md).

Return individual signals for the existing common state fields. This changes
how those fields are read, not which fields the adapter exposes.
