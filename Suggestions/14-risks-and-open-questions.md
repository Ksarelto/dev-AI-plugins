# 14 — Risks and open questions

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Agent sprawl** — too many agents with fuzzy descriptions → wrong routing | high | high | 12 core agents in v1; split only with a crisp trigger; one builder per role, task type selects the skill ([05](05-agents-and-roles.md)) |
| **Conductor context bloat** over a long run | medium | high | Conductor reads only state + envelopes; headless runner gives each step a fresh context; < 20k budget tracked in events |
| **LLM-only gates** — models approve their own work | high | high | machine gates first; reviewer in a separate context; acceptance tests from spec only; blind QA ([09](09-quality-gates-and-loop-control.md)) |
| **Runaway loops / budget incidents** | medium | high | Loop Warden budgets, fingerprints, oscillation, wall-clock; rung ladder used once each; `blocked` is terminal |
| **Self-feeding backlog** | medium | high | only the planner writes `tasks.yaml`; follow-ups are advisory |
| **Mega-tasks** that fail differently each retry | high | medium | task limits (3 files / 200 LOC) checked in `gate-plan`; rung 4 split |
| **Brownfield misread** — wrong baseline ledger → features rebuilt | medium | high | Discovery output confirmed by a human once; conformance check; delta-spec `removed` mandatory |
| **Silent behaviour loss in change requests** | medium | high | characterisation tests before modification; behaviour-preservation lens mandatory; `unchanged_guarantees` |
| **Merge conflicts between parallel tracks** | medium | medium | disjoint `owns_paths`; contract-generated shared types; fixed merge order; second conflict → human |
| **Contract churn** after GATE-B | medium | medium | contract changes require ADR + impact note; contract-steward is the only writer |
| **Prototype gold-plating** — paying for the feature twice | medium | medium | sandbox hook, quality ceiling, revision cap, waste flag, asymmetric promotion |
| **Prompt injection** via customer docs or PR comments | medium | high | intake treats input as data; hooks restrict tools; GT-08 eval; no auto-execution of comment text |
| **Hook-only enforcement** disappears on another workstation / in Cursor | medium | medium | the same checks as CI required checks on the PR |
| **Stale index** → planning against an outdated app | medium | medium | SHA check; Conductor refuses to plan on stale index; re-index post-merge |
| **Cost** of opus on every reasoning step | medium | medium | tiering, prompt-cache ordering, idempotent skips, patch tier for small changes, cost per golden ticket tracked |
| **Over-engineering by agents** | high | medium | lens 7; `no_speculative_work`; no new deps without human approval |
| **Harness feature drift** (Claude Code changes subagent / hook semantics) | medium | medium | thin adapter layer in `factory-core`; control-plane logic in scripts, not in prompts; golden tickets catch regressions |

## Open questions

These need your decision before or during the phases named.

| # | Question | Options | Suggested default | Needed by |
|---|---|---|---|---|
| Q1 | **Boilerplate**: which starter(s) does greenfield clone? | one React-FSD starter · per-customer starter · monorepo (web + api + agents) | **Partly decided:** `backend-boilerplate/` and `agent-boilerplate/` exist and are verified. Still open: extract a React-FSD starter from `frontend-dev-kit`, and whether a monorepo template wraps all three | P2 |
| Q2 | **Design source** when the customer has no designs | prototype only · a **Design Lab** (token intent spec → generated tokens → representative screens) as a separate design role · external designer | start with prototype + provided theme; add a design role later via the same role recipe | P2 |
| Q3 | **Who answers GATE-A** — you, or the customer directly? | engineer proxies · customer reviews a generated review packet (HTML / PDF) | engineer proxies in v1; review packet export in P4 | P1 |
| Q4 | **Tracker integration** | local files only · Jira / Linear adapter | local files in v1 (as decided); adapters are plugins later | P5+ |
| Q5 | **Where does `.factory/` live** for multi-repo products? | inside the app repo · a separate "delivery" repo | inside the app repo | P0 |
| Q6 | **Commit granularity** | one commit per task · one per feature | per task (traceable); squash-merge at PR level is a repo setting | P3 |
| Q7 | **Autonomy level** of the headless runner | stop at every human gate · auto-approve GATE-B for patch tier | stop at every gate in v1 | P4 |
| Q8 | **Model choice per tier** and budget per feature | defaults in [10](10-configuration-and-extensibility.md) | measure in P4, then fix | P4 |
| Q9 | **Existing apps not built with this architecture** | adapter mode · refuse · "align architecture" epic first | adapter mode with review flags | P5 |
| Q10 | **Retire old kits** | deprecate after P4 · keep in parallel | deprecate after golden tickets match or beat them | P4 |

## Things deliberately left out of v1

- Deployment / release to environments (the pipeline ends at the PR).
- Peer-to-peer agent teams (experimental, and they break hub-and-spoke auditability).
- Automatic merge — merge stays human-owned.
- Fine-tuning or custom models — prompting + skills + golden files + evals first.
