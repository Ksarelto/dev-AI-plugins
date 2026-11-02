---
name: fe-implement-task
description: Procedure for the factory frontend builder — make one task's red tests pass in the React Feature-Sliced Design stack with the smallest change, matching the golden file and keeping typecheck, lint, layer rules and build clean. Preloaded by fe-builder; not for direct use.
user-invocable: false
---

# Implement one frontend task (green phase)

Runs on: fe-builder (sonnet) — one green-phase task of the React FSD stack (entity-model, api-client, query-hook, component, feature-ui, form, page, route, store, i18n, styling-token, fix, refactor) of at most a few files.

The red tests are the specification and they are read-only. The rules you are held to:
[fe-build-contract.md](references/fe-build-contract.md). File order per layer and task type:
[fe-dev-cycle.md](references/fe-dev-cycle.md). The standing bar and the convention rule ids:
[fe-definition-of-done.md](references/fe-definition-of-done.md). Registry primitives and new
packages: [fe-shadcn.md](references/fe-shadcn.md).

## 1. Orient (before any edit)

1. **T0.** Task id, type, title, phase `green`, "Satisfies" (the AC text), planned test cases,
   "Definition of done", "Files", "You may write only" and the exit check. The red tests are listed
   in the mission; they are on your write-deny list.
2. **T3 on a retry.** Rung 1: fix only the failures listed. Rung 2 (you may now be on opus): write a
   one-sentence root-cause hypothesis in the summary first, then fix. Rung 3: read the diagnosis file
   in T1 and apply its fix; do not repeat what it lists as tried.
3. **T1.** Load every stack skill it lists with the Skill tool; read every `Rule: … [READ]` file.
   They are the source of truth for your task type, not this file.
4. **T2.** Open the golden file for your task type; that is the shape to match (names, folder
   layout, hook signature). Then the component map (`03-architecture/component-map.md`) for the
   reuse decision on your files, and the UX notes section of your surface for its states.
5. **Red tests.** Read each fully. Write down per test: what renders (role, label, translated text),
   what is called (fetcher, mutation, navigation) and which state it puts the UI in. That list is
   your scope; nothing outside it gets built.
6. **Existing code.** Read the files in your list that already exist and the `index.ts` of every slice
   you import from. Searches are scoped to a path (unscoped Grep/Glob is blocked).

## 2. Decide before writing

| Question | Answer |
|---|---|
| Does it already exist? | Simplicity ladder, contract § 1: reuse → platform → installed package → minimum code |
| Is a lower-layer piece missing (hook, type, `shared/ui` base)? | Not in your list → `blocked`; your task's natural file but left out → `needs_scope_change` (contract § 2) |
| Does it need a registry primitive? | [fe-shadcn.md](references/fe-shadcn.md) § 1–2 |
| Does it need an npm package that is not installed? | Human-owned: [fe-shadcn.md](references/fe-shadcn.md) § 4 |
| Unsure of an installed library's API? | Context7 lookup, contract § 9; name the source in the summary |
| Does a red test contradict its AC, the contract or a stack rule? | `test_dispute` (§ 5); never edit the test |

## 3. Write

1. Lay the segment order for your layer ([fe-dev-cycle.md](references/fe-dev-cycle.md)) over T0's
   files. Stub `index.ts` first, finish its exports last.
2. Happy path first, then each state the red tests and UX notes name: loading (skeleton), error
   (alert, retry when allowed), empty (next action), success, and pending for a mutation.
3. Copy: every string through `t()` with a typed key in the slice's `locales/` (`common` for app-wide
   words), the English value taken verbatim from the AC, Gherkin or UX notes.
4. Structure: `styles.ts` for every class, named handlers, early returns, no `let` / IIFE / nested or
   JSX ternary, closed-set constants, no comments.
5. Boundaries: a feature entry inside `ErrorBoundary`; a route inside the route boundary.
6. Keep it minimal, then tidy while the tests stay green: names, small functions, no dead code, no
   speculative option.

Worked mini-example — task TASK-004 `feature-ui`, red test "AC-0002 shows 'This coupon has expired'
under the field": the entity hook `useApplyCoupon` already exists (`@/entities/coupon`); the feature
`ui/coupon-field/` renders the shadcn `Input` and `Button` from `@/shared/ui`, reads `isPending`
and `error` from the mutation, maps the error code through `config/coupon-errors.ts`
(`EXPIRED → couponKeys.errors.expired`) and renders `t(...)` in a `FormMessage`. `en.json` gets
`"expired": "This coupon has expired"`. No new hook, no string map, two files plus the locale.

## 4. Verify, then the exit check

1. Self-check the diff against the contract and the definition of done
   ([fe-definition-of-done.md](references/fe-definition-of-done.md)) — especially the convention
   rule table: each rule there is an automatic failure.
2. Typecheck once, at the end. Run the red tests on their own until green.
3. Run the exit check from T0 (`gate impl … --task <id>`). It fails on:
   - a red test or acceptance test changed since its lock (`red-test-changed`, `acceptance-test-changed`);
   - a task test missing, empty or skipped (`task-test-missing`, `no-tests`, `skipped-test`);
   - any touched test failing or not loading (`failing`, `does-not-load`);
   - typecheck, lint, the architecture check or the build failing (`<step>-failed`);
   - the role's checks (convention rules, duplicate scan) when the role wires them for your type.
   Fix each failure line, re-run. Warnings are reported, never block. A passing run on an unchanged
   tree is reused by the engine, so do not re-run it after it passed.

## 5. When you cannot make it green

- **A red test is wrong** (it contradicts the AC text, the contract, or a stack rule, or two red tests
  cannot both pass): leave every file of the test alone and return status `done` with
  `"test_dispute": { "test": "<file>", "reason": "<the line, what it expects, the AC or rule it contradicts>" }`.
  Do not also change code around it. The engine restores the sources to their state at red and the
  test author gets one round; a second dispute goes to the human.
- **A file you need is outside your list**: `needs_scope_change`, naming the file and the step.
- **A dependency or a product decision**: `needs_clarification` with one concrete question and its
  options in `open_questions`.
- **A missing lower-layer piece** owned by another task, or a project setup failure the gate reports
  (no TypeScript compiler API, a script missing): `blocked` with `error.type: "business"` and what
  you tried in `error.attempted`.

## 6. Envelope

End with the one ```json envelope from T0 (`pack_id` exactly as given):
`artifacts_written` (every file you changed), `summary` (≤200 words: layers touched, reuse decisions,
bases added, Context7 sources, the self-check line), `deviations` (`{what, why}` for any deliberate
simplification), `follow_up_suggested` (smells next door, a package to approve later), `test_dispute`
only when § 5 applies, `gate_result` (your last exit-check summary, informational).
