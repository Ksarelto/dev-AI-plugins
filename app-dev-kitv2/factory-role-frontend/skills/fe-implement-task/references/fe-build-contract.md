# Frontend build contract

What every green-phase task of the frontend role is held to, by `gate impl` and later by the
reviewer. The detail of each rule lives in **frontend-dev-kit**; this file says which rule decides
what and in what order to apply it. T1 names the rules and skills that apply to your task type:
read those, then use the sections below as the checklist.

| Topic | Source of truth in frontend-dev-kit |
|---|---|
| Layers, slices, public API | `rules/general-coding-principles.mdc`, skill `react-feature` |
| Component folders, `styles.ts`, nested `ui/` | `rules/component-structure.mdc`, `rules/styling.mdc`, skills `react-component`, `tailwind-styles` |
| React behaviour, effects, boundaries | `rules/react.mdc`, skills `react-feature`, `error-handling` |
| Copy and locale keys | `rules/i18n.mdc`, skill `i18n` |
| HTTP, schemas, query keys | `rules/api-contract.mdc`, skills `api-client`, `react-query-hook` |
| shadcn bases and composition | `rules/shadcn.mdc`, skill `shadcn-usage` ([fe-shadcn.md](fe-shadcn.md)) |
| Forms | skill `rhf-form` |
| Tests | `rules/testing.mdc`, skill `testing` |

## 1. Simplicity ladder

Stop at the first rung that holds, and say which one in the envelope summary when it is not rung 1:

1. **Reuse.** The component map (`03-architecture/component-map.md`) says what to reuse or extend.
   Search with a scoped Grep or Glob
   (a path from T0, `src/shared`, or the slice you are in — unscoped searches are blocked).
2. **Platform.** A language, DOM or React feature that already does it (`Intl.NumberFormat`,
   `<dialog>` semantics through the shadcn base, `useId`).
3. **Installed dependency.** Anything in `package.json` — look its API up with Context7 (§ 9) rather
   than guessing. A package that is not installed is human-owned ([fe-shadcn.md](fe-shadcn.md) § 4).
4. **Minimum code.** Only what the red tests and the ACs in T0 require. No option, prop, variant or
   endpoint nobody asked for.

Abstract on the third real use, never on the first: no generic table, form factory or hook that
wraps a single `useState`. A second copy of a function body that already lives in `shared/` or in
another slice fails `duplicate-body`; import the original through its public `index.ts` instead.

## 2. Boundaries

- Write only the files under "You may write only" in T0. The red tests are on the write-deny list
  in the green phase; the acceptance tests are unreadable.
- Do not reformat, rename or modernise a file you only read. Do not fix a neighbour's smell — name it
  in `follow_up_suggested`.
- Imports point down the layer stack only (`app → pages → widgets → features → entities → shared`),
  never sideways between two slices of one layer, and always through the target slice's `index.ts`.
  Entities reach a sibling entity only through its `@x` file. dependency-cruiser (`architecture_check`)
  fails the gate otherwise.
- **A missing lower-layer piece is not yours to invent.** If the hook, type, export or `shared/ui`
  primitive you need does not exist and its file is not in your list, stop. Return
  `status: "blocked"` with `error: { type: "business", attempted: "<name> missing in <layer>/<slice>",
  alternatives: ["add a task for <file>", "…"] }`. When the file is the natural home of this task's
  work but was left out of `files_expected`, return `needs_scope_change` naming it instead. Never
  inline a copy, never drop the behaviour.
- A public API you change keeps working for every importer, or every call site is in your list.

## 3. Copy

- Every user-visible string goes through `t()` with a typed key: text nodes, `aria-label`, `alt`,
  `title`, `placeholder`, toast text, zod messages (the message is the key), empty and error copy.
  Only server data renders untranslated.
- Slice copy: `<slice>/locales/en.json` plus `keys.ts`. App-wide words (Save, Cancel, Retry, a generic
  failure): `shared/lib/i18n/locales/common`. Reuse a common key before you add one.
- Call `t(key)` where the string renders; a local may hold a key, never a translated string.
- A closed set shown to users is a constant plus a value → key map in the slice's `config/`; `ui/`
  calls `t(map[value])`. An object of English strings fails `string-map`.
- The exact copy comes from the AC text, the story Gherkin or the UX notes, in that order. A spec
  sentence that describes behaviour ("keep the previous list") is not copy.

## 4. Component structure

- One folder per component, kebab-case: `<name>/<name>.tsx`, `styles.ts`, `index.ts`,
  `<name>.stories.tsx`, and `tests/` for every test in the folder (the component and each `lib/`
  helper). `lib/` / `constants.ts` / `types.ts` only when needed. A second visual region is
  `ui/<child>/`.
- Every class list lives in that folder's `styles.ts` (`cva` for variants). No class string, class
  ternary or `style` prop in JSX outside `shared/ui`.
- Handlers are named `handleX` functions above `return`; no inline arrow in an `on*` prop.
- No `let`, no IIFE, no nested ternary, no ternary in JSX. A condition is a named `const`; JSX uses
  `{cond && <X />}`; a small calculation goes to `lib/`.
- Early-return the states in this order: pending data → error → empty → success.
- Closed-set props use the primitive's constants (`ButtonVariant.Outline`); omit a prop at its default.
- No comments. A name that needs one is the wrong name; a deliberate simplification goes into the
  envelope `deviations`.

## 5. Error boundaries

- Every route element is wrapped in the route boundary (`frontend-dev-kit:routing`,
  `error-handling`); a `route` or `page` task adds it when it adds the route.
- Every feature's exported entry renders its content inside `ErrorBoundary` from
  `@/shared/ui/error-boundary` with `resetKeys`; the hooks live in the content component below it.
- A widget adds no boundary, error alert or retry of its own: the composed feature owns them.
- Fallbacks use the shared translated fallback. Never render `error.message`.

## 6. UI states

Each data-driven surface renders four states plus pending: **loading** (a `Skeleton` shaped like the
populated layout), **error** (an `Alert` with a retry when the AC allows one), **empty** (the
`Empty` pattern with the next action), **success**, and **pending** for a mutation (controls
disabled while `isPending`). Take the flags straight from the query result (`isLoading`,
`isFetching`, `isPending`, `isError`, `error`); never derive a second flag. The UX notes name the
states of each surface — a state they list is part of the task even when no red test names it.

## 7. Tests

- Placement: a component folder's `tests/` holds `<name>.test.tsx` and a test for each `lib/`
  helper. Hooks, `api/`, `model(s)/`, slice `lib/`, route modules and guards use the segment's
  `tests/` folder.
- Mock only the boundary the test cannot run: inside the slice that owns the fetcher, its
  `api/fetchers` (`importOriginal`, override one export); anywhere else, `httpClient` from
  `@/shared/api/base`; plus the router and browser APIs. Never mock another slice, `@/shared/ui/*`,
  `react-i18next` or the component under test.
- Assert what a person sees: roles, labels, the **translated text** (the `en.json` value, not the
  key), what was called. Query with `screen.getByRole` / `getByLabelText`, never DOM walking.
- Builders do not edit red tests. A TDD-exempt task whose files include a test writes it; an
  executable file without a test fails `missing-test`.

## 8. Self-check before the exit gate

1. Re-read the diff against § 2–7 and [fe-definition-of-done.md](fe-definition-of-done.md).
2. Run the red tests on their own (`pnpm exec vitest run <file>` or the project's runner) until green.
3. Run typecheck once (`pnpm typecheck`, or the package manager the project uses).
4. Run the exit check from T0 (`gate impl`). It runs the tests the change touches (all of them for
   the role's last task), typecheck, lint, the architecture check, the build and the role's
   convention check, side by side. Fix every failing line; re-run. Warnings never block.
5. Put one line in the summary: `self-check: red green, typecheck pass, gate impl pass`.

## 9. Unfamiliar API of an installed library

Before guessing a signature of an installed library (TanStack Query, react-hook-form, zod,
react-router, i18next, Radix), look it up with Context7: `mcp__context7__resolve-library-id` with the
package name, then `mcp__context7__query-docs` with the resolved id and a narrow topic
(`useMutation onSettled invalidateQueries`). Match the version in `package.json`. Record the source in
the summary (`context7: /tanstack/query v5 — useMutation`). When Context7 has nothing, follow the
golden file and the stack skill; never invent an option.
