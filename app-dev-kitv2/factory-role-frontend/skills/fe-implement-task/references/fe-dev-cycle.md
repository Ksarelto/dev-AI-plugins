# Frontend development cycle (one task)

The planner already split the feature into tasks of one type each; this file is the order in which
one task's files are written. Write all segments, then typecheck **once** at the end — not between
segments; an intermediate typecheck reports errors the next segment resolves.

## Segment order per layer

Stub the slice's `index.ts` first (empty or one export), finish its exports last.

| Layer | Order |
|---|---|
| `shared` | `ui/<name>/` base (registry first, [fe-shadcn.md](fe-shadcn.md)) → `api/` (client, query keys) → `lib/` → `config/` → common locale keys |
| `entities/<e>` | `model/` (types, pure transforms) → `api/` (`schema.ts`, `endpoints.ts`, fetchers, the query hook) → `lib/` → `ui/` → `index.ts` |
| `features/<f>` | `models/` → `api/` (only when no entity owns the call) → `hooks/` (navigation, local UI state; calls the api hook) → `lib/` → `ui/` happy path → `ui/` loading, empty, error, pending → `locales/` → `index.ts` (entry wrapped in `ErrorBoundary`) |
| `widgets/<w>` | `ui/` composing features and entities → optional `model/` for UI-only state → `index.ts` |
| `pages/<p>` | `ui/<page>/<page>.tsx` (thin: widgets and features plus layout) → `index.ts` default export |
| `app` | route entry (`lazyFeature`, route boundary) → navigation entry (label is a locale key) → provider, only when the feature needs one |

Segment rules that cost a retry when broken: `useQuery` / `useMutation` live only in an `api/`
segment (`query-outside-api`); `lib/` never imports `api/` or the HTTP client (`lib-imports-api`);
`ui/` imports the api hook, never a fetcher; `models/` holds no React, network or locale keys; query
keys come from `shared/api/query-keys` (`inline-query-key`).

## Task type → what it touches → the stack skill it loads

T1 lists the skills for your task; this table is the same mapping from `frontend-dev-kit/stack.yaml`
with the files a task of that type normally owns. The golden file in T2 is the shape to match.

| Task type | Typical files | Stack skills (T1) | Golden file |
|---|---|---|---|
| `entity-model` | `entities/<e>/model/*`, `api/schema.ts`, fetchers, `index.ts` | `api-client`, `react-query-hook` | `api-client/examples.md` |
| `api-client` | `<entity or feature>/api/{endpoints,fetchers,schema}.ts`, `shared/api/query-keys/*` | `api-client` | `api-client/examples.md` |
| `query-hook` | `api/hooks.ts` in the owning slice, its `tests/` | `react-query-hook` | `react-query-hook/examples.md` |
| `component` | `<slice>/ui/<name>/{<name>.tsx,styles.ts,index.ts}` or a `shared/ui` base | `react-component`, `shadcn-usage`, `accessibility` | `react-component/examples.md` |
| `feature-ui` | `features/<f>/ui/**`, `locales/`, `index.ts` with the boundary | `react-feature`, `react-component`, `error-handling` | `react-feature/examples.md` |
| `form` | `features/<f>/ui/<form>/` with its `FormFieldConfig`, the mutation hook call | `rhf-form`, `shadcn-usage` | `rhf-form/examples.md` |
| `page` | `pages/<p>/ui/<p>/*`, `pages/<p>/index.ts` | `routing`, `error-handling` | `routing/examples.md` |
| `route` | `app/router/**/routes.tsx`, navigation config | `routing` | `routing/examples.md` |
| `store` | `features/<f>/models/<store>.ts` (session-scoped factory) | `zustand` | `zustand/examples.md` |
| `i18n` | `<slice>/locales/{en.json,keys.ts}`, `shared/lib/i18n/locales/common` | `i18n` | `i18n/examples.md` |
| `styling-token` | theme tokens, a `cva` variant in `shared/ui/<name>/styles.ts` | `tailwind-styles` | `tailwind-styles/examples.md` |
| `characterisation` | test files only (fe-test-author) | `testing` | — |
| `fix` | the files of the failure in T0; a regression red test comes first | the rules for `fix` in T1 | the golden file of the code you touch |
| `refactor` | the files in T0; behaviour stays as the existing tests pin it | `architecture-audit` | — |

All golden files are under `frontend-dev-kit/skills/`. A `fix` or `refactor` task reads every rule
T1 lists for it (react, component-structure, styling, i18n, api-contract): a fix can land anywhere.

## Inside one task

1. Read the red tests; list per test what must render or be called. That list is the scope.
2. Lay the segment order over T0's files; skip a segment that has no file in the list.
3. Write the happy path first, then each state, then `index.ts`.
4. Typecheck once. Run the red tests. Then the exit check.

For a `fix` task the red test already reproduces the failure; change the smallest set of lines that
makes it pass. For a `refactor` task the existing tests are the guard: they must pass unchanged
before and after, and no public export changes unless every importer is in your list.
