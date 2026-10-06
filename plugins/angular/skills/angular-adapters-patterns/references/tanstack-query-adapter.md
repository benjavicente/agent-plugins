# TanStack Query's Angular adapter as a shape reference

The maintained Angular Query adapter applies this skill's shape across many
utilities. Use it to see the assembly at production scale. The rules and generic
references are enough to build an adapter without it.

Links are pinned to
[`TanStack/query@4b09f20`](https://github.com/TanStack/query/tree/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src).

| Shape element                                                                                                         | Generic reference                                        | Query source                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Each public utility ends in known fields plus explicit operations                                                     | [inject-external-utility.ts](inject-external-utility.ts) | [query][q] · [infinite query][iq] · [mutation][m-ret]                         |
| A shared base shares state and lifecycle only: it returns a snapshot and a core accessor that applies current options | —                                                        | [base query][bq-get]                                                          |
| Options `computed`, then a lazy untracked core, then an options effect outside the zone                               | [inject-external-utility.ts](inject-external-utility.ts) | [base query][bq-opt] · [mutation][m-opt]                                      |
| Bridge with a tracked `getSnapshot(currentOptions)`; `subscribe` only notifies and is omitted while paused            | [inject-external-store.ts](inject-external-store.ts)     | [base query][bq-store] · [bridge][store]                                      |
| Ancillary utilities as short bridge uses                                                                              | [inject-external-store.ts](inject-external-store.ts)     | [is-fetching][fetching] · [mutation state][m-state] (with `equal`)            |
| Known fields, kept exhaustive against the core type with `satisfies`                                                  | [signal-fields.ts](signal-fields.ts)                     | [field mapper][proxy] · [field lists][fields]                                 |
| Pending state in an effect separate from the snapshot; operations own invocations                                     | [inject-pending-task.ts](inject-pending-task.ts)         | [base query][bq-pending] · [mutation][m-pending]                              |
| Operations run outside the zone and untracked, through the core accessor                                              | [inject-external-utility.ts](inject-external-utility.ts) | [refetch][q-op] · [reset][m-reset]                                            |
| A provider factory in the injection context; an initializer for mount, unmount, and TransferState                     | —                                                        | [configure][prov-config] · [provide][prov-provide]                            |
| Behavioral contracts expressed as test names                                                                          | —                                                        | [bridge tests][t-store] · [field tests][t-proxy] · [pending tests][t-pending] |

Do not copy Query internals into another library's adapter:
`_optimisticResults`, `notifyOnChangeProps`, restoring plumbing, feature
branding, the exact `ngZone.run(cleanup)` release, `toResource`, or schematics.
Status-based type narrowing is a design tradeoff, not a target.

Also do not copy these, even though they appear in the linked lines:

- The [base query bridge][bq-store] calls `lifecycle.setPending(false)` in the
  subscribe cleanup and checks `lifecycle.destroyed` in the notify callback.
  That is stability bookkeeping in the subscription, which
  [task helper guidance](../rules/pending-tasks.md#use-the-helper) rules out.
- `Object.assign(...) as unknown as Create*Result` result casts serve the
  status-narrowing trade-off. Elsewhere they violate
  [honest-types](../rules/inputs-and-types.md#honest-types).
- The [base query][bq-get] returns `[resultSignal, getObserver] as const`. An
  internal helper may return a tuple; an exported utility's ref may not (see
  [named fields](../rules/api-shape.md#named-fields)).
- `signalProxy` is a legacy name. It builds an ordinary object, not a `Proxy`;
  see [ordinary-ref](../rules/api-shape.md#ordinary-ref).

[q]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-query.ts#L183-L191
[iq]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-infinite-query.ts#L162-L200
[m-ret]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-mutation.ts#L143-L152
[bq-get]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-base-query.ts#L97-L106
[bq-opt]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-base-query.ts#L48-L64
[m-opt]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-mutation.ts#L71-L82
[bq-store]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-base-query.ts#L66-L84
[store]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/utils/inject-external-store.ts
[fetching]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-is-fetching.ts#L15-L28
[m-state]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-mutation-state.ts#L68-L78
[proxy]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/utils/signal-proxy.ts#L22-L31
[fields]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/utils/result-fields.ts#L8-L62
[bq-pending]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-base-query.ts#L86-L95
[m-pending]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-mutation.ts#L101-L131
[q-op]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-query.ts#L188-L190
[m-reset]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/inject-mutation.ts#L133-L141
[prov-config]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/providers.ts#L24-L60
[prov-provide]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/providers.ts#L102-L114
[t-store]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/utils/__test__/inject-external-store.test.ts
[t-proxy]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/__tests__/signal-proxy.test.ts
[t-pending]:
  https://github.com/TanStack/query/blob/4b09f205371046ca260956c8ac2503d731f16c66/packages/angular-query/src/__tests__/pending-tasks.test.ts
