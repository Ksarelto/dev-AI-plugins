---
name: fe-red-tests
description: Procedure for the factory frontend test author — write failing Vitest + Testing Library tests from acceptance criteria with the exact values, add only the stubs they import, and write characterisation tests that pin current behaviour. Preloaded by fe-test-author, and by fe-builder for the red half of its one-dispatch build; not for direct use.
user-invocable: false
---

# Red tests (and characterisation tests)

Runs on: fe-test-author (characterisation, separate mode and its disputes; in the default one-dispatch mode a dispute goes back to the builder) and fe-builder (the RED half of phase `build`, before it implements) — the red phase of one TDD frontend task, a revision after a test dispute, or the characterisation tests of a change request. In `build` run `gate red --task <id>` yourself when the tests and stubs are written and do not implement until it passes (the engine locks the tests then).

Per task type: the stub and the assertions, what gate-red accepts, state and i18n tests, mocking,
characterisation — [fe-red-test-patterns.md](references/fe-red-test-patterns.md). Test placement and
the boundary rule are shared with the builder:
[fe-build-contract.md § 7](../fe-implement-task/references/fe-build-contract.md).

## 1. Orient

1. **T0.** Task id, type, phase (`red` or `char`), "Satisfies" (AC ids with their text), "Planned test
   cases" (id, level, title), the red test files, the stubs (`stubs` signatures or the
   `files_expected` paths), "You may write only" and the exit check.
2. **T1.** Load `frontend-dev-kit:testing` and the task type's skills with the Skill tool (first, per the pack's Skills preflight; report them as `skills_loaded` in the envelope); read every
   `Rule: … [READ]` file. The type's skill tells you the component, hook or form shape the stub must
   have; the golden file in T2 shows the final names.
3. **T2.** The stories' Gherkin for exact values, the UX notes for the surface's states, the API
   contract for codes and payloads, `test-plan.yaml` for your cases. The acceptance tests are
   unreadable to you; never look for them.
4. **T3** after a builder's dispute: see § 4.

## 2. Red phase (`phase red`)

1. **Plan the file.** One `it` per planned case (more when the AC has several examples). Title:
   `"<AC id> <observable outcome>"`. List the states from the UX notes; each one the task's ACs touch
   gets a test (loading, error, empty, success, pending).
2. **Write the tests** in the red test files only — new files, or the slice's own existing test file when it is
   in the task's `write_scope` (extend it; gate red then needs at least one new failing test and tolerates the
   file's old passing ones). Test through the public surface: a component through what the user sees
   (`screen.getByRole`, `getByLabelText`, `userEvent`), a hook through `renderHook` with the real
   query client, a model function through its exported signature.
3. **Assert the values from the spec**: the exact amount, the exact message (the English locale
   value, never the key), the exact limit. A weak assertion (`toBeTruthy`, "renders without
   crashing") is not a red.
4. **Mock only the boundary**: this slice's `api/fetchers` or `httpClient` from `@/shared/api/base`,
   plus router and browser APIs. Never another slice, `@/shared/ui/*` or i18n.
5. **Add only the stubs the tests import**, at the paths and signatures in T0:
   - a new function, hook or component has its full typed signature and throws
     `new Error("not implemented")` (a component may return `null` when the test looks it up by role);
   - an existing function gets the new parameter but keeps today's behaviour, so the new tests fail
     on an assertion and existing tests keep passing;
   - a new locale key exists in `keys.ts` with an empty or missing `en.json` value.
   No logic, no markup, no styles in a stub.
6. **No `skip`, `todo`, `only` or `.fails`**; no commented-out test.
7. **Run the exit check** (`gate red … --task <id>`). Valid red means: tests and stubs type-check;
   each red test runs and fails on an assertion, a Testing Library lookup or "not implemented";
   every other touched test still passes. Fix each failure rule:

| Rule | Cause | Fix |
|---|---|---|
| `passes-before-implementation` | behaviour exists or the assertion is weak | assert the new value |
| `does-not-load` / `not-collected` | missing stub or wrong path | add the stub; use the path from T0 |
| `wrong-failure` | `is not a function`, timeout, network | fix the stub shape; mock the boundary |
| `skipped-red-test` / `no-tests` | skip/todo, or an empty file | every test runs |
| `tests-do-not-compile` | stub signature or types wrong | type the stub fully |
| `existing-test-broken` | a stub changed today's behaviour | keep the old behaviour for the old inputs |

Never write the implementation, and never assert implementation details (internal state, CSS
classes, private call counts, hook internals).

Worked mini-example — TASK-003 `component`, case TEST-0005 for AC-0002 ("an expired coupon shows
'This coupon has expired'"): `coupon-field/tests/coupon-field.test.tsx` mocks
`../../../api/fetchers` with `importOriginal` and makes `applyCoupon` reject with the contract's
`COUPON_EXPIRED` error, types `SPRING10`, clicks the button found by role and name "Apply", and
expects `await screen.findByText("This coupon has expired")`. The stub `coupon-field.tsx` exports
`CouponField(props: CouponFieldProps): JSX.Element` and throws "not implemented". Red: the lookup
fails. The builder makes it green.

## 3. Characterisation phase (`phase char`)

Pin today's behaviour before a change request modifies it. Write tests — only in the test files T0
lists — that **pass now**: the current output for representative inputs and every guarantee named
in the delta-spec's `unchanged_guarantees` (rounding, empty input, limits, the copy users see).
Assert what the code does today even if it looks wrong, and say so in `follow_up_suggested`. Change
no source file and add no stub. The exit check is `gate impl … --task <id>`: every test runs (none
skipped) and passes, alongside typecheck, lint, the architecture check and the build.

## 4. After a dispute

T3 says the builder disputed a test and why; the engine has restored the source files to their state
at your red. Re-read the disputed AC and the cited rule:

- the builder is right → fix the test (and its stub) so it asserts what the AC says;
- the test is right → keep it unchanged and explain in the summary, citing the AC text.

Either way every red test must be a valid red again (run `gate red`). A second dispute goes to the
human.

## 5. Envelope

End with the ```json envelope from T0 (`pack_id` exactly as given):

- `done` — exit check passed; `artifacts_written` lists every test and stub file; the summary maps
  each planned case id to its test title and names any state you could not test at this level.
- `needs_clarification` — an AC cannot be tested as written (no observable outcome, two readings,
  a value missing); one question with the options in `open_questions`. Never guess a value.
- `needs_scope_change` — a stub's file is not in your list; name it.
- `follow_up_suggested` — behaviour that looked wrong while characterising, a missing AC for a state.
