# Best practices — correctness, performance, security, resilience

Applies to every changed `.ts` / `.tsx`. A finding states the failing input or condition. Do not
report a hypothetical you cannot trace to a line of the diff.

## Correctness

- Out-of-order async: an effect or handler that sets state after an `await` without an `ignore`
  flag or `AbortController`; a mutation result applied to the wrong row after a fast second click.
- Stale closures in handlers and effects; a missing or extra dependency; an effect that writes what
  its own dependencies read (render loop).
- Keys: index or `${…}-${index}` keys on reorderable lists; unstable keys (`Math.random()`).
- `&&` with a number or string on the left; `null` versus `undefined` mixed for "absent".
- Unhandled `null` from a parsed response (`api-contract`): a caller that dereferences without the check.
- Date, number, and currency formatting by hand instead of the i18n formatters.
- Non-exhaustive handling of a union: a `switch` without an exhaustive `never` check.

## Performance

- Request waterfalls: sequential `await`s or dependent queries that could run in parallel; N+1
  fetches in a list item component.
- Server data refetched on every render or keyed by an unstable object.
- A long list without virtualisation or pagination; a heavy component not lazy-loaded at the route
  (`lazyFeature`).
- Work in the render body (sort, filter, `JSON.parse` of a large value) repeated per render.
- Whole-store subscriptions (`useStore()` without a selector / `useShallow`).
- Large dependency added for one function; unpruned icon or locale imports.
- Images without dimensions or lazy loading.

## Security

- User-controlled data in `dangerouslySetInnerHTML`, `href`/`src` (`javascript:`), `eval`, or a
  dynamically built URL path without encoding.
- Secrets, tokens, or API keys in source; `import.meta.env.VITE_*` carrying a private key; a raw
  token read outside `shared/api` / `shared/lib/auth/token.ts` or stored in `localStorage`.
- Authorisation decided in the UI only: hidden button, no server check. Flag that the server must
  enforce it.
- PII or tokens written to logs, toasts, or query keys.
- `target="_blank"` without `rel="noopener noreferrer"`; an open redirect built from a query param.

## Resilience and UX states

- Every data view has loading, empty, error, and success states; a mutation has pending and failure
  feedback; a destructive action asks for confirmation.
- Errors flow through `AppError` and the shared notification path; none swallowed by an empty
  `catch`.
- Forms: disabled while submitting, server field errors mapped to fields, no double submit.
- Network-dependent code is retry-safe and idempotent where the user can repeat it.

## Maintainability

- Names state intent; a boolean reads as a predicate (`isOpen`, `canSubmit`); handlers are `handleX`;
  hooks are `useX`.
- Public functions have explicit return types; no `any`, no `as` to silence an error.
- No dead code, unused exports, commented-out code, or `console.log`.
- A new behavior without a behavior test, a test that asserts implementation detail, or a mock of an
  internal `shared/ui` primitive (`rules/testing.mdc`).
- Accessibility belongs to every interactive element — see `accessibility.md`.
