# Focused helpers

## One responsibility

`[design]` Share one integration protocol rather than duplicating it per public
utility. A base observer helper can coherently own lazy construction, current
options, snapshot bridging, and subscription lifetime. Related utilities often
share that protocol.

Keep utility-specific options, state-field lists, and operations visible at the
entry points. Split helpers that combine unrelated policies, discover the API
dynamically, or obscure who owns a resource. Do not make a universal ref builder
just because several utilities return signals.

Keep helpers out of the public barrel; follow the package's established layout
for where they live. The
[complete store adapter](../references/inject-external-utility.ts) shows option
composition and operations remaining visible beside a shared bridge.

## Direct return

`[design]` Return the ref directly or with a simple spread; avoid staged
assignment and descriptor mutation.

## Nodes need consumers

`[design]` Use signals for reactively consumed values. Reuse existing signals
instead of pass-through computeds, and avoid duplicate subscriptions.

An imperative ownership handle or options history need not be a signal. Keep
such bookkeeping only when a concrete lifecycle contract requires it; do not
mirror a computed merely to discover whether it was read.
