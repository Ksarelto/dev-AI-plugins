# React state, effects, and performance — detail

The reasoning, corner cases, and re-render bottlenecks behind the state, effect, memoization, and boundary
statements in `rules/react.mdc`. The rule holds the binding statements and is not repeated here.

## State ownership

- When a second consumer appears, lift state one level, to the common parent — never to the root.
- Past 2 levels of drilling, compose with `children` or read from a store or context.
- Pass `children` or a slot prop to keep an expensive subtree out of a re-rendering parent. Composition is
  the primary performance tool under the Compiler — reach for it before memoization.
- Controlled for life means `value` never flips between `undefined` and a defined value.

## Effects

- Derived state is computed inline; `useMemo` only for a profiled hotspot (`rules/react.mdc`).
- Without an out-of-order guard, a slow first response overwrites a fast second. Release the
  `AbortController` (or set the `ignore` flag) in the cleanup.
- StrictMode mounts, unmounts, and remounts every Effect in development. An Effect that breaks on the second
  run is broken in production — fix the cleanup.
- An Effect that writes state its own dependency array reads is a render loop.

## Keys

Index keys plus per-row local state bind the state to the position, not the row — the classic "wrong row
is selected after a delete" bug.

## Memoization

Removing existing memoization can break Effect dependencies, which is why it is not bulk-removed.

## Bottlenecks to design away from

- A provider whose `value` is a fresh object every render re-renders every consumer. Split context by
  concern; keep rapidly-changing values out of a context wrapping a large tree.
- One app-wide store context is a re-render broadcast. One context per concern.
- Virtualize lists past a few hundred rows. Memoizing 10,000 rendered nodes does not fix them.
- Request waterfalls: two sequential `await`s, or a query whose `enabled` waits on another query's data.
  Fire them in parallel, or change the endpoint.
- A top-level import of a heavy library defeats the route split.
- Expensive filtering or a heavy tab switch uses `useDeferredValue` or `useTransition` — not a `setTimeout`
  debounce.

## Corner cases

- Handlers see the props and state of the render that created them. A handler needing a later value reads
  it from a ref.
- `setState` batches. Reading state on the next line returns the old value; use the updater form when the
  next value depends on the current one.
- Portals bubble events through the React tree, not the DOM tree — a click inside a portaled Dialog reaches
  an ancestor's `onClick`.
- Refs hold values that must not trigger a render (DOM nodes, timers).
- A ref callback may return a cleanup function; returning anything else is an error.
- A hook that requires a context throws rather than returning `undefined` and letting the caller crash
  further away from the cause.
- Error boundaries exist so one crash never blanks the app (`error-handling` skill). A hook above the
  boundary throws outside it. Boundaries do not catch async or event-handler errors. `resetKeys` makes
  navigating away clear the error.
- A Suspense boundary reveals its whole subtree at once. Placed too high, one slow query blanks the page —
  put it at the smallest subtree that can wait.

## Habits

- Delete an Effect before adding one; most are derived state or a fetch in disguise.
- One hook, one concern. A hook returning six unrelated values is a module.
- For `useActionState`, `useOptimistic`, `use()` and form actions, follow the React 19 docs; forms in this stack use `rhf-form`.
