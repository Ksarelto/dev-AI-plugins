# Feature Dev Kit

**Entry point**: `/feature-dev [feature-slug or request]` → `skills/feature-dev/SKILL.md`

Builds **one screen-task** end-to-end under **Feature-Sliced Design**, from a raw request or a
scoped spec-dev-kit payload (orchestrator-kit splits an app spec) to a reviewed, gate-green
branch — and **stops there**. Shipping is a separate, human-typed command.

Required companion: **frontend-dev-kit** (`architecture-audit`, `code-review`, `testing`).
Host app must already be an FSD tree under `src/` — this kit does not clone a starter.

The running pipeline's source of truth is
[`skills/feature-dev/references/pipeline-flow.md`](skills/feature-dev/references/pipeline-flow.md).
[`base.md`](./base.md) is historical boilerplate (stack, FSD target, original agent roster) — same
role as spec-dev-kit's `spec-analysis.md`.

---

## Install

Install **this plugin and `frontend-dev-kit`**.

### Claude Code

```text
/plugin install frontend-dev-kit@dev-cursor-plugins
/plugin install feature-dev-kit@dev-cursor-plugins
```

Local development from this marketplace repo:

```bash
claude --plugin-dir ./frontend-dev-kit
claude --plugin-dir ./app-dev-kit/feature-dev-kit
```

### Cursor

From this marketplace repo:

```bash
npm run install:cursor-local
```

Then **Developer: Reload Window** and enable the kits under **Customize → Plugins**.

Or add the marketplace in Agent chat:

```text
/add-plugin https://github.com/Ksarelto/dev-cursor-plugins
```

Set `CONTEXT7_API_KEY` in the environment (see [`mcp.json`](./mcp.json) and
[`skills/feature-dev/references/mcp-servers.md`](skills/feature-dev/references/mcp-servers.md)).

---

## Quick start

1. *(optional)* Run `/generate-spec` then `/orchestrate-app` so each `/feature-dev` run receives one screen-task (`TASK_ID`, `SCREEN_REF`, …).
2. Confirm **frontend-dev-kit** is installed and `src/` is FSD.
3. Run `/feature-dev` (or `/feature-dev sign-in`).
4. Answer clarification questions, then approve the acceptance criteria (**gate 1**).
5. Approve any proposed new dependency (**gate 2**, only if one is proposed).
6. Review the finished branch and approve (**gate 3**).
7. Type `/create-pr` yourself. No agent can.

---

## What it produces

```
.spec/features/<slug>.md          # the blackboard: request → criteria → plan → gate log → review
src/shared/…                      # shadcn primitives, base api, config (only if the feature needs them)
src/entities/<entity>/            # api + model + ui segments, public index.ts
src/features/<slug>/              # the interaction slice
src/widgets/… · src/pages/…       # composition
src/app/…                         # routes, navigation, providers
*.test.tsx                        # colocated, coverage at threshold
feature/<TICKET>-<slug>           # branch, committed, never pushed
```

---

## Directory layout

```
feature-dev-kit/                             ← plugin root (KIT_DIR)
  README.md                                  ← you are here
  base.md                                    ← historical (2026-07 boilerplate); see pipeline-flow.md
  mcp.json                                   ← shadcn (stdio) + context7 (HTTP, CONTEXT7_API_KEY)
  .claude-plugin/plugin.json
  .cursor-plugin/plugin.json                 ← same fields and paths as Claude
  agents/                                    # 15 pipeline agents
    feature-orchestrator.md                  ← opus | sequences stations 1–11; packets only; blackboard Write; never src/
    architecture-auditor.md                  ← sonnet | Stations 1.5 / 9.5 REPORT_ONLY; no Write; preloads architecture-audit
    upstream-interpreter.md                  ← haiku | scoped YAML + prototype → compact slice
    spec-analyst.md                          ← sonnet | request → testable spec; CLARIFY_PACKET; never approved
    code-explorer.md                         ← haiku | reuse/impact mapping; blackboard Write only
    research-analyst.md                      ← sonnet | context7 investigation; proposes deps, never installs
    slice-engineer.md                        ← sonnet | small-scope consolidated builder (LAYER + SLICE)
    shared-engineer.md                       ← sonnet | shared/ layer; the only agent that may run yarn add
    entities-engineer.md                     ← sonnet | entity slices: api + model + ui
    features-engineer.md                     ← sonnet | interaction slices
    composition-engineer.md                  ← sonnet | widgets + pages
    app-engineer.md                          ← sonnet | routes, navigation, providers
    test-engineer.md                         ← sonnet | colocated tests; frontend-dev-kit:testing
    quality-gate-runner.md                   ← haiku | runs gates, Gate log Write, returns only failures
    code-reviewer.md                         ← opus | conventions + AC coverage; FSD audit is station 9.5
  skills/
    feature-dev/                             ← the pipeline entry point
      SKILL.md                               ← prerequisites, resume table, the skill-owned human gates
      references/                            ← loaded on demand by the station that needs them
        pipeline-flow.md                     ← CANONICAL station map (single source of truth)
        development-cycle.md                 ← outer hub loop + inner increment loop
        upstream-contract.md                 ← spawn payload + YAML field map (one screen-task)
        packets.md                           ← CLARIFY / DEP / REVIEW / ESCALATION envelopes
        orchestration-protocol.md            ← delegation contract, handoff-via-spec, escalation
        feature-spec-format.md               ← blackboard schema + status lifecycle
        fsd-architecture.md                  ← layers, slices, segments, placement rules
        fsd-import-boundaries.md             ← the import matrix + Steiger config
        investigation-protocol.md            ← context7 flow + dependency-proposal policy
        quality-gates.md                     ← gate commands, thresholds, remediation hints
        definition-of-done.md                ← the standing bar, independent of acceptance criteria
        increment-protocol.md                ← thin-slice discipline inside one slice
        human-review-protocol.md             ← what the human sees at station 12
        context-budget.md                    ← per-agent payload allowlist + size guards
        artifact-naming.md                   ← slug → branch → spec → slice paths
        mcp-servers.md                       ← shadcn + context7 setup and verification
      templates/
        feature-spec.md                      ← the blackboard skeleton
        build-plan.md                        ← station-2 plan + AC-coverage table
        delegation-message.md                ← the worker briefing format
        review-packet.md                     ← the station-12 packet
      scripts/
        new-feature.sh                       ← slug guard + branch + spec scaffold
        import-upstream.mjs                  ← scoped YAML + prototype → blackboard
        validate-feature-spec.mjs            ← deterministic blackboard gate (station 0.5)
        run-gates.sh                         ← gate sequence → JSON; failures to a log, not to context
        mock-flow.mjs                        ← contract tests (no LLM)
    create-slice/  create-entity/  create-feature/  create-widget/  create-page/
    create-shared-ui/  create-react-component/  add-route/  wire-navigation/
    add-text-content/  generate-feature-spec/  investigate-dependency/
    run-quality-gates/  create-pr/           ← create-pr is human-only (disable-model-invocation: true)
  rules/                                     ← coding conventions; Cursor auto-attaches via globs
    typescript-patterns.mdc  react-patterns.mdc  tanstack-query-v5.mdc  vitest-rtl-patterns.mdc
    form-patterns.mdc  shadcn-ui-conventions.mdc  styling-conventions.mdc
    accessibility.mdc  ui-quality.mdc  git-workflow.mdc
```

**Path convention.** Inside agents and skills, `references/…` and `templates/…` resolve to
`{KIT_DIR}/skills/feature-dev/…` and `rules/…` to `{KIT_DIR}/rules/…`. `KIT_DIR` is the **plugin
root** (this directory when installed). Never hardcode `.spec/feature-dev-kit/`. A consumer copy at
`.spec/feature-dev-kit/` is a fallback the skill still resolves, not the marketplace path.

---

## references/ vs. rules/

| | `skills/feature-dev/references/` | `rules/` |
|---|---|---|
| Contains | How the **pipeline** runs: stations, gates, budgets, protocols | How the **code** is written: React, TS, queries, forms, styling, a11y |
| Read by | The orchestrator and the station that needs it | Whichever engineer is authoring a file |
| Loaded | On demand, named in the delegation's `APPLY` | Auto-attached by glob in Cursor (`.mdc` frontmatter); named explicitly for agents |
| Ships to | plugin `skills/feature-dev/references/` | plugin `rules/*.mdc` |

A protocol that changes how agents coordinate goes in `references/`. A convention that changes what
the emitted `.tsx` looks like goes in `rules/`.

---

## Pipeline

```
request (or orchestrator-kit screen-task + .spec/app/spec-*/spec.md)
      │
feature-dev skill
  Station 0    intake — upstream-interpreter + spec-analyst → .spec/features/<slug>.md
  Station 0.5  🧑 GATE: spec approval (validate-feature-spec.mjs, then human)
      │
  ⇢ spawn feature-orchestrator (MODE: build)
      Station 1    discovery — code-explorer            → FSD impact + reuse map
      Station 1.5  baseline architecture-auditor         → REPORT_ONLY
      Station 1a   investigation — research-analyst      ← conditional (context7)
      Station 1b   ⇢ DEP_PACKET                          ← 🧑 GATE: dependency approval
      Station 2    planning                              ↓ GATE: build-plan
      Station 3    shared/                               ↓ GATE: layer-green
      Station 4    entities/     × N PARALLEL            ↓ GATE: layer-green
      Station 5    features/     × N PARALLEL            ↓ GATE: layer-green
      Station 6    widgets/ + pages/ × N PARALLEL        ↓ GATE: layer-green
      Station 7    app/                                  ↓ GATE: layer-green
      Station 8    tests — test-engineer                 ↓ GATE: coverage
      Station 9    gate sweep — quality-gate-runner      ↓ GATE: all-green
      Station 9.5  architecture-auditor (changed paths)   ↓ GATE: architecture-clean
      Station 10   auto-review — code-reviewer           ↓ GATE: review-clean
      Station 11   fix loop (max 3 per gate → escalate)
      ⇢ RETURN REVIEW_PACKET
      │
feature-dev skill
  Station 12   🧑 GATE: human review (max 3 cycles)
      │
      ▼
/create-pr   ← separate, human-typed, never model-invoked
```

For per-station contracts, revise re-entry points, and parallelism rules see
`skills/feature-dev/references/pipeline-flow.md`.

---

## Gates and loop guards

| Gate | Owner | Pass condition | On exceed |
|------|-------|---------------|-----------|
| Spec approval | skill (human) | Criteria testable; validator exits 0 | 3 clarification rounds → unknowns become open questions |
| Dependency approval | skill (human) | Every proposed package signed off | Rejected → plan returns for an alternative |
| Layer green | orchestrator | typecheck · lint · FSD boundaries | 3 fix attempts → escalate with gate log |
| Coverage | orchestrator | branches ≥73 · functions ≥78 · lines ≥87 · statements ≥86 | 2 attempts → escalate; never game coverage |
| Auto-review | orchestrator | No `[CRITICAL]`, no unresolved `[IMPORTANT]` | 2 attempts → escalate with findings |
| Architecture audit | architecture-auditor | REPORT_ONLY: zero hard violations on changed paths | Fix loop; missing companion skill → escalate |
| Human review | skill (human) | Explicit `approve` | 3 cycles → accept-as-is / iterate / abort |

Thresholds are defined once in `references/quality-gates.md` and referenced everywhere else.

---

## Non-negotiables

1. **Both human gates are skill-owned.** A subagent's `AskUserQuestion` never reaches the user, so an
   in-agent gate would silently self-approve.
2. **No package is installed without human sign-off.** Adding a dependency is hard to reverse.
3. **Bottom-up, gated per layer.** Nothing is built on a red gate.
4. **The spec file is the handoff medium.** Chat output is not state.
5. **One screen-task per run.** Orchestrator-kit splits the app spec.
6. **No agent ships.** No push, no merge, no PR — `/create-pr` is human-typed only.

---

## Relationship to the other kits

```
/generate-spec   (spec-dev-kit)      → .spec/app/spec-*/spec.md
      ├────────────────────────────► /generate-html (html-generator-kit) → clickable prototype
      └────────────────────────────► /orchestrate-app → /feature-dev once per screen-task
```

`/feature-dev` reads a **scoped** upstream payload (`SCREEN_REF`, `AC_REFS`, …) when orchestrator-kit
(or the human) provides one. It never dumps every app screen into one blackboard.

---

## Adoption

1. Install this plugin **and** `frontend-dev-kit` (required for architecture-audit / code-review / testing).
2. Merge `mcp.json` into the consumer repo root `.mcp.json`; set `CONTEXT7_API_KEY`; verify both servers per `references/mcp-servers.md`.
3. Add the FSD boundary linter (Steiger) and wire `yarn lint:fsd` into the gate sequence.
4. Confirm the gate commands in `references/quality-gates.md` match the project's `package.json`.
5. Start narrow: one entity slice + one feature + one page, with every gate human-supervised.

`isolation: worktree` on parallel engineers and TaskCreate/TaskUpdate tools on the hub are
**Claude Code fields**. Cursor support is not verified; the station map still holds if the host
runs those workers sequentially. Agent YAML MCP tool names (`mcp__shadcn__…`) are Claude-shaped;
merge `{KIT_DIR}/mcp.json` into the consumer config (see `references/mcp-servers.md`).
