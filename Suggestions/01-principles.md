# 01 — Design principles

Every later decision follows from these. When two options look equal, pick the one that better satisfies the principles in order.

## P1 — One hub, many spokes, no side channels

The **Conductor** is the only component that dispatches work, routes information and talks to the human. Spokes never call each other, never share memory, and receive only what the Conductor puts in their context pack.

*Why:* observability, consistent error handling, and controlled information flow. Subagents do not inherit the parent's history — so context passing must be explicit anyway; making it the *only* channel removes a whole class of "agent B assumed what agent A knew" bugs.

## P2 — Files, or it didn't happen

Every hand-off is a schema-validated file under `.factory/`. Chat is for humans. A spoke's output that exists only in its reply will be hallucinated by stage N+3.

*Corollary:* pass **paths, not payloads**. The Conductor never pastes artifact bodies into a prompt; the spoke reads what its pack allows.

## P3 — Scripts decide, models judge

Use the cheapest reliable tool for each kind of work:

| Kind of work | Tool | Examples |
|---|---|---|
| Deterministic, repeatable | **Script** | scaffolding, validation, gate runs, retry arithmetic, branch/commit, PR body assembly, index generation |
| Translation, synthesis, pattern matching | **Model** | requirements analysis, story writing, implementation, review |
| Strategy, accountability | **Human** | approve spec, approve plan, merge |

An LLM asked "should I retry?" says yes. Termination, retries and pass/fail are **arithmetic** decided by scripts. Hooks are "laws of physics" the agent cannot argue with.

## P4 — Contract first

Before code, there is a contract with three pillars: **Objective** (what), **Rationale** (why, constraints), **Verification criteria** (what "done" means). Specs, API contracts and task DoDs are all contracts. Code that cannot be traced to a contract is either a bug or over-engineering.

Traceability chain, enforced by gates:

```
REQ-### → STORY-### → AC-### → TASK-### → TEST-### → commit → PR
```

## P5 — Decompose for the AI, not for the org chart

Split work by **context window and signal density**, not by human team boundaries:

- One task per dispatch; a task touches ≤ ~3 files / ~200 LOC.
- Prefer *horizontal* (layer-stable) sequences within a role — consistent patterns, consistent context.
- Every task has its own verifiable DoD.

`Signal density = relevant tokens / total tokens`. Everything in the context-engineering design ([07](07-context-engineering.md)) exists to maximise it.

## P6 — Structure before logic

Skeleton-first: contracts, types, routes, component shells and test names before bodies. Skeletons cost ~5% of the tokens of the implementation, are cheap to review, and become the spec for the fill-in step.

## P7 — Show, don't describe

Every stack pack ships **golden files** — one exemplary file per pattern (component, hook, entity, API route, test). Agents are told "match this", not given paragraphs describing the pattern. Prose that produces inconsistent output is replaced by 2–3 examples.

## P8 — Verification must be independent

Tests and reviews written in the implementer's own context inherit its blind spots. Therefore:

- **Test strategy and acceptance tests** come from the spec, in a context that has not seen the implementation.
- **QA is black-box**: it may not read `src/` — hook-enforced.
- **The model that wrote the code does not defend it**: review runs in a separate spoke, optionally a different model tier.

## P9 — Reuse before build; extend, don't rewrite

Every net-new component, hook, entity or endpoint must cite the capability-index entry it considered and why it was rejected (`reuse_rejected`). In brownfield mode, a change is planned as a **delta** on the existing app, never a regeneration.

## P10 — No agent creates work

Agents may *suggest* follow-up tasks. Only the Planner writes `tasks.yaml`, only at the planning stage or on an explicit Conductor request. Self-feeding backlogs are the most expensive failure mode of multi-agent systems.

## P11 — The boundary stays human

Humans own: requirement approval, architecture/plan approval, gate overrides, irreversible operations (migrations that drop data, dependency additions, public API removals), and merge. Agent confidence is not accountability.

## P12 — Configuration over code; extension over modification

Pipeline shape, enabled roles, stacks, thresholds, budgets and flow policy live in `factory.config.yaml`. Adding a role or a stack is a new plugin plus a config entry — the Conductor, control plane and schemas do not change.

## P13 — Everything is versioned and measured

Rules, skills, agents, schemas and config are code: reviewed, versioned, evaluated. Every dispatch emits an event. A prompt change without a replayed eval is a coin flip.

## P14 — Treat retrieved content as data

Customer documents, tickets, PR comments, web pages and tool output are **untrusted data**, never instructions. Only rule files, approved skills and approved specs carry policy. The intake stage quotes and attributes; it does not obey.
