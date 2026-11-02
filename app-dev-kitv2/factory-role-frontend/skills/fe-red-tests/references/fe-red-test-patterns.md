# Frontend red-test patterns

How a red test and its stub look per task type in the React FSD stack, and why a red is valid or
not. The test style itself (render wrapper, queries, user events, file layout) is
`frontend-dev-kit:testing` and `rules/testing.mdc`; the mocking boundaries are its
`references/mock-patterns.md`. This file covers only what the red phase adds.

## What gate-red accepts

| Result of a red test | Verdict | Fix |
|---|---|---|
| Fails on `expect(...)`, a Testing Library lookup ("Unable to find an element with the text …") or `not implemented` | valid red | — |
| Passes | `passes-before-implementation` | The behaviour exists already or the assertion is too weak: assert the new value |
| Skipped / todo | `skipped-red-test` | Remove `skip`, `todo`, `only`; every test runs |
| File fails to load (`Cannot find module`, `is not exported`, `SyntaxError`) | `does-not-load` | Add the stub at the import path the test uses |
| `is not a function`, `is not a constructor`, `ReferenceError` | `wrong-failure` | The stub is missing or has the wrong shape |
| Timeout, `ECONNREFUSED`, env/zod config error | `wrong-failure` | Mock the HTTP boundary; never wait on an unresolved promise |
| Tests or stubs do not type-check | `tests-do-not-compile` | Give the stub its full typed signature |
| Another existing test now fails | `existing-test-broken` | An existing function keeps today's behaviour under the new parameter |

## Stubs per task type

A stub is the smallest typed declaration that lets the test load. It lives at the path in T0
(`stubs` / `files_expected`), with the final export name and signature, and either throws or returns
an empty result that makes the assertion fail.

| Task type | Stub | The red test asserts |
|---|---|---|
| `entity-model` | `export function toCoupon(dto: CouponDto): Coupon { throw new Error("not implemented") }` and the zod schema export | mapped fields and an invalid body → `null` |
| `api-client` | fetcher `export async function applyCoupon(code: string): Promise<Coupon \| null> { throw new Error("not implemented") }` | the endpoint path and body sent to the mocked `httpClient`, the parsed result |
| `query-hook` | `export function useApplyCoupon(): UseMutationResult<…> { throw new Error("not implemented") }` | `renderHook` with the real query client: data after success, `isError` after a mocked failure, invalidation of the listed keys |
| `component` | `export function CouponField(props: CouponFieldProps): JSX.Element { throw new Error("not implemented") }` | each state by role and translated text |
| `feature-ui` | the entry and content components, same shape | the four states plus pending, the boundary fallback on a thrown child |
| `form` | the form component; field config as an empty typed array | required-field messages after submit, the mutation called with the typed values, disabled while pending |
| `page` / `route` | the page component and its default export | the route renders the page at its path; a guard redirects |
| `store` | the store factory returning the typed initial state | actions change state; selectors derive the value |
| `i18n` | keys in `keys.ts` with an empty `en.json` entry | the rendered English value (the locale value, not the key) |

A component that returns `null` instead of throwing is also a valid stub when the test looks the
element up by role; either fails on the lookup. Never return the real markup.

## One test per planned case

- Name each test with the AC id and the observable outcome:
  `it("AC-0002 shows 'This coupon has expired' under the field", …)`.
- Use the exact values from the AC text and the story's Gherkin: amounts, messages, limits, codes.
- One planned case in `test-plan.yaml` (`level: unit` or `component`) is at least one `it`. A case
  with several examples may use `it.each`, one row per example.
- AC `kind` decides the shape: `happy` → success state and data; `error` → the failure message and
  that the previous state is kept; `edge` → the boundary value on both sides; `permission` → the
  control absent or disabled for the role; `nfr` → only what a unit test can measure (an
  `aria-label`, a focus move, a call count bound); anything else belongs to QA, say so in the summary.

## Component tests for each state

Every state of the surface the UX notes list gets its own test, driven through the mocked boundary:

| State | How the test gets there | Assert |
|---|---|---|
| loading | fetcher mock returns a never-settling promise for that one test, assertion synchronous | the skeleton's `role="status"` |
| error | fetcher mock rejects with the `AppError` the contract names | the translated error text, the retry button |
| empty | fetcher mock resolves `[]` / `null` | the empty text and its next action |
| success | fetcher mock resolves the AC's example values | the values as the user reads them (formatted) |
| pending | `userEvent` triggers the mutation, mock not yet resolved | the submit control is disabled |

The loading test asserts without awaiting the unresolved promise; awaiting it is a timeout, which is a
wrong failure.

## i18n assertions

Assert the English text from the slice's `en.json` (or `common`), never the key: import the locale
value or write the literal sentence from the AC. A test that finds `couponKeys.errors.expired` on the
screen passes against a missing translation and hides the bug. When the AC wording and the locale
value differ, the AC wins: the test asserts the AC wording, and the builder writes it into `en.json`.

## Mocking at the boundary

- Inside the slice that owns the fetcher: mock its `api/fetchers` with `importOriginal` and override
  one export. Anywhere else: mock `httpClient` from `@/shared/api/base`.
- Keep real: the query client, entity hooks, i18n, `@/shared/ui/*`, child components.
- Never mock another slice's `api/` or `index.ts` (`cross-slice-mock` fails the gate later).
- Router and browser APIs (`matchMedia`, clipboard) may be mocked.

## Characterisation tests

Pin today's behaviour, not the desired one: render the current component or call the current
function with representative inputs and assert exactly what it does now, including its rounding,
empty input and limits named in the delta-spec's `unchanged_guarantees`. Every characterisation test
**passes** now (`gate impl`). Only the listed test files are yours; change no source file. Where
today's behaviour looks wrong, pin it anyway and say so in `follow_up_suggested`.
