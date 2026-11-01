---
name: eval-authoring
description: Procedure for the factory eval author — turn behavioural acceptance criteria into golden cases (question, must mention, must cite, expect refusal) and an eval suite with an explicit pass-rate threshold that runs against real models and skips cleanly without a key. Preloaded by eval-author; not for direct use.
user-invocable: false
---

# Author evals for a feature

1. Read the design's **Eval plan** and the criteria in T0. Each behavioural AC gets at least two
   golden cases: one typical, one edge (ambiguous, out of scope, or adversarial when a guardrail is
   involved). Put the AC ID in the case id (`AC-0007-refund-window`).
2. Add the cases to the eval dataset (`evals/golden/*.json`) with explicit expectations — words the
   answer must mention, sources it must cite, or that it must refuse. Expectations are checked by
   code, not by another model, unless the design says otherwise.
3. Add or extend the suite (`evals/*.eval.ts`): one test per golden case, named with the case id (so
   its AC id) — `it.each(cases)('$id', …)` — plus the pass-rate test with the threshold from the design
   (default 0.8). The gate needs a passing test per AC the task claims, so a suite-wide rate cannot
   hide a failing case. The suite skips when the provider key is missing, like the existing one. If
   the suite also has a model judge for faithfulness to the knowledge base, cases answered by a tool
   rather than by documents opt out of it (for example `judge: false` on the case).
4. Run the exit check (`gate impl`). The eval run is part of it; without a key the gate fails as
   "skipped" unless the project allows skipped checks — say so in your summary.

Never lower a threshold or delete a failing case to get through the gate: a failing eval is a
finding about the agent, and the builder fixes the agent.
