# Factory pipeline quality checklist

Run this checklist before you merge any change to `app-dev-kitv2/`.

Answer every item **pass**, **fail** or **partial**. Back the answer with evidence: a `file:line`, a command and its output, or a test name. If an item does not apply to the change, mark it `n/a` and say why.

The checklist exists because of the FEAT-001 run in a brownfield React app (`deps-frontend`, 2026-11-04). A single side panel cost:

- 197 dispatches, 44 tasks, 18 planner fix rounds and 20 human stops
- about 13.5 h and an estimated 7.65 M tokens

The run still halted at verification. Most items below guard against one of the causes found in that run.

Commands for the whole checklist: `npm run validate`, `npm run check:factory`, `npm run test:factory`, `npm run test:factory:e2e` (Node 22) and `npm run eval`.

## A. Correctness: the engine does what the docs say

| # | Check | How to check |
|---|---|---|
| A1 | Every stage in every profile (`patch`, `small`, `standard`) is reachable and has an exit gate. No stage reads an artifact that no earlier stage in that profile writes. | Read `factory/defaults.yaml` profiles and each `stages/*/stage.yaml` (`inputs`, `outputs`, `gate`), then follow `conductor.mjs` stage order. |
| A2 | Every backward edge has a cap. When the cap is hit, the run halts and names the edge. | `defaults.yaml` `backward_edges`; `warden.mjs`; a unit test that hits the cap. |
| A3 | Under `builder_two_phase`, red still comes before green: the gate log shows `gate red` passing (tests failing for the right reason) before `gate impl` is accepted. | `tasks.mjs` phase logic; a unit or e2e test that skips red and gets refused. |
| A4 | The only way a failing locked acceptance test passes `gate checks` is to be listed in a human-approved `acceptance-waiver.yaml`. The waiver appears in the verification report. | `gates/checks*.mjs`; unit test. |
| A5 | The write guard allows exactly the task's `write_scope` plus its envelope path. Declared reference (mockup) paths can be read but never written. | `hooks/guard.mjs`; unit tests. |
| A6 | Token usage in `state.json` grows with every dispatch, whether or not the conductor passes `--tokens`. | SubagentStop hook; unit test with a hook payload. |
| A7 | `record --saved` finds the envelope that the SubagentStop hook saved, including plugin-prefixed agent types (`factory-role-frontend:fe-builder`). | `guard.mjs saveEnvelope`; unit test. |

## B. Consistency: no two sources disagree

| # | Check | How to check |
|---|---|---|
| B1 | Task size limits are the same everywhere: `defaults.yaml`, every `role.yaml`, `gates/plan.mjs`, the planner pack text in `conductor.mjs`, `planner.md`, the `task-decomposition` skill and its references, and the `Suggestions/` docs. | `grep -rn "files_max\|loc_max\|small tasks\|at most three files\|one behaviour" app-dev-kitv2 Suggestions` finds no stale copies. |
| B2 | The default TDD mode matches in `defaults.yaml`, the conductor skill, the builder and test-author prompts of every role, and the e2e scenarios. | Grep `builder_two_phase` / `tdd.author`. |
| B3 | Code formatted by Prettier gives no `fe-conventions.mjs` findings. | Round-trip unit test. |
| B4 | Every envelope or task field that an agent prompt mentions exists in the schema. Every field the schema requires is named in the prompts. | `schemas/*.json` compared against the agent and skill text. |
| B5 | Cursor agent files are written from `agents/` into the local plugin mirror, not the repo. `consistency-allowlist.yaml` holds no stale entries. | `npm run validate`, `npm run check:factory`. |
| B6 | ID formats are defined only in `factory/scripts/lib/ids.mjs`, and the schema patterns match them. | Existing test; grep for regex copies. |

## C. Available skills: agents can load what they are told to load

| # | Check | How to check |
|---|---|---|
| C1 | Every agent whose body says to load skills lists `Skill` in its `tools:`. | `factory doctor` passes; doctor unit test. |
| C2 | Every skill name used anywhere resolves to an existing `SKILL.md` in this repo: in `stack.yaml` task types, in `skills:` preloads, and in pack `skills_required`. | Doctor check plus `npm run check:factory`. |
| C3 | Pack `skills_required` matches the stack for the task type. The guard denies writes until those skills are loaded. Envelope `skills_loaded` is checked by `record`. | Unit tests. |
| C4 | Every agent and skill, including new and renamed ones, has an eval case. | `npm run eval` is green. |

## D. Logical flow: no dead ends, no loops without exits

| # | Check | How to check |
|---|---|---|
| D1 | `needs_scope_change`, `test_dispute`, `blocked` and `needs_clarification` each have a defined next step: `scope add`, back to red, halt, or CLARIFY. A one-line scope fix never costs a planner rerun. | `tasks.mjs`, `conductor.mjs`; unit tests. |
| D2 | A fix round amends the existing tasks of a slice. A fix plan for 3 issues in one slice yields 0–1 new tasks, not 3. | Planner skill text and a unit or e2e test. |
| D3 | Process notes (budget raises, "stop asking") never trigger a fix plan and never appear in packs. | `broker.mjs`, `conductor.mjs`; unit test. |
| D4 | Rejecting GATE-A sends the feature back to requirements with the note. | unit: review4 b2. |
| D5 | Contradictions between inbox sources produce exactly one CLARIFY before requirements are approved. The user's own brief is the default winner. | Requirements analyst prompt and skill; scenario. |
| D6 | A referenced mockup is recorded on the context index and listed as a binding input. No stage imports it into a generated prototype. | unit: reference recording. |

## E. Optimisation: cost and speed

| # | Check | How to check |
|---|---|---|
| E1 | A fixture build pack is estimated below 20k tokens. The stable prefix (rules, stack digest) comes before the unique mission. | Broker unit test. |
| E2 | By default each task costs one build dispatch. | e2e scenario counts dispatches per task. |
| E3 | `gate impl` lints and tests only the task's change against the task's base ref. No production build runs per task. A failed agent exit check is not re-run by `record` on an unchanged tree. | `gates/impl.mjs`, `stackexec.mjs`, `gatekeeper.mjs`; unit tests. |
| E4 | Default budgets come from the plan size. An 8-task plan never needs a manual budget raise. | `defaults.yaml`, budget code; e2e. |
| E5 | No opus model does mechanical work: scope edits, fix-plan amendments, contract steward, locale or barrel tasks. | Agent frontmatter `model:`; `scripts/model-tiers.json`; `tasks.mjs` model picks. |
| E6 | A real re-run of a feature of FEAT-001's size stays within: ≤ 8 tasks, ≤ 35 dispatches, ≤ 3 h, ≤ 1.5 M tokens (from `state.json`). | Manual run (costs money; needs the owner's OK). |

## F. Output quality

| # | Check | How to check |
|---|---|---|
| F1 | The `i18n` and `raw-colours` audits run inside `gate impl` for each task, not only at verification. | `role.yaml` audits; `gates/impl.mjs`. |
| F2 | The reviewer runs after the first vertical slice as well as at verification. | Stage wiring; e2e. |
| F3 | The builder and planner prompts forbid changing production code to fit a test fixture. Such cases are raised as `test_dispute`. | Grep the agent bodies. |
| F4 | There is no prototype render gate. UI work is checked by the role audits (raw colours, i18n, conventions, duplicates, bundle, axe) and by QA against the stories. | `role.yaml` audits; qa-heuristics. |
| F5 | The component inventory exists before architecture. | Cartographer; discovery stage. |
| F6 | Builders read the spec, stories and UX notes. Copy comes from the AC text, the Gherkin and the UX notes. | `fe-build-contract.md`. |
