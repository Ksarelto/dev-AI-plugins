# Frontend definition of done

Two bars, both required. The task's own `definition_of_done` lines in T0 answer "did we build what
this task promised?"; this list is the same for every frontend task and answers "is it finished to
the role's standard?". `gate impl` checks the mechanical part; the reviewer at verification reads the
rest.

## Correctness

- [ ] Every red test of the task passes; none was edited (the gate compares hashes with the red lock).
- [ ] Every other test the change touches still passes (all tests for the role's last task).
- [ ] Each AC in "Satisfies" is visible in the UI or the hook result, with the exact value from the
      AC text (amounts, messages, limits).
- [ ] Loading, empty, error and success render where the UX notes list them; a mutation disables its
      controls while pending.
- [ ] An error reaches the user as a translated message, never a silent `console` line or
      `error.message`.
- [ ] A route renders inside the route boundary; a feature entry inside `ErrorBoundary`.

## Architecture

- [ ] Imports go down the layers and through `index.ts`; no sideways slice import (architecture check).
- [ ] A slice `index.ts` exports only names another file imports; no `export *`.
- [ ] Code sits in the lowest layer that can hold it; entity types come from the entity.
- [ ] Only T0's files changed; no opportunistic refactor next door.

## Quality

- [ ] typecheck, lint, the architecture check and the build pass (all inside `gate impl`).
- [ ] The role's convention check passes on the task's files (rules below).
- [ ] No dead code, `console.log`, `TODO` or commented-out block.

## UI standard

- [ ] Keyboard reachable end to end, visible focus, a label on every input, `aria-label` on every
      icon-only button (`frontend-dev-kit:accessibility`).
- [ ] Status is never colour alone; text contrast follows the theme tokens.
- [ ] Theme tokens and the spacing scale only — no raw colour (the role's raw-colours audit flags
      them at verification) and no arbitrary pixel value.
- [ ] Every registry control is the `@/shared/ui` primitive ([fe-shadcn.md](fe-shadcn.md)).
- [ ] Each server entity is parsed by its zod schema; an invalid body returns `null`.

## Ship-readiness

- [ ] No secret, token or environment value in the code; env is read only through `shared/config`.
- [ ] No new package. A needed one is a `needs_scope_change` or an HD note, never an install.

## Convention rules the role's gate enforces

The role's convention check (`scripts/fe-conventions.mjs`, ported from feature-dev-kit) and its
duplicate scan (`scripts/fe-duplicates.mjs`) run on the task's files inside `gate impl`. Errors block;
`(warn)` rules are reported only. `unused-export` is skipped per task — a later task may be the
importer — and runs on the whole change set at verification. If the check exits with "no TypeScript
compiler API found", that is a project setup problem: return `blocked` with the message, do not
change code to get around it.

| Rule | How to avoid it |
|---|---|
| `comment` | No comments at all; rename or extract a function whose name says it. |
| `nested-ternary` | Early return or a lookup map instead of a ternary inside a ternary. |
| `jsx-ternary` (warn) | Compute the branch into a named `const` above `return`. |
| `component-let` | No `let` in a component; a condition is a `const`, JSX is `{cond && <X />}`. |
| `iife` | Name the function outside and call it. |
| `inline-class` | Classes in `styles.ts` (`cva` for variants); no class string, class ternary or `style` in JSX. |
| `inline-handler` | Declare `handleX` above `return` and pass it by name. |
| `hardcoded-copy` | Every rendered string, copy attribute, toast and zod message is `t(key)`. |
| `string-map` | `en.json` plus a value → key map in `config/`, never an object of English text. |
| `magic-prop` | `variant`, `size`, `type`, `side`, `align`… use the primitive's constant; omit defaults. |
| `motion-utility` | No `animate-*`, `transition*`, `duration-*`, `ease-*` outside `shared/ui`; the base animates. |
| `dark-variant` | No `dark:` class anywhere, `shared/ui` included: one light palette. |
| `missing-test` | Every executable file has a behaviour test in `<component>/tests/` or the segment `tests/`. |
| `cross-slice-mock` | Mock `httpClient` from `@/shared/api/base`, or this slice's own `api/fetchers`. |
| `inline-query-key` | Use the key factory in `shared/api/query-keys`, never a `queryKey` array literal. |
| `env-access` | Read the parsed value from `shared/config`; no `import.meta.env` / `process.env` elsewhere. |
| `client-option` | No `timeout`, `retry`, `prefixUrl` or `Authorization` on a slice's HTTP call. |
| `lib-imports-api` | `lib/` stays pure: pass the fetcher or the fetched data in as an argument. |
| `query-outside-api` | `useQuery` / `useMutation` only inside an `api/` segment. |
| `export-star` | Re-export each name explicitly. |
| `unused-export` | Drop the `export` or the `index.ts` line; never add an import to justify it (verification). |
| `max-len` | Lines at most 160 characters (URLs excepted); wrap the expression in parentheses. |
| `duplicate-body` | A function body of six or more lines already in `shared/` or another slice: import it. |
| `raw-primitive` | No raw `<input>`, `<button>` or `<table>` in feature code: use the `shared/ui` base. |

The script also knows `lint-directive`, `arrow-body`, `block-gap`, `wrapped-expr`, `node-access`,
`class-constant`, `translated-local`, `query-state-local` and `motion-css`; their one-line fixes come
with each failure in T3 on a retry.

## Red flags

- "Done, I just have not run it": unverified work is not done — run the exit check.
- Treating green tests as the whole bar while a listed state, a label or a regression is unchecked.
- A lower bar because the task is small or the attempt is late.
