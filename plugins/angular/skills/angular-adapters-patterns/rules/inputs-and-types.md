# Inputs and types

Contents: [Defer reads](#defer-reads) · [Value or function](#value-or-function)
· [Loose in, strong out](#loose-in-strong-out) · [Honest types](#honest-types)

## Defer reads

`[correctness]` Required input and view query signals throw if read before their
values are available.

### From the utility side

```ts
// Given
@Component({ ... })
class ExampleComponent {
  element = viewChild.required<ElementRef<HTMLButtonElement>>("element");
  rect = injectBoundingRect(() => this.element().nativeElement);
}

// Incorrect: both initialization and subscription setup read the query too early.
function injectBoundingRectTooEarly(element: () => HTMLElement) {
  const rect = signal(element().getBoundingClientRect());

  const observer = new ResizeObserver(() => {
    const newRect = element().getBoundingClientRect();
    rect.set(newRect);
  });
  observer.observe(element());

  return rect.asReadonly();
}

// Correct: the query and the DOM are read only after render.
function injectBoundingRect(element: () => HTMLElement): Signal<DOMRect | undefined> {
  const rect = signal<DOMRect | undefined>(undefined);

  afterRenderEffect((onCleanup) => {
    const el = element();
    const observer = new ResizeObserver(() => rect.set(el.getBoundingClientRect()));
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  return rect.asReadonly();
}
```

`rect` is `undefined` until the first measurement, and the type says so.
`ResizeObserver` fires only on size changes, so `x` and `y` go stale when the
element moves or the page scrolls; a real utility may return only the size. The
layout read happens after render instead of inside the reactive graph, and on
the server `afterRenderEffect` never runs, so nothing touches the emulated DOM.
Setting `rect` from the observer callback is fine here: DOM measurement is not a
synchronous store, so there is no tracked `getSnapshot` to defer to (see
[track-and-invalidate](external-store.md#track-and-invalidate)).

### From the consumer side

```ts
// Given
function injectMultiplied(value: () => number, mult: number = 2) {
  return computed(() => value() * mult);
}

@Component({ ... })
class CounterComponent {
  value = input.required<number>();
  mult = input.required<number>();

  // Incorrect: calling mult here throws an error.
  resultThatThrows = injectMultiplied(this.value, this.mult());
  // Correct: no input signal is called during initialization.
  resultThatWorks = injectMultiplied(this.value, 2);
}
```

If the multiplier must also work with input signals, rework that argument to
accept a function instead.

## Value or function

`[design]` If it is more ergonomic to accept a value instead of a signal in most
cases, accept both:

```ts
function injectExample(value: number | (() => number)) {
  const wrappedValue = computed(() =>
    typeof value === "function" ? value() : value,
  );
  return wrappedValue;
}
```

Do not use this union when `T` can itself be a function, such as a callback:
`typeof value === "function"` cannot tell a callback passed as the value from a
function that returns one.

## Loose in, strong out

`[design]` When defining an API, prefer loosely typed functions (`() => T`) for
arguments and strongly typed signals for return values. This allows the utility
to be called without an intermediate computed signal.

```ts
// Incorrect
function injectExample(value: Signal<number>): () => number {
  return computed(() => value() + 1);
}
result = injectExample(computed(() => a() + b()));

// Correct
function injectExample(value: () => number): Signal<number> {
  return computed(() => value() + 1);
}
result = injectExample(() => a() + b());
```

## Honest types

`[correctness]` Return types must describe actual values. Do not cast away an
unavailable initial value or cast a default selector result to an arbitrary
caller-chosen type.

**Incorrect (casts promise values that do not exist):**

```ts
const value = signal(undefined as unknown as T);

function injectSelected<S, R = S>(
  state: () => S,
  select: (state: S) => R = () => ({}) as R,
): Signal<R>;
```

What breaks: `value()` is typed `T` but returns `undefined` until something sets
it. `injectSelected<State, { count: number }>(state)` compiles and returns `{}`,
with no `count`.

**Correct (defer the read, or describe the missing value):**

```ts
const value = computed(() => read(source()));
const maybeValue = signal<T | undefined>(undefined);

function injectSelected<S>(state: () => S): Signal<S>;
function injectSelected<S, R>(
  state: () => S,
  select: (state: S) => R,
): Signal<R>;
```
