# Public API shape

Contents: [Ordinary ref](#ordinary-ref) ·
[Never return an array](#never-return-an-array) · [Known fields](#known-fields)
· [Explicit operations](#explicit-operations) ·
[Sibling concepts](#sibling-concepts) · [Options factory](#options-factory)

## Ordinary ref

`[correctness]` Expose changing state as `Signal<T>` properties and operations
as plain methods.

The ref contract and the `ExampleRef` example are in SKILL.md › Ref shape.

Prefer building the public API as an ordinary object with explicit signal
properties and methods. Avoid forwarding the core instance through a `Proxy`.
Declare the public fields without reading the source. Do not discover the API by
reflecting over an instance or copying its descriptors.

**Incorrect (fields are discovered by reading the snapshot):**

```ts
const ref = new Proxy({} as Record<PropertyKey, unknown>, {
  get(target, key) {
    if (key in target) return target[key];
    const field = untracked(snapshot)[key];
    if (typeof field === "function") return field;
    return (target[key] = computed(() => snapshot()[key]));
  },
  ownKeys: () => Reflect.ownKeys(untracked(snapshot)),
});
```

What breaks: accessing, destructuring, or spreading the ref evaluates the
snapshot. In a field initializer whose options read a required input, that
throws. The public fields also change with whatever the current state happens to
contain.

This shows up when utilities compose in field initializers. Passing an input or
a signal reference reads nothing; accessing a field on a `Proxy` ref does:

```ts
@Component({ ... })
class PriceComponent {
  amount = input.required<number>();

  // Works: the input is passed unread.
  total = injectMultiply(this.amount);
  // Breaks with the Proxy ref: `this.total.value` evaluates the snapshot, which
  // reads `amount()` before inputs are set.
  doubled = injectMultiply(this.total.value);
}
```

With declared fields, `this.total.value` is already a `Signal<number>`, so
passing it reads nothing and both lines work. Calling it, as in
`injectMultiply(this.total.value())`, still reads too early.

**Correct (declared fields; nothing reads the snapshot during setup):**

```ts
return {
  value: computed(() => snapshot().value),
  status: computed(() => snapshot().status),
  next,
};
```

## Never return an array

`[design]` An exported utility's ref is an object of named fields, never a
tuple. Angular callers store the ref in a class field, `menu = injectMenu()`,
and use it from there. Neither an object nor a tuple can be destructured into
class fields, but a stored object keeps names at the access site (`menu.open()`)
while a stored tuple forces indices (`toggle[0]()`). React and Solid return
tuples like `[value, setValue]` because callers destructure them in a function
body.

This applies to the returned ref only. A state field may be an array, as in
`Signal<Todo[]>`, and internal helpers may return tuples.

**Incorrect (a React-style tuple):**

```ts
function injectToggle(initial = false): [Signal<boolean>, () => void] {
  const open = signal(initial);
  return [open.asReadonly(), () => open.update((value) => !value)];
}

class MenuComponent {
  toggle = injectToggle();
  open = this.toggle[0];
  flip = this.toggle[1];
}
```

What breaks: positions replace names. Templates read `toggle[0]()`, callers
re-alias each element into its own field, and inserting or reordering an element
silently changes what every caller gets.

**Correct (an ordinary ref of named fields):**

```ts
function injectToggle(initial = false) {
  const open = signal(initial);
  return {
    open: open.asReadonly(),
    toggle: () => open.update((value) => !value),
  };
}

class MenuComponent {
  menu = injectToggle(); // template: menu.open(), (click)="menu.toggle()"
}
```

When a sibling adapter returns a tuple, map it to named fields; that is an
Angular difference [sibling concepts](#sibling-concepts) allows.

## Known fields

`[design]` For repeated field mapping, use a small
[signalFields](../references/signal-fields.ts) helper with an explicit list of
state fields. It creates an ordinary object of lazy signals without reading the
snapshot. Keep operations outside the mapping, as in the spread example in
SKILL.md.

## Explicit operations

`[correctness]` Define operations outside snapshot computations instead of
forwarding function-valued snapshot fields.

**Incorrect (the operation is copied from each snapshot):**

```ts
const state = computed(() => {
  const result = snapshot();
  return {
    ...result,
    reload: () => {
      core().setOptions(options());
      return result.reload();
    },
  };
});
```

What breaks: every snapshot creates a new `reload`. A method that was retained
or destructured earlier is a different function, bound to an older snapshot, and
the operation is only reachable by reading state.

**Correct (one method, defined once):**

```ts
const reload = () =>
  untracked(() => {
    const current = core();
    current.setOptions(options());
    return current.reload();
  });
```

`outsideZone` is omitted for brevity; see
[outside-zone](operations.md#outside-zone).

## Sibling concepts

`[design]` When other framework adapters exist, follow their API concepts,
names, arguments, and operations closely. Differences should serve Angular's
reactivity and lifecycle: expose signals and methods instead of React
render-time values or Vue/Solid getter-based state. Avoid extra overloads or
runtime argument guessing just to accommodate Angular.

## Options factory

`[design]` Input: accept reactive options as one options factory, such as
`() => ({ wait: delay() })`, instead of requiring getter-property objects
(`{ get wait() { … } }`). This follows Angular's own options APIs, such as
[`httpResource(() => ({ url, … }))`](https://angular.dev/api/common/http/httpResource)
and [`resource({ params: () => … })`](https://angular.dev/api/core/resource).

Output: return individual signals for commonly used fields, as
[ResourceRef](https://angular.dev/api/core/ResourceRef) and Signal Forms'
[FieldState](https://angular.dev/api/forms/signals/FieldState) do, rather than
only one signal of the whole state.
