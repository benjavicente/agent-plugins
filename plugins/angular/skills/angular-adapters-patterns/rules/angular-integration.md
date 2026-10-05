# Angular integration

Contents: [Choose effects](#choose-effects) · [Modern APIs](#modern-apis) ·
[Attribute selectors](#attribute-selectors) · [Errors](#errors) ·
[State vs events](#state-vs-events) · [Hydration](#hydration) ·
[Providers](#providers) · [Provider factory](#provider-factory) ·
[Version support](#version-support) · [Private fields](#private-fields)

## Choose effects

`[correctness]` Use [effect](https://angular.dev/api/core/effect) for side
effects that should run on both the client and server. Use
[afterRenderEffect](https://angular.dev/api/core/afterRenderEffect) for DOM
work: it runs only on the client, after normal effects and rendering. Choose
explicit [render phases](https://angular.dev/guide/signals/effect#render-phases)
to control the order of DOM reads and writes.

## Modern APIs

`[design]` Prefer Angular's current APIs over the older ones they replace. The
main reason is composition: `effect`, `afterRenderEffect`, `afterNextRender`,
`afterEveryRender`, and `DestroyRef` work from any function called in an
injection context. Setup can therefore be extracted into reusable `inject*`
helpers, called from a constructor or field initializer, instead of being tied
to a class's lifecycle hooks or a base class. Signal inputs and queries stay
class fields, but helpers can take them as arguments. All of these are stable
within the [version floor](#version-support):

- Signals for state and refs, not Observables or `BehaviorSubject`. Keep
  Observables for event streams; see [state vs events](#state-vs-events).
- `output()` instead of `@Output()` with `EventEmitter`: typed, decorator-free,
  and no RxJS subject behind it.
- `viewChild`, `viewChildren`, `contentChild`, and `contentChildren` instead of
  the decorator queries. Results are signals that `computed` and effects track,
  and the `.required` variants fail loudly instead of being `undefined`; see
  [defer reads](inputs-and-types.md#defer-reads).
- The `host` object in the component or directive decorator instead of
  `@HostBinding` and `@HostListener`: bindings are template expressions in one
  place.
- `afterNextRender`, `afterEveryRender`, and `afterRenderEffect` instead of
  `ngAfterViewInit` or `ngAfterViewChecked` for DOM work. Pick among them and
  `effect` as in [choose effects](#choose-effects).
- `input()` and `model()` instead of `@Input()`, and reactive primitives instead
  of the remaining lifecycle hooks where they cover the job. There is no 1:1
  mapping; replace what the hook did:
  - `ngOnChanges` reacting to inputs: read input signals in a `computed`, or in
    an `effect` for side effects.
  - `ngOnInit` setup: field initializers or the constructor when nothing reads
    inputs; a `computed` or `effect` when it does, since inputs are not set yet
    during construction (see [defer reads](inputs-and-types.md#defer-reads)).
  - `ngOnDestroy`: `DestroyRef.onDestroy`, or an effect's `onCleanup` for
    resources that are replaced; see
    [owner vs effect cleanup](lifecycle.md#owner-vs-effect-cleanup).

**Incorrect (decorators and lifecycle hooks):**

```ts
@Component({ ... })
class Menu {
  @Output() changed = new EventEmitter<number>();
  @ViewChild("panel") panel?: ElementRef<HTMLElement>;
  @HostBinding("class.open") open = false;

  ngAfterViewInit() {
    measure(this.panel!.nativeElement);
  }
}
```

What it costs: the query and host state are not signals, so `computed` and
effects cannot track them. `ngAfterViewInit` also runs during server rendering,
where there is no real DOM to measure.

**Correct (signal APIs, `host`, and render callbacks):**

```ts
@Component({ ..., host: { "[class.open]": "open()" } })
class Menu {
  readonly changed = output<number>();
  readonly panel = viewChild.required<ElementRef<HTMLElement>>("panel");
  readonly open = signal(false);

  constructor() {
    afterNextRender(() => measure(this.panel().nativeElement));
  }
}
```

## Attribute selectors

`[design]` For components that wrap or style a native element, prefer an
attribute selector on that element, such as `button[my-button]`, over a custom
element such as `my-button`. The host is then the real element: native
attributes, events, focus, and form behavior apply directly. A custom-element
host has no semantics and its own default styling, and usage-site attributes
land on it instead of the inner element, so each one has to be re-declared and
forwarded. For other elements, an attribute on a `div` or the native tag gives
the same control of the host without an extra wrapper.

**Incorrect (attributes land on the wrapper, not the button):**

```ts
@Component({
  selector: "my-button",
  template: `<button [disabled]="disabled()"><ng-content /></button>`,
})
class MyButton {
  readonly disabled = input(false);
}

// <my-button type="button" [disabled]="busy">Cancel</my-button>
// `type` lands on <my-button>; inside a form, the inner <button> stays "submit".
// `disabled` works only because it was re-declared as an input and forwarded.
```

**Correct (the host is the button):**

```ts
@Component({ selector: "button[my-button]", template: `<ng-content />` })
class MyButton {}

// <button my-button type="button" [disabled]="busy">Cancel</button>
```

## Errors

`[correctness]` Error handling belongs to the user of the utility. Hand failures
to them as error/status signals or through the operation's return value, so they
decide how to show, retry, or report each one. Forwarding library failures to
`ErrorHandler` or `NgZone.onError` makes that decision for them. It bypasses
however they wired errors up and reports every failure globally.

A computed may throw when its value cannot be read, as with
[Resource.value](https://angular.dev/api/core/Resource#value). An operation may
throw or reject when it cannot continue. Both leave the failure with the caller.
Do not throw from subscription callbacks.

A throwing read has a cost: a template that reads it reports the error to
`ErrorHandler` anyway. It stays the user's choice only with a non-throwing
guard, as `Resource` pairs `value()` with `hasValue()` and `error()`. Pair a
throwing read with a guard such as `error()` or `hasValue()`. Users can also
catch errors thrown by signal reads in a template region with an
[`@boundary`](https://angular.dev/guide/templates/error-boundaries) block, which
is in developer preview since Angular 22.2. A boundary may still notify
`ErrorHandler`, so it does not replace the non-throwing guard.

This covers library failures, which belong in state. Unexpected exceptions in
subscription setup or cleanup are not library failures; letting them follow
Angular's normal effect error handling, as the
[reference bridge](../references/inject-external-store.ts) does, is fine.

**Incorrect (the subscription reports library failures globally):**

```ts
const errorHandler = inject(ErrorHandler);

subscribe: (notify) =>
  current.subscribe((result) => {
    if (result.error) errorHandler.handleError(result.error);
    notify();
  }),
```

What breaks: the user may already handle this failure, for example by showing a
rejected request inline. It still reaches global error reporting, possibly on
every notification, and the user cannot opt out. Throwing there instead breaks
the notification path rather than letting the caller recover through state.

**Correct (failures are state the user handles; a throwing read is a documented
choice):**

```ts
const error = computed(() => snapshot().error);
const value = computed(() => {
  const { error, value } = snapshot();
  if (error) throw error;
  return value;
});
```

## State vs events

`[design]` Use signals for current state and callbacks or Observable streams for
events where every occurrence matters. Signals keep only the latest value and
coalesce writes, so two quick events become one.

## Hydration

`[correctness]` If a library supports server-side rendering and needs to reuse
server state on the client, use
[TransferState](https://angular.dev/api/core/TransferState) to serialize that
state on the server and restore it during client hydration:

```ts
if (isPlatformServer(platformId)) {
  transferState.onSerialize(KEY, () => core.dehydrate());
} else {
  const state = transferState.get(KEY, null);
  if (state) {
    core.hydrate(state);
    transferState.remove(KEY);
  }
}
```

- Serialize lazily with `onSerialize`, so the state is captured at stability,
  not when the provider runs.
- Remove the key after reading it, so it is not applied again.
- Only serialize data that is safe to embed in the HTML.

## Providers

`[design]` Add provider functions only for state that a provider tree shares.
That can be app-wide, such as a shared client, or scoped, such as default
options for one component's subtree:

```ts
export function provideCounterDefaults(defaults: Partial<Options>): Provider[] {
  return [{ provide: COUNTER_DEFAULTS, useValue: defaults }];
}

@Component({ providers: [provideCounterDefaults({ step: 5 })] })
class FastCounter {}
```

The utility reads the nearest value and merges it between built-in defaults and
supplied options, keeping
[visible precedence](options-and-construction.md#visible-precedence):

```ts
const COUNTER_DEFAULTS = new InjectionToken<Partial<Options>>(
  "COUNTER_DEFAULTS",
);

// in the utility:
const defaults = inject(COUNTER_DEFAULTS, { optional: true });
const resolvedOptions = computed(() => ({
  step: 1,
  ...defaults,
  ...wrappedOptions(),
  ...overrides(),
}));
```

The nearest provider replaces outer ones; it does not deep-merge with them.
Merge explicitly, for example by injecting the parent value with
`{ skipSelf: true, optional: true }`, if nested defaults should combine. Use
`provideEnvironmentInitializer` only when something must run in the injection
context at initialization, such as mounting a client or registering
TransferState serialization; values and factories do not need it. It returns
`EnvironmentProviders`, which component `providers` cannot accept, so keep
scoped providers to plain `Provider[]`. Utilities without shared state need no
provider.

## Provider factory

`[correctness]` Accept a factory for an app-level client, not a constructed
instance. Call it from `useFactory`, which runs once per injector in an
injection context, so the factory can call `inject()` itself.

**Incorrect (the instance is built when the provider list is defined):**

```ts
export function provideClient(client: Client): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: Client, useValue: client }]);
}

// app.config.ts
export const appConfig = { providers: [provideClient(new Client())] };
```

What breaks: on the server, `app.config.ts` is evaluated once per process, so
every request bootstraps with the same `Client`. Its cache and serialized state
leak between requests and users. The value also cannot `inject()` anything;
passing dependencies in, or a `deps` array, only works around that.

**Correct (a factory runs per injector, in an injection context):**

```ts
export function provideClient(factory: () => Client): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: Client, useFactory: factory },
    provideEnvironmentInitializer(() => {
      const client = inject(Client);
      client.mount();
      inject(DestroyRef).onDestroy(() => client.unmount());
    }),
  ]);
}

// app.config.ts
export const appConfig = {
  providers: [provideClient(() => new Client({ http: inject(HttpClient) }))],
};
```

Each request's environment injector creates its own `Client`. The initializer is
also where the [hydration](#hydration) code runs. If the client starts timers,
run the factory [outside the zone](operations.md#outside-zone).

## Version support

`[design]` Prefer APIs available in Angular versions within their
[long-term support (LTS) window](https://angular.dev/reference/releases#support-window).
Supporting older versions is fine when the same primitives work without added
complexity. When newer supported APIs significantly simplify the adapter, prefer
raising the minimum Angular version over maintaining compatibility workarounds.

The references assume Angular 20.1 or later: they use `DestroyRef.destroyed`
(20.1), stable `linkedSignal`, `afterRenderEffect`, and `PendingTasks`, and the
`PendingTasks.run` semantics described in
[manual release](pending-tasks.md#manual-release). TanStack Query's Angular
adapter requires `@angular/core >=20.1.0`.

## Private fields

`[design]` In classes, such as cores, services, and providers, use ECMAScript
`#private` fields instead of the TypeScript `private` keyword. Refs are plain
objects and have no private fields. Minifiers can shorten `#private` names,
which can reduce bundle size. This assumes an ES2022 target; below it,
TypeScript downlevels `#x` to WeakMaps.
