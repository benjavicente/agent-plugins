# Options and construction

## One lazy path

`[correctness]` Normalize static options and factories through the same lazy
path. Creating the ref must not evaluate a factory that reads required inputs.
Do not inspect descriptors or build separate reactive and static protocols.

```ts
const supplied = computed(() =>
  typeof options === "function" ? options() : options,
);
const resolved = computed(() => ({ ...defaults, ...supplied() }));
```

A single `typeof` branch is appropriate only when a function cannot also be the
option value; see [value or function](inputs-and-types.md#value-or-function).

## Visible precedence

`[design]` Keep option composition visible: built-in defaults, scoped defaults
if supported, then supplied options. Include explicit overrides only when the
public contract requires them. Use the core's normalization API when it defines
defaulting semantics rather than replacing it with an assumed shallow merge.

## Lazy inert core

`[design]` For a core whose options change in place, prefer constructing it once
in a lazy `computed`, with constructor reads untracked. Apply subsequent options
in an effect. This avoids eager input reads and recreation on option changes:

```ts
const core = computed(() => new Core(untracked(resolved)));

effect(() => {
  const current = core();
  const latest = resolved();
  untracked(() => current.setOptions(latest));
});
```

The effect must read the core identity and resolved options in its tracked part.
Calling only an accessor that wraps those reads in `untracked` gives the effect
no dependency on option changes, even if snapshots separately track options.

Use this shape only when construction is inert from the adapter's perspective.
The constructor must not create adapter subscriptions or start adapter-owned
work. Inspect what the first and later `setOptions` calls do; an identical call
is not necessarily inert. If applying options also starts work, account for its
ownership and pending tasks and avoid redundant calls when the core requires it.

Existing core-owned cache bookkeeping can accompany construction or a
synchronous snapshot read. Document that exception and follow the core's
ownership contract. It does not permit adapter signal writes, subscriptions,
task acquisition, or cleanup registration inside computations. `untracked`
changes dependency tracking; it does not make side effects pure.

If construction acquires resources the adapter must release immediately, the
lazy-computed shape alone is insufficient. Acquire them in an owned imperative
boundary or effect and establish cleanup there. Explain any different lazy
ownership strategy; prefer it over leaking resources to conform to this example.
See [cleanup acquired resources](lifecycle.md#cleanup-acquired-resources).

## Explicit updates

`[design]` Prefer changing options through the supplied options factory. Do not
add a public `setOptions` or update method when relevant sibling adapters do not
expose one, unless the task explicitly requires it. A core's internal options
setter is an integration mechanism, not a reason to expose another public API.

When a public update method is required, route it through resolved options,
including defaults, and the core's update protocol. Preserve its omission,
merge, and reset semantics; do not assume an omitted key or `undefined` means
"restore defaults", or introduce a generic key-diff protocol.

Add writable overrides only if that contract needs them. If imperative changes
must reset when supplied options change, `linkedSignal` can model that behavior;
persistent overrides represent a different contract. Neither is a default
adapter pattern.

The [complete store adapter](../references/inject-external-utility.ts) follows
reactive supplied options without a public update method. Its internal
`core.setOptions` calls synchronize the core in an effect and before operations.
