# Focused helpers

Contents: [One responsibility](#one-responsibility) ·
[Direct return](#direct-return) · [Nodes need consumers](#nodes-need-consumers)

## One responsibility

`[design]` Give each helper one clear responsibility. Keep option composition
and explicit operations visible in the utility. A helper that combines
construction, option overrides, state synchronization, execution, and disposal
should be split or removed; a long argument list and a broad return object are
signs to reconsider the abstraction. A helper may map known state fields, but
should not also build the facade, forward methods, merge options, and own
disposal.

## Direct return

`[design]` Prefer a direct object return or a simple spread over staged
assignment and descriptor mutation.

## Nodes need consumers

`[design]` Use signals for values consumed reactively. Initialization flags such
as `used` and imperative options history do not become reactive state merely by
storing them in signals. Reuse existing signals instead of adding pass-through
computeds. Avoid redundant reactive nodes and duplicate subscriptions.
