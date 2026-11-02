# Lens group: frontend (frontend-dev-kit, React 19 + FSD)

Applies to change-set files under the frontend role's path. T1 names the stack knowledge to load
(`frontend-dev-kit:code-review`, `frontend-dev-kit:accessibility`) and lists the stack's rules; this
file says which of their checks matter for each lens and what severity they get here. Read the stack
material by path — do not restate it in findings, cite it:

| Topic | Stack material (read the rows the change touches) |
|---|---|
| Conventions (exports, JSX control flow, handlers, closed-set props) | `frontend-dev-kit/skills/code-review/references/conventions.md`, `rules/react.mdc`, `rules/component-structure.mdc` |
| Component design (what a component file holds, SOLID, GRASP) | `frontend-dev-kit/skills/code-review/references/design.md` |
| Styling, tokens, shadcn fidelity, motion | `frontend-dev-kit/skills/code-review/references/styling-and-shadcn.md`, `rules/styling.mdc`, `rules/shadcn.mdc` |
| Accessibility | `frontend-dev-kit/skills/code-review/references/accessibility.md`, skill `frontend-dev-kit:accessibility` |
| i18n | `frontend-dev-kit/skills/code-review/references/i18n.md`, `rules/i18n.mdc` |
| Data fetching (react-query, schemas, fetchers) | `frontend-dev-kit/skills/code-review/references/data-fetching.md`, `rules/api-contract.mdc` |
| Tests (mocking, assertions) | `frontend-dev-kit/skills/code-review/references/testing.md`, `rules/testing.mdc` |
| FSD layers and public APIs | skill `frontend-dev-kit:architecture-audit` (its references, by topic) |

The stack skill `code-review` has its own procedure (buckets, sub-agents, a Markdown report). Use it
as knowledge only: you have no Bash and no sub-agents, and your output is the envelope's `findings`.

## Already covered — do not file again

| Covered by | What it catches |
|---|---|
| gate-checks (before you) | typecheck, ESLint, build, the whole test suite incl. acceptance tests |
| task gates (gate-impl) | `depcruise` architecture check (import direction, layer rules) on every task |
| task gates (gate-impl) | `conventions` and `duplicates` checks on each task's files |
| audit `raw-colours` | hex, `rgb()`, `hsl()` literals in `.ts`, `.tsx`, `.css` |
| audit `i18n` | literal JSX text in `.tsx` |
| audit `conventions` | the mechanically checkable frontend-dev-kit rules (comments, inline classes and handlers, hardcoded copy, magic props, missing tests, query keys, env access, unused exports …) over the whole change set |
| audit `duplicates` | function bodies copied across slices, raw `<input>/<button>/<table>` in features |
| audit `bundle` | JavaScript chunks over `quality.bundle_kb_max` (gzip) |
| audit `axe` | WCAG violations of the built app's routes (when the project has Playwright and axe-core) |

`factory-role-frontend/role.yaml` `gates.audits` is the list that runs. Skip any check an audit in
that list performs. Things the audits cannot see are still yours: an `aria-label`, `placeholder`,
toast or zod message literal; a string map of English copy; a translation stored in a local.

## Blocking checks (P0/P1 unless noted)

Adapted from the v1 code reviewer's CRITICAL/IMPORTANT list and its Definition of Done.

`spec-adr-drift`
- Every AC maps to code a user reaches from the route the stories name (the page renders the
  feature, the route is mounted, the nav entry exists when the story needs one). Unreachable → P1.
- Prototype parity, when the feature had a prototype (`02b-prototype/` notes or
  `.factory/prototype/pages/<surface>.html`): copy, controls, field labels, types, required rules
  and every listed state exist in the React target. A missing state or control → P1; differing copy
  without a spec reason → P2. The prototype is evidence of intent; the spec wins on conflicts.
- Four data states for every feature or entity UI that fetches: loading (Skeleton/Spinner from
  `shared/ui`), empty, error (a translated message, never `error.message`), success. A missing error
  or empty state → P1 when an AC of kind error/edge covers it, else P2.
- Error boundaries: every route element is wrapped in the route boundary (`RouteBoundary` /
  `withRouteBoundary`), every feature entry renders inside `<ErrorBoundary>` from `shared/ui`, and a
  widget adds no boundary or retry of its own. A route or feature without one → P1.
- Server data parsed with the entity's zod schema in `api/`; an invalid body notifies and returns
  `null`; feature code does not restate `timeout`, `retry`, `prefixUrl` or `Authorization`. → P1
  when unparsed data reaches the UI.

`assumptions`
- Query invalidation covers every cache the mutation changes (stale list after a create → P1 when
  an AC shows the list).
- Optional contract fields read without a guard; a list assumed non-empty → P1 when it can crash
  the page, else P2.

`security`
- `dangerouslySetInnerHTML`, `href` or `src` built from user or server text without sanitising,
  tokens in `localStorage`, secrets or env values in client code (outside `shared/config`) → P0.

`tests`
- A test mocks the component under test, `@/shared/ui/*`, `react-i18next`, its own hooks, child
  components, or another slice's `api/` path → P1 when the AC's proof depends on the mocked part,
  else P2. Mock only `httpClient` in `@/shared/api/base` or the slice's own `api/fetchers`, the
  router and browser APIs.
- Translated text asserted through the key instead of the locale value → P2.

## FSD integrity (`spec-adr-drift`, P1 when it breaks the reference architecture)

The depcruise check catches import direction. Judge what it cannot:

- Code in the lowest layer that can host it; business logic not duplicated across slices (move to
  an entity or `shared`).
- Each new slice's `index.ts` re-exports only what an outside file imports; no `export *`; no
  `shared/ui` mega-barrel. → P2.
- Entity types imported from the entity, never re-declared in a feature → P2.
- `useQuery` / `useMutation` only in an `api/` segment; query keys from `shared/api/query-keys` → P2.
- Public interface of a shared slice changed without updating every caller → P1.

## shadcn fidelity (`spec-adr-drift` / `over-engineering`)

- Button, Skeleton, Table, Dialog and every other registry control is the `@/shared/ui` primitive;
  a raw `<button>`, `<input>`, `<table>` or a second UI library reimplementing one → P1 (P2 when
  purely cosmetic).
- A registry base whose parts, `data-slot` attributes or class strings differ from the registry
  output beyond the allowed edits in `rules/shadcn.mdc` → P1.
- Look or motion overridden at the call site (`className` with colour, radius, shadow, padding,
  `animate-*`, `transition*`) instead of a `cva` variant in `shared/ui` → P2. Call-site `className`
  is layout only.

## Accessibility (`spec-adr-drift` when an accessibility NFR exists, else `assumptions`)

- Interactive elements are real `<button>` / `<a href>`; every input has a label; every icon-only
  control has an accessible name; dialogs have a title, trap focus and restore it on close → P1.
- Visible focus on every interactive element; state never by colour alone; one live region that
  announces async loading/error/empty changes → P1 when the PRD's accessibility NFR requires it,
  else P2.
- Keyboard: Enter/Space activate custom controls; tab order follows visual order → P2.

## i18n (`spec-adr-drift`)

- Every user-visible string — text, `aria-label`, `alt`, `title`, `placeholder`, toast, zod
  message, empty and error copy — comes from a key in the slice's `locales/` or `common`; server data
  is the only untranslated text → P2 (the audit already reports literal JSX text).
- A spec sentence written as an instruction ("show a plain failure") rendered verbatim → P1.
- Keys added to every locale file the project ships → P2 when one is missing.

## Quality (`over-engineering`, P2/P3)

- No comments, `console.log`, `TODO` or commented-out code in new files; no inline handlers, no
  nested ternaries, no `let` or IIFE in a component (per `conventions.md`) → P3, P2 when repeated.
- An abstraction with one use, a generic table or form factory for one screen → P2.
- Changes outside the feature's slices (`outside_plan`) → P2.
