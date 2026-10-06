# Inputs and types

## Defer reads

`[correctness]` Do not evaluate required inputs or view queries during utility
setup or by accessing the returned ref. Use lazy computations for readable
state and render callbacks for DOM-dependent setup.

```ts
class CounterComponent {
  readonly amount = input.required<number>();
  readonly total = injectTotal(this.amount); // pass the function unread
  // injectTotal(this.amount()) would read before the input is available.
}

function injectTotal(amount: () => number): Signal<number> {
  return computed(() => amount() * 2);
}
```

A lazy computation does not itself make an early read safe. A caller that
invokes the signal before its required input is set still gets the input error.
For view-query-dependent DOM work, defer to `afterRenderEffect`:

```ts
function injectHeight(element: () => HTMLElement): Signal<number | undefined> {
  const height = signal<number | undefined>(undefined);
  afterRenderEffect((onCleanup) => {
    const el = element();
    const observer = new ResizeObserver(() => height.set(el.getBoundingClientRect().height));
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });
  return height.asReadonly();
}
```

The type includes the unmeasured value. This callback-owned measurement is not
an external synchronous store, so copying measurements into a signal is valid.
Render callbacks also keep DOM access off the server.

## Value or function

`[design]` Accept `T | (() => T)` when static values are common and the forms
are unambiguous. Normalize inside a lazy `computed`.

Do not use `typeof value === "function"` when `T` can itself be a callback:
it cannot distinguish the value from a factory returning that value.

## Loose in, strong out

`[design]` Accept reactive arguments as `() => T`, rather than requiring
`Signal<T>`. Return real `Signal<T>` values. A caller can pass
`() => a() + b()` directly without creating an intermediate computed.

## Honest types

`[correctness]` Describe every reachable runtime value. Do not cast away an
unavailable initial value or cast a default selector result to a caller-chosen
type. Use identity and selected-result overloads where their contracts differ:

```ts
function injectSelected<S>(state: () => S): Signal<S>;
function injectSelected<S, R>(state: () => S, select: (state: S) => R): Signal<R>;

const pendingValue = signal<Result | undefined>(undefined);
```
