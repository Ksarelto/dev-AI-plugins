---
name: eval-authoring
description: Procedure for the factory eval author — turn behavioural acceptance criteria into golden cases (question, must mention, must cite, expect refusal) and an eval suite with an explicit pass-rate threshold that runs against real models and skips cleanly without a key. Preloaded by eval-author; not for direct use.
user-invocable: false
---

# Author evals for a feature

Runs on: eval-author (sonnet) — one `eval` task: the golden cases for the ACs it satisfies and the suite (per-case tests, metric thresholds) the role's eval check runs against real models.

Case format, set composition, metric formulas and the suite shape:
[ai-golden-cases.md](references/ai-golden-cases.md). Harness: `node-agent-dev-kit:agent-evals` and
its golden-evals reference.

## 1. Read

| Source | For |
|---|---|
| T0 | the ACs this task satisfies, its planned `eval` cases (TEST IDs), the files (`evals/golden/<agent>.json`, `evals/<agent>.eval.ts`, maybe `evals/golden/knowledge.json`), the exit check |
| T1 | `node-agent-dev-kit:agent-evals`, `rules/agent-testing.mdc` and the `*` rules |
| T2 | `agent-design.md` "Eval plan" (thresholds, cases per AC, `expectedTools`), the PRD's NFRs, `test-plan.yaml`, the golden file `skills/agent-evals/examples.md` |
| code | the existing suite and golden files, `prompts.ts` (each rule needs a case), `tools/index.ts` (each tool needs a case), the knowledge documents |

## 2. Write the cases

1. Start from the design's eval plan. Every behavioural AC in "Satisfies" gets at least two cases: a
   typical one and an edge one. The case `id` starts with the AC ID: `AC-0007-refund-annual`.
2. Fill the coverage list in the reference: each prompt rule, each tool, at least three
   `expectedTools: []` cases, an unknown-topic case, an injection and a prompt-leak case
   (`expectBlocked`), each knowledge source. The development set holds at least 20 cases.
3. Expectations are checked by code (`mustCite`, `mustMention`, `expectedTools`, `expectBlocked`); the
   judge covers only faithfulness and whether the question was answered. A tool-answered case sets
   `judge: false`.
4. Questions are real user phrasing, not copies of the source text, so they test retrieval and
   reasoning rather than string matching.
5. New knowledge a case needs goes into `evals/golden/knowledge.json` only when T0 lists it.

## 3. Write the suite

- `describe.skipIf(!hasKey)` around everything: the suite skips cleanly without `OPENROUTER_API_KEY`.
- The production path: real models from the `llm/` factories, the real graph, guard, tools and
  service; only the retriever (recording wrapper over the golden retriever) and the checkpointer are
  in memory.
- `it.each(cases)('$id', …)`: one test per case asserting the deterministic expectations; record the
  judge verdict and the retrieval stats for the metric tests.
- One metric test each, against named constants: faithfulness ≥ 0.85, context precision ≥ 0.75,
  context recall ≥ 0.80, tool-name accuracy 100 %, pass rate ≥ `PASS_RATE_THRESHOLD` — or the
  numbers an NFR sets (cite `NFR-n` next to the constant).
- `console.table(results)` for the run's evidence.

## 4. The exit check spends money

The exit check (`gate impl`) runs typecheck, lint, build, the touched unit tests and the role's `eval`
check — `npm run eval`, real models, billed per call. What it checks:

- every eval test that ran passed (a failing case or metric test fails the check);
- for each AC of this task's planned eval cases (or, without planned cases, each AC the task
  satisfies) a **passing** test whose name contains the AC ID;
- at least one eval test ran: with every test skipped (no key) the check fails as `eval-skipped`
  unless the project sets `quality.allow_skipped_checks` — report that in the summary.

So: get the suite to type-check and lint first, run one case locally while you write
(`npx vitest run --project eval -t AC-0007` — also billed), then run the exit check once. Do not loop
the gate to see whether a flaky case passes.

## 5. When cases fail

A failing case is a finding about the agent, and the builder fixes the agent. Never lower a
threshold, delete or loosen a failing case, or add `judge: false` to dodge the judge. If a case's
expectation is wrong (the answer is correct, the phrase was too literal), fix the expectation, show
the evidence (the answer and the source) in the summary, and report the pass rate before and after.
If the agent is wrong and the gate therefore fails, return `needs_clarification` with the failing ids,
the answers and why they miss: fixing the agent is not your task, and a human decides whether a fix
task is planned. Cases that pass but look fragile go to `follow_up_suggested`.

## Checklist

- [ ] ≥ 20 cases; every behavioural AC ≥ 2, ids starting with the AC ID
- [ ] Cases for every prompt rule, tool and source; ≥ 3 with `expectedTools: []`; unknown, injection
      and prompt-leak cases
- [ ] Deterministic checks per case; judge only for faithfulness and relevance
- [ ] Thresholds as named constants (defaults or the NFR's), metric tests present
- [ ] Suite skips without a key; no network beyond the model provider
- [ ] Exit check run once; pass rates and any skip reported
