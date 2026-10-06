# Angular integration

## Choose effects

`[correctness]` Use [effect](https://angular.dev/api/core/effect) for non-DOM
work on both client and server. Use
[afterRenderEffect](https://angular.dev/api/core/afterRenderEffect) for DOM work
that should run only on the client. Read reactive inputs in the tracked part;
perform imperative core calls and callback delivery untracked. Apply a
[zone boundary](operations.md#outside-zone) where supported zone-based scheduling
needs isolation.

Choose explicit [render phases](https://angular.dev/guide/signals/effect#render-phases)
when ordering DOM writes and measurements. Use `afterNextRender` for one-time
DOM setup and `afterEveryRender` when the work must follow every render.

## Modern APIs

`[design]` Prefer modern Angular APIs within the adapter's
[supported version range](#version-support). They compose in reusable helpers
instead of requiring lifecycle hooks or a base class:

- Signals and computeds for state; keep Observables for event streams as in
  [state vs events](#state-vs-events).
- [`input()`](https://angular.dev/guide/components/inputs) and `model()` for
  inputs, and [`output()`](https://angular.dev/guide/components/outputs) for
  outputs, instead of `@Input()` or `@Output()` with `EventEmitter`.
- [`viewChild`, `viewChildren`, `contentChild`, and `contentChildren`](https://angular.dev/guide/components/queries)
  instead of decorator queries. Use required queries when absence should be an
  error; defer reads until their results are available.
- The [`host` object](https://angular.dev/guide/components/host-elements)
  instead of `@HostBinding` and `@HostListener`.
- Render callbacks/effects for DOM work instead of `ngAfterViewInit` and
  `ngAfterViewChecked`; see [choose effects](#choose-effects).
- Field initializers or constructors for setup that does not read inputs;
  `computed` for derivation and `effect` for input-driven side effects instead
  of `ngOnInit` or `ngOnChanges` where they cover the job.
- `DestroyRef.onDestroy` for lifetime cleanup and effect `onCleanup` for
  replaced resources instead of `ngOnDestroy`.

These are replacements by responsibility, not a mechanical hook-to-function
mapping. Inputs and signal queries remain component/directive class fields;
helpers accept them unread. Effects, render callbacks, and `DestroyRef` can be
composed from functions called in an injection context.

```ts
@Component({
  selector: "div[my-panel]",
  template: `<div #content><ng-content /></div>`,
  host: { "[class.open]": "open()" },
})
class Panel {
  readonly open = input(false);
  readonly measured = output<number>();
  readonly content = viewChild.required<ElementRef<HTMLElement>>("content");

  constructor() {
    afterNextRender(() => {
      this.measured.emit(this.content().nativeElement.getBoundingClientRect().height);
    });
  }
}
```

Construction creates the references; the render callback reads the query and
measures DOM on the client. See [defer reads](inputs-and-types.md#defer-reads)
for required inputs and query-dependent helpers.

## Attribute selectors

`[design]` For components that wrap or style a native element, prefer an
attribute selector such as `button[my-button]`. The host then supplies native
attributes, events, focus, and form behavior directly. A wrapper element
requires forwarding those contracts to its inner native element.

```ts
// A wrapper would need to forward type, disabled, focus, and other button APIs.
@Component({ selector: "button[my-button]", template: `<ng-content />` })
class MyButton {}

// <button my-button type="button" [disabled]="busy">Cancel</button>
```

Choose the native host appropriate to the library's semantics; this preference
does not require an arbitrary native tag when the component has no such role.
This rule evaluates components that introduce a wrapper around the intended
native host. Directives already attach to an existing host and do not introduce
that wrapper; exclude them from this rule's applicability score. An attribute
directive is not evidence that a separate component follows this preference.

Usage-site classes/styles combine with component host styling through
[Angular's class and style bindings](https://angular.dev/guide/templates/binding#css-class-and-style-property-bindings).
For example, `<button my-button class="wide">` retains `wide` alongside host
classes. For the same class or style property, a usage-site binding takes
precedence over the component's host binding; Angular's
[styling implementation](https://github.com/angular/angular/blob/main/packages/core/src/render3/instructions/styling.ts)
handles that priority separately from ordinary properties/attributes.
For overlapping attribute/property bindings, follow the
[host binding collision rules](https://angular.dev/guide/components/host-elements#binding-collisions):
dynamic beats static, the usage site wins between static values, and the
component wins between dynamic values. Avoid forwarding wrappers that change
where usage-site attributes or styles apply.

## Errors

`[correctness]` Expose expected library failures through state, callbacks, or an
operation's return value. Do not send them from subscriptions to `ErrorHandler`
or `NgZone.onError`, or throw them from notification callbacks.

A deliberately throwing read must have a non-throwing guard, such as `error()`
or `hasValue()`, so the caller can choose whether to read it:

```ts
const error = computed(() => snapshot().error);
const value = computed(() => {
  const current = snapshot();
  if (current.error) throw current.error;
  return current.value;
});
```

An unguarded template read can still reach Angular's global error handling.
Unexpected setup/cleanup exceptions may follow Angular's normal effect error
handling; these are distinct from an expected rejected operation. Preserve any
requested throwing API explicitly rather than inventing global reporting.

## State vs events

`[design]` Signals represent current state. Use callbacks or Observables for
events where each occurrence matters; signal writes can coalesce occurrences.
Do not interpret observing an operation's status as delivering its callbacks.

## Hydration

`[correctness]` When SSR state reuse is in scope, use
[TransferState](https://angular.dev/api/core/TransferState) with the core's
serialization and hydration API. Restore before consumers start client work:

```ts
if (isPlatformServer(platformId)) {
  transferState.onSerialize(KEY, () => core.dehydrate());
} else if (transferState.hasKey(KEY)) {
  const state = transferState.get(KEY, null);
  transferState.remove(KEY);
  if (state !== null) core.hydrate(state);
}
```

Serialize lazily so completed server work is captured. Consume the client key
once, and serialize only state safe to embed in HTML. Distinct clients need
keys that do not collide.

Provider-owned hydration is sufficient for server-to-client reuse. Add a
separate runtime hydration API only when required. If such an API accepts
reactive state/options, define replay semantics from the core's idempotence:
changing hydration options must not accidentally reapply non-idempotent state.

## Providers

`[design]` Provide state shared through the injector tree, such as a client or
scoped defaults. Utilities without shared state need no provider.

The nearest defaults provider wins. Merge its value between built-in defaults
and supplied options. Nested providers do not deep-merge automatically; combine
with a parent injected using `skipSelf` only when the API requires that behavior.

Use plain `Provider[]` for component-scoped providers.
`provideEnvironmentInitializer` produces `EnvironmentProviders`; use it for
environment setup that must execute, such as client mount and TransferState
registration, rather than for ordinary values/factories.

## Provider factory

`[correctness]` For a new app-level client provider, accept a factory and invoke
it through `useFactory` in the owning injector. A client constructed once in
module-level app config may otherwise share cache state across SSR requests.
The caller's factory can itself use `inject()`:

```ts
export function provideClient(factory: () => Client): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: Client, useFactory: factory },
    provideEnvironmentInitializer(() => {
      const client = inject(Client);
      const owner = inject(DestroyRef);
      client.mount();
      owner.onDestroy(() => client.unmount());
      // Register TransferState serialization or consume client state here.
    }),
  ]);
}

const providers = [
  provideClient(() => new Client({ http: inject(HttpClient) })),
];
```

The factory must create request-local state; wrapping a preconstructed singleton
in `() => singleton` does not isolate it. Keep factory, mount, hydration, and
cleanup outside NgZone when supported zone-based scheduling needs isolation;
see [outside zone](operations.md#outside-zone). For an existing API
that must accept instances, preserve it and document the caller's SSR ownership
responsibility instead of silently breaking its signature.

## Version support

`[design]` Prefer APIs available in Angular versions within their
[LTS window](https://angular.dev/reference/releases#support-window), while
honoring the project's supported range. Older versions are reasonable when
the same primitives work without added complexity. When a newer supported
API significantly simplifies the adapter and changing the minimum is in scope,
prefer raising that minimum over maintaining compatibility workarounds.

The generic TypeScript references assume Angular 20.1 or later. Treat that as
the examples' floor, not an instruction to silently change a package's support
policy. Verify API availability against the range the adapter actually supports.

## Private fields

`[design]` Prefer ECMAScript `#private` fields in classes such as services,
components, and adapter-owned cores over the TypeScript `private` keyword.
They enforce privacy at runtime and their names can be shortened by minifiers.
Plain refs remain ordinary objects and have no private fields.

Consider the compilation target: ES2022 preserves native private fields;
older targets may require downlevel helpers and additional output.
