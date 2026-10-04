# Options and the core

Contents: [One lazy path](#one-lazy-path) ·
[Visible precedence](#visible-precedence) · [Lazy inert core](#lazy-inert-core)
· [Explicit updates](#explicit-updates)

The [full store example](../references/inject-external-utility.ts) shows these
rules together.

## One lazy path

`[correctness]` Normalize options and defaults in `computed`. If both static
options and an options factory are supported, normalize them into the same
computation; a single `typeof options === "function"` check inside that
`computed` is fine. Do not inspect property descriptors or maintain separate
reactive and non-reactive paths. Static options and factories must use the same
lazy initialization path. A ref's signals and methods must exist immediately,
before any effect runs.

**Incorrect (setup reads the factory, and each kind gets its own path):**

```ts
const initial = typeof options === "function" ? options() : options;
const core = new Core({ ...defaults, ...initial });
const resolved =
  typeof options === "function"
    ? computed(() => ({ ...defaults, ...options() }))
    : signal({ ...defaults, ...options });
```

What breaks: setup calls the factory, so a factory that reads a required input
throws in a field initializer, before the ref exists. The two paths then drift:
a new default or an override added to one misses the other.

**Correct (one lazy computed for both kinds):**

```ts
const wrappedOptions = computed(() =>
  typeof options === "function" ? options() : options,
);
const resolvedOptions = computed(() => ({ ...defaults, ...wrappedOptions() }));
```

Nothing is read during setup. The core is built from `resolvedOptions` on first
read, as in [lazy inert core](#lazy-inert-core).

## Visible precedence

`[design]` Keep composition visible: normalize supplied options, then merge
defaults, supplied options, and any explicit overrides in that order.

## Lazy inert core

`[correctness]` For a core instance whose options can change, use a lazy
`computed` to construct it with `untracked(options)`. Apply subsequent options
in an effect, keeping `setOptions` untracked. Avoid manually caching and
initializing the instance in a `getInstance` function. The constructor should
not start subscriptions or async work; own those through effects and cleanup.

**Incorrect (a manual cache inside a computed that tracks options):**

```ts
let instance: Core | undefined;
const core = computed(() => (instance ||= new Core(options())));
```

What breaks: the node depends on `options()`, so it re-runs on every option
change while the cache hides that. The core is built on first read with whatever
options exist then. If its constructor starts timers or listeners, reading state
starts work that nothing owns.

**Correct (construct once, untracked; an effect applies later options):**

```ts
const core = computed(() => new Core(untracked(options)));

effect(() => {
  const current = core();
  const latest = options();
  untracked(() => current.setOptions(latest));
});
```

The effect's first run calls `setOptions` with the options the constructor
already received. `setOptions` must tolerate that identical call without
starting work; a core that refetches on `setOptions` would otherwise fetch
twice.

## Explicit updates

`[correctness]` For explicit updates, update the overrides signal, read resolved
options, and apply them through the core's options API. Include defaults in that
resolution:

```ts
const resolvedOptions = computed(() => ({ step: 1, ...wrappedOptions(), ...overrides() }));

setOptions: (update) => {
  overrides.update((previous) => ({ ...previous, ...update }));
  core().setOptions(resolvedOptions());
},
```

The [reference](../references/inject-external-utility.ts) also runs this
untracked and outside the zone. Omission and reset behavior is
library-dependent: how overrides interact with omitted or `undefined` options
depends on how the core manages its options. Follow its API; do not invent a
generic key-diff protocol that assumes `undefined` restores defaults.

When explicit updates should only last until the options given to the utility
change, hold the resolved options in a `linkedSignal` instead of a separate
overrides signal:

```ts
const resolvedOptions = linkedSignal(() => ({ step: 1, ...wrappedOptions() }));

setOptions: (update) => {
  resolvedOptions.update((previous) => ({ ...previous, ...update }));
  core().setOptions(resolvedOptions());
},
```

When `wrappedOptions()` changes, the `linkedSignal` recomputes from it and drops
earlier explicit updates.
