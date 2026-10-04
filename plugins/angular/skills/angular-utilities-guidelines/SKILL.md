---
name: angular-utilities-guidelines
description: Guidelines to implement Angular utilities
---

# Angular Rules

## Working with input signals

Required input and view query signals throw if read before their values are available.

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

// Correct: the signal is read later.
function injectBoundingRect(element: () => HTMLElement) {
  const rect = linkedSignal(() => element().getBoundingClientRect());

  afterRenderEffect((onCleanup) => {
    const el = element();
    const observer = new ResizeObserver(() => {
      const newRect = el.getBoundingClientRect();
      rect.set(newRect);
    });
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  return rect.asReadonly();
}
```

`linkedSignal` calculates the initial rectangle lazily. Read `rect` once the view query is available. This example assumes a browser environment.

If it is more ergonomic to accept a value instead of a signal in most cases, accept both:

```ts
function injectExample(value: number | (() => number)) {
  const wrappedValue = computed(() => (typeof value === "function" ? value() : value));
}
```

For complicated or repeated store subscriptions, consider creating an [`injectExternalStore`](references/inject-external-store.ts) utility.

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

If the multiplier must also work with input signals, rework that argument to accept a function instead.

## Injection context

Functions that depend on the injection context should be prefixed with `inject` and should not accept an explicit injector argument.

This makes the dependency on the injection context explicit.

In the rare cases when a different injection context is needed, use `runInInjectionContext` rather than passing an injector manually. Those cases can indicate API design issues.

Assert the injection context on a branch that can be removed during minification, so the production build can drop the assertion and its function name.

```ts
function injectSomething() {
  if (typeof ngDevMode === "undefined" || ngDevMode) {
    assertInInjectionContext(injectSomething);
  }
}
```

## Signal types

When defining an API, prefer loosely typed signals for arguments and strongly typed signals for return values. This allows the utility to be called without an intermediate computed signal.

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

## Private fields

Use ECMAScript `#private` fields instead of the TypeScript `private` keyword. Minifiers can shorten `#private` names, which can reduce bundle size.
