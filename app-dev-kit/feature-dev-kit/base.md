# Feature Factory — Base Architectural Boilerplate

> **Historical (2026-07).** Stack, FSD target, and the original agent roster. The running
> pipeline is [`skills/feature-dev/references/pipeline-flow.md`](skills/feature-dev/references/pipeline-flow.md).
> Human gates, packets, and shipping live there — **not** here. Do **not** follow
> `AskUserQuestion` on workers or a `push-branch` skill from this file; those were superseded
> (skill-owned packets; `/create-pr` inlines git). Same role as spec-dev-kit's `spec-analysis.md`.

**Reference template**: iv-frontend (this repository)

**Reference template**: iv-frontend (this repository)
**Architecture target**: **Feature-Sliced Design (FSD)**
**UI target**: **shadcn/ui** (Radix + Tailwind + CVA), added via the **shadcn MCP server**
**Purpose**: The base architectural boilerplate for a **spec-driven development pipeline**. It defines the stack, conventions, architecture, tooling (MCP servers), and the multi-agent factory that will **generate all downstream artifacts** — rules, skills, agents, scaffolds, and ultimately features — for future projects. An **orchestrator agent** decomposes a spec, delegates to specialist agents that build **FSD slices**, drives deterministic quality gates, and hands a finished-but-unshipped result to a **human-in-the-loop** review stage. Shipping (pull request) is a **separate, human-invoked command** — never automated.

> This document is the **source-of-truth spec** the pipeline reads from. It is a **plan/boilerplate only** — it describes the architecture and lists every rule, skill, and agent to be generated; it does **not** create any of them.

**How to read this file**: the *current* project is a **template** — it demonstrates how components are authored, how the layers are organized, and the baseline stack. Future generation **inherits those conventions** but targets the **FSD** structure and **shadcn** UI described here. §0 makes the template-vs-target split explicit.

---

## 0. Role of This Repository — Template & Generation Target

The pipeline is **spec-driven**: a spec (this file + per-feature specs) is the source of truth, and the factory generates artifacts to satisfy it. This repository plays **two roles**:

1. **Reference template** — future generation reads it to learn *how we build*: file/folder layout per unit, naming, exports, colocated tests, data-fetching patterns, forms, error handling. These conventions are **inherited verbatim**.
2. **Migration baseline** — its *structure* (layered) and *UI stack* (AntD + styled-components) are being upgraded to the **targets** (FSD + shadcn). Generation follows the target, not the legacy shape.

### 0.1 Inherited vs. Target

| Dimension | Inherited from template (keep) | Target for generation (adopt) |
|-----------|-------------------------------|-------------------------------|
| Language | TypeScript 5.7+, strict, no `any` | same |
| Framework | React 19 (function components, hooks, compiler) | same |
| Build/Test | Vite 6, Vitest 3 + RTL, `rendererRTL` wrapper | same |
| Data fetching | TanStack Query 5 hooks per domain, `queryHandler`, `apiRequest` | same, re-homed into FSD `entities/*/api` |
| Forms | React Hook Form 7, typed `useForm` | same |
| **Architecture** | layered (`pages/containers/components/api/utils`) | **Feature-Sliced Design** (§3) |
| **UI primitives** | Ant Design 5 | **shadcn/ui** (Radix + Tailwind + CVA) via shadcn MCP |
| **Styling** | styled-components 6, `theme.color.*`, rem | **Tailwind + CVA + shadcn tokens** (styled-components only where a slice must wrap legacy) |
| Conventions | named exports, `: JSX.Element`, colocated `.tsx/.styles/.test/index.ts`, no comments, `TextContent` strings, `ENV` proxy, `isErrorResponse` guard | **inherited verbatim** — carried onto shadcn/FSD units |

> **Styling decision**: shadcn requires Tailwind, so the future UI stack moves from styled-components/AntD to **Tailwind + shadcn**. Authoring *conventions* (colocation, public API `index.ts`, named exports, test coverage) are preserved. This is the one deliberate stack change; if legacy interop is needed, styled-components may remain in `shared/ui` adapters only. *(Reversible — flip this row if you'd rather keep styled-components.)*

### 0.2 Tooling — MCP servers the pipeline depends on

| MCP server | Role in the factory | Used by |
|------------|--------------------|---------|
| **shadcn** (`npx shadcn@latest mcp`, in `.mcp.json`) | Browse the component registry, read component source/demos, and add UI primitives into `shared/ui` — the source of generated UI | `shared-engineer`, `composition-engineer`, `code-explorer` |
| **context7** | Version-accurate library docs for new/unfamiliar packages (§ investigation) | `research-analyst` |

Both are **prerequisites** (Phase 0/1). The shadcn MCP is how the factory obtains UI components instead of hand-writing primitives; context7 is how it learns unfamiliar APIs without hallucinating.

---

## 1. Vision — What "Dark Factory" Means Here

A dark factory (lights-out manufacturing) runs the line with minimal human presence: raw input enters, automated stations transform it, quality control rejects defects, and a finished product exits **for inspection**. Translated to iv-frontend under FSD:

```
Feature request (raw input)
      │
      ▼
┌──────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR  ── reads spec, plans, delegates, gates, retries │
└──────────────────────────────────────────────────────────────┘
      │        │          │             │          │          │
      ▼        ▼          ▼             ▼          ▼          ▼
   Spec →  Explore →  Investigate →  Build FSD →  Test →  Auto-review
  analyst (patterns) (unfamiliar     slices bottom-up     (evaluate+fix)
     ▲               tech / new pkg   (shared→entities→
     │               via context7)    features→widgets→pages→app)
  follow-up questions ──► human   │        │          │          │
  (clarification loop)             │        │          │          │
     └───────┴─────── shared feature spec (blackboard) ──────────┘
                              │
                              ▼
                 ╔══════════════════════════════╗
                 ║  HUMAN-IN-THE-LOOP (gate)     ║  ← pipeline STOPS here
                 ║  inspect diff + spec, approve ║
                 ╚══════════════════════════════╝
                              │  (human decision)
                              ▼
                 /create-pr  ← SEPARATE manual command
```

The human states **what** they want and **approves the result**. The pipeline decides **how**, executes it, and self-checks against the codebase's own rules — but it **stops at the human gate**. Creating the pull request is an explicit, separately-invoked command the human runs after approving.

Before building, the line is not blindly autonomous: when requirements are ambiguous the pipeline **asks the human follow-up questions** (clarification loop), and when a feature needs unfamiliar tech or a **new package** it runs an **investigation** step that pulls authoritative, version-accurate docs via the **context7 MCP server** and proposes a dependency for **human approval** — no package is installed without sign-off.

---

## 2. Design Principles (grounded in Anthropic's agent guidance)

The architecture combines four of the five canonical workflow patterns from Anthropic's *Building Effective Agents*:

| Pattern | Where it is used in the factory | Why |
|---------|----------------------------------|-----|
| **Orchestrator–Workers** | Core loop: orchestrator decides *which* slice-workers to spawn per feature | Feature decomposition is unpredictable — subtasks vary per request |
| **Prompt Chaining** | The FSD build spine: shared → entities → features → widgets → pages → app | Each layer may import only from layers below it, so building bottom-up means every worker's inputs already exist |
| **Parallelization (sectioning)** | Independent slices within the same layer (e.g. two unrelated entities, or two features) | Independent slices → speed; each worker's verbose output stays out of the orchestrator's context |
| **Evaluator–Optimizer** | Auto-review→fix and test→fix loops | Clear pass/fail criteria (lint, types, coverage, FSD-boundary lint, review verdict) make iterative refinement effective |

**Non-negotiable principles** (each traceable to a documented failure mode):

1. **Context isolation** — every worker runs in its own context window and returns a *lightweight summary + file references*, never raw logs/diffs.
2. **External memory (blackboard)** — the shared per-feature spec file is the single source of truth; workers read from and write to it rather than routing everything through the orchestrator.
3. **Detailed task descriptions** — the orchestrator hands each worker *an objective, expected output, the exact skills/rules to apply, the target slice/layer, and clear boundaries*.
4. **Scale effort to complexity** — the orchestrator right-sizes the number of workers (a copy tweak ≠ a new entity + feature + page).
5. **Deterministic safeguards** — non-AI gates run between stages: `typecheck`, `lint`, `build`, coverage, **and FSD boundary lint**.
6. **End-state evaluation** — success is judged by the final state, not the exact path taken.
7. **Model routing for cost** — read-only/mechanical stations use cheaper models; reasoning-heavy stations use stronger ones (see §6).
8. **Human owns the ship decision** — automation never opens a PR; it only produces a reviewable end state (see §9, §10).

---

## 3. Feature-Sliced Design — Target Structure

The factory produces features that conform to FSD. Layers, top (most app-specific) to bottom (most generic); **a layer may import only from layers strictly below it**:

| Layer | Contains | Slices? | Maps from current codebase |
|-------|----------|---------|----------------------------|
| `app` | Routing, providers, global styles, entrypoint, query client | no (segments only) | `src/App`, router, `queryClient`, `theme` providers |
| `pages` | Full route-level screens, composed from widgets/features/entities | yes | `src/pages/*` |
| `widgets` | Large self-contained UI blocks composing features + entities | yes | complex `src/containers/*` (e.g. `ReconciliationLayout`) |
| `features` | User interactions that deliver business value (create/edit/decline, filters) | yes | interaction-focused `src/containers/*`, mutations |
| `entities` | Business entities: model + api + display (profile, document, client, file) | yes | `src/api/[domain]` hooks/types + entity display components |
| `shared` | UI kit, base API client, libs, config, enums — no business logic | no (segments only) | `src/components/*`, `src/utils/*`, `src/hooks`, `src/enums`, `src/constants` |

**Slices** partition a layer by business domain (`entities/profile`, `features/decline-profile`). **Segments** partition a slice by technical purpose:

```
<layer>/<slice>/
  ui/       # components
  model/    # state, business logic, types (store, TanStack Query cache usage)
  api/      # requests, query/mutation hooks, apiMap entries
  lib/      # slice-local helpers
  config/   # constants, enums
  index.ts  # PUBLIC API — the only legal import surface for other slices
```

**Import boundaries** (enforced by lint gate):
- Only downward across layers; never upward or sideways-into-internals.
- Cross-slice imports go **only** through the target slice's `index.ts` public API.
- `shared` imports nothing above it; `app` may import everything.

**Mapping the existing stack into FSD segments**:
- `apiRequest` / `apiMap` / `queryHandler` / `env` / `errorHandler` → `shared/api` + `shared/config`.
- **UI primitives → `shared/ui`, sourced from shadcn via the shadcn MCP** (registry components adapted to our conventions), replacing hand-written AntD wrappers. Legacy AntD wrappers map to `shared/ui` adapters only during migration.
- TanStack Query hooks per domain → `entities/<domain>/api` (+ feature-specific mutations → `features/<x>/api`).
- `queryKeys` → co-located per entity slice, re-exported via `shared` if cross-cutting.
- `textContent`, `testId`, enums → `shared/config`.
- Smart containers → `features/*` (single interaction) or `widgets/*` (composed block).
- Route pages → `pages/*`; routing table + providers → `app`.

> **Coexistence note**: the repo is currently *layered-modular*, not FSD. See §13 open question on migrate-all vs. new-features-in-FSD.

---

## 4. The Feature Pipeline (stations)

| # | Station | Responsibility | FSD scope | Output |
|---|---------|----------------|-----------|--------|
| 0 | **Intake & Spec** | Request → structured, testable spec; **ask the human follow-up questions** when data is missing | — | `feature spec` doc (§5) |
| 1 | **Context Discovery** | Reuse candidates, affected slices, naming precedents | all layers (read) | context report in spec |
| 1a | **Investigation & Dependencies** *(conditional)* | Research unfamiliar approaches; evaluate & **propose** new packages via **context7 MCP** + web; ask further follow-ups | — | tech-investigation + dependency proposal in spec |
| 2 | **Planning** | Build sequence (bottom-up), worker allocation, parallel groups | — | build plan |
| 3 | **Shared layer** | UI-kit / base-api / lib additions (only if the feature needs them) | `shared` | `shared/*` files |
| 4 | **Entities layer** | Entity slices: `model` + `api` + `ui` segments | `entities/*` | entity slices |
| 5 | **Features layer** | Interaction slices (the business action) | `features/*` | feature slices |
| 6 | **Widgets + Pages** | Compose features/entities into blocks and screens | `widgets/*`, `pages/*` | widgets, pages |
| 7 | **App wiring** | Routes, providers, navigation | `app` | routing/nav updates |
| 8 | **Testing** | Unit/integration tests to threshold | per slice | `*.test.tsx` |
| 9 | **Quality Gates** | typecheck · lint · build · coverage · **FSD boundaries** | — | pass/fail + details |
| 10 | **Auto-Review** | Rule-based review vs `main` | — | severity-tagged report |
| 11 | **Fix Loop** | Apply gate + review fixes, re-run gates | — | patched files |
| 12 | **🧑 Human-in-the-loop** | **Human inspects diff + spec, approves or requests changes** | — | approval / change requests |
| — | **Ship** *(separate command)* | Human runs `/create-pr` to open the PR | — | PR URL |

Station **1a is conditional** — it runs only when Context Discovery flags an unfamiliar requirement or a capability not covered by the current dependencies. It ends in a **dependency-approval checkpoint**: a human must approve each proposed package before install (adding a dependency is a hard-to-reverse action). Stations 3–7 follow the FSD **bottom-up** order so each worker's dependencies already exist. Slices within a layer may be built **in parallel**. Stations 8–11 are the evaluator–optimizer loop. **Station 12 halts the automated line.** Shipping is intentionally *not* a station — it is a manual command (see §8).

---

## 5. Shared External Memory — The Feature Spec Contract

The spine of the system: one markdown file per feature acts as the **blackboard** every agent reads and updates. Location: `.spec/features/<feature-slug>.md`.

**Why a file, not conversation state**: it survives context resets, lets a fresh worker start with clean context and still know the plan, and gives the human a single artifact to inspect at station 12.

Proposed schema (this format itself becomes a **rule**, §7):

```md
# Feature: <name>          status: draft|awaiting-clarification|investigating|awaiting-dep-approval|approved|building|review|awaiting-human|changes-requested|done

## Request
<verbatim human ask>

## Clarifications (Q&A)       # follow-up questions asked + the human's answers
- Q: ... / A: ...

## Acceptance criteria        # testable checkbox list
- [ ] ...

## FSD impact                 # filled by Context Discovery
- shared:   <ui/api/lib/config additions?>
- entities: <slices + segments>
- features: <slices + segments>
- widgets:  <slices>
- pages:    <slices>
- app:      <routes/providers>

## API contract / Data model  # endpoints, payloads, response & entity types
## UI surface                 # screens, states (loading/empty/error), interactions
## Reuse map                  # existing slices/public-APIs to reuse
## Tech investigation         # unfamiliar approaches researched (context7 / web) + findings & chosen approach
## Dependencies               # proposed packages: name · version · why · bundle size · license · human-approved? (y/n)
## Build plan                 # bottom-up ordered tasks, worker assignments, parallel groups
## Gate log                   # timestamped pass/fail per quality gate
## Human review               # station-12 verdict + requested changes
## Decisions & open questions  # anything requiring human input
```

Handoff rule: a worker **must** update its section before returning; the orchestrator reads the spec (not chat output) to decide the next step.

---

## 6. Agents to Implement (`.claude/agents/`)

None exist today (`.claude/agents/` is empty). Format: markdown + YAML frontmatter (`name`, `description`, `tools`, `model`, `skills`, `permissionMode`, `isolation`, `maxTurns`, …).

### 6.1 Orchestrator

| Field | Recommendation |
|-------|----------------|
| **name** | `feature-orchestrator` |
| **role** | Owns the spec, plans the bottom-up FSD build, delegates to slice-workers, runs gates between stations, drives the fix loop, and **stops at the human gate**. Writes little code itself. **Never opens a PR.** |
| **model** | `opus` |
| **tools** | `Read`, `Grep`, `Glob`, `Write`/`Edit` **only** on the feature blackboard, `Task*`, `Agent`, `Bash` — **never** `src/` |
| **consumes** | `fsd-architecture.md`, `orchestration-protocol.md` (new rules), the feature spec |
| **stops at** | station 12 — emits an "awaiting-human" summary and **does not proceed to ship** |

### 6.2 Specialist Workers (FSD-aligned)

| Agent | Role / boundary | Model | Tools | Skills/Rules it applies |
|-------|-----------------|-------|-------|--------------------------|
| `spec-analyst` | Request → structured spec + acceptance criteria; return CLARIFY_PACKET | `opus`/`sonnet` | `Read`,`Grep`,`Glob`,`Write` (no AskUserQuestion) | `generate-feature-spec` skill, `feature-spec-format` |
| `upstream-interpreter` | Scoped YAML + prototype → compact slice | `haiku` | `Read`,`Bash` | `import-upstream.mjs` |
| `slice-engineer` | Small-scope LAYER+SLICE builder | `sonnet` | build tools | matching `create-*` skills |
| `code-explorer` | Map reuse candidates + affected slices; browse the shadcn registry for existing primitives before anything is authored; **read-only** | `sonnet`/`haiku` | read-only + shadcn MCP (browse) | `fsd-architecture.md` |
| `research-analyst` | Investigate unfamiliar requirements; evaluate & **propose** new packages using **context7 MCP**; **never installs**; never AskUserQuestion | `opus`/`sonnet` | context7 MCP tools, `WebSearch`, `WebFetch`, `Read`, `Grep`, `Glob` | `investigation-protocol.md` |
| `shared-engineer` | Add to `shared` (UI kit, base api, lib, config); **pulls shadcn primitives via shadcn MCP** into `shared/ui`; **installs human-approved packages** (`yarn add`) | `sonnet` | `Read`,`Write`,`Edit`,`Bash`,`Glob`,`Grep`, **shadcn MCP** | `create-shared-ui` skill, `fsd-architecture.md`, `investigation-protocol.md` |
| `entities-engineer` | Build entity slices (`model`+`api`+`ui`) | `sonnet` | build tools, shadcn MCP (ui segment) | `create-entity` skill, `api-patterns.md`, `fsd-architecture.md` |
| `features-engineer` | Build feature (interaction) slices | `sonnet` | build tools, shadcn MCP (ui segment) | `create-feature` skill, `react-coding-principles.md` |
| `composition-engineer` | Build widgets + pages (compose lower layers); **assembles shadcn blocks via shadcn MCP** | `sonnet` | build tools, **shadcn MCP** | `create-widget`, `create-page` skills |
| `app-engineer` | App layer: routes, navigation, providers | `sonnet` | `Read`,`Write`,`Edit`,`Glob`,`Grep` | `add-route`, `wire-navigation` skills |
| `test-engineer` | Write/fix tests to threshold | `sonnet` | build tools | `testing` skill, `testing-patterns.md` |
| `quality-gate-runner` | Run all gates; return **only** failures | `haiku` | `Bash`,`Read`,`Grep` | `run-quality-gates` skill |
| `code-reviewer` | Review branch vs `main`; severity-tagged report | `opus`/`sonnet` | read-only + `Bash` | `code-review` skill + all coding-principle + FSD rules |

**Removed**: ~~`integrator`~~ — shipping is now a separate human-invoked command (`/create-pr`), not an autonomous agent. No agent has git-push/PR authority.

**Design notes**
- **`isolation: worktree`** recommended for the build workers (`entities/features/composition/app`) so parallel slice work happens on isolated repo copies; empty worktrees auto-clean.
- **Consolidation option**: `entities/features/composition` can collapse into one parametrized `slice-engineer` (told which layer/slice to build) to cut spawn count on small features — decide via the complexity heuristic in `orchestration-protocol.md`.
- **`maxTurns`** guard on `quality-gate-runner` to prevent runaway loops.
- Build an agent only when we need *context isolation, tool restriction, or a distinct model*; otherwise the orchestrator invokes the **skill** directly in-context.

---

## 7. Skills to Implement (`.claude/skills/`)

### 7.1 Existing — reuse, re-homed into FSD segments

| Skill | New role under FSD |
|-------|--------------------|
| `add-api-domain` | Becomes the `api`+`model` segments inside `create-entity` (base for entity slices) |
| `create-component` | Produces `shared/ui` kit items **or** a slice's `ui` segment |
| `create-table` | Produces a `widget` or `feature` with a `ui` segment |
| `testing` | Station 8 (per-slice tests) |
| `code-review` | Station 10 (auto-review) — extend with FSD-boundary checks |
| ~~`push-branch`~~ | **Superseded.** `/create-pr` inlines rebase + `git push --force-with-lease`. There is no `push-branch` skill in this marketplace. |

### 7.2 New authoring skills — gap analysis

| Skill | Why needed |
|-------|-----------|
| `generate-feature-spec` | Intake: raw ask → structured spec (§5). Remaining gaps as a **CLARIFY_PACKET** (skill asks). Never sets `approved`. |
| `investigate-dependency` | Given a capability need, resolve the library via **context7** and fetch version-accurate docs (`resolve-library-id` → `get-library-docs`), summarize integration approach + risks (bundle size, license, maintenance, alternatives), and emit a dependency proposal for human approval. Never runs `yarn add`. |
| `create-slice` | Core FSD scaffold: create `<layer>/<slice>/{ui,model,api,lib,config,index.ts}` with correct public API. Foundation for the ones below. |
| `create-entity` | Entity slice (model + api + ui), wraps `add-api-domain` logic into the entity's `api` segment. |
| `create-feature` | Feature (interaction) slice with typed handlers/mutations. |
| `create-widget` | Widget slice composing features/entities. |
| `create-page` | FSD page slice (route-level, default export allowed per repo convention). |
| `create-shared-ui` | Add a UI-kit item to `shared/ui` by pulling it from the **shadcn registry via shadcn MCP**, then adapting it to our conventions (colocation, named export, `index.ts`, tokens). Only hand-write when the registry has no fit. |
| `add-route` | Wire routing table + lazy page import in `app`. |
| `wire-navigation` | Menu/nav/breadcrumb entries in `app`. |
| `add-text-content` | Add keys to `shared/config` text content + enums. |
| `run-quality-gates` | Wrap typecheck→lint→build→coverage→FSD-boundary into one structured pass/fail gate. |

### 7.3 The separate ship command (human-invoked)

| Skill / command | Behavior |
|-----------------|----------|
| **`/create-pr`** | A standalone slash command the **human** runs *after approving at station 12*. Steps: verify gates are green → rebase over the integration branch → `git push --force-with-lease` (inlined; there is no `push-branch` skill) → open PR via `gh` with a body templated from the feature spec (summary, acceptance criteria, test plan). **`disable-model-invocation: true`** so it never auto-triggers; only a human types `/create-pr`. |

This deliberately decouples "produce a reviewable feature" (automated) from "publish it" (human decision).

---

## 8. Rules to Implement (`.claude/rules/`)

### 8.1 Existing — reuse

`architecture.md` (kept for legacy layered code), `api-patterns.md`, `testing-patterns.md`, `development-practices.md`, `general-coding-principles.md`, `react-coding-principles.md`.

### 8.2 New rules — gap analysis

| Rule | Purpose |
|------|---------|
| `fsd-architecture.md` | **The central new rule.** Layers, slices, segments, the downward-import boundary, public-API-via-`index.ts`, and how the existing stack maps into FSD (§3). Supersedes `architecture.md` for factory output. |
| `fsd-import-boundaries.md` | The precise import matrix + lint config (Steiger / eslint-boundaries) the FSD-boundary gate enforces. |
| `orchestration-protocol.md` | Orchestrator contract: delegation format, handoff-via-spec, **bottom-up gate ordering**, retry/escalation, worker-count heuristics, **the hard stop at the human gate**. |
| `feature-spec-format.md` | Canonical schema of §5. |
| `investigation-protocol.md` | When to trigger investigation (station 1a); how to use the **context7 MCP** (`resolve-library-id` → `query-docs`) and when to fall back to web; **HITL is skill-owned** — workers return `CLARIFY_PACKET` / `DEP_PACKET`, they never call `AskUserQuestion` (see `pipeline-flow.md`); the **dependency policy** — a human must approve every new package (name/version/size/license) before any `yarn add`, and security/maintenance red flags block adoption. |
| `quality-gates.md` | Exact gate commands, order, thresholds, per-failure remediation. |
| `human-review-protocol.md` | What the human is shown at station 12 (diff summary, spec, gate log), the decision options (approve / request changes → back to fix loop), and that **only** approval unlocks `/create-pr`. |
| `git-workflow.md` | Branch naming, commit convention (`[TICKET] message`), PR template, protected-branch rules — consumed by `/create-pr`. |
| `form-patterns.md` | React Hook Form conventions — used when features contain forms (shadcn `Form` + RHF resolver). |
| `shadcn-ui-conventions.md` | How the factory uses the **shadcn MCP**: registry-first (browse → add → adapt), Tailwind + CVA variant conventions, token/theme setup, when to compose vs. author, and how a shadcn component is re-homed into `shared/ui` with our colocation + public-API rules. |
| `styling-conventions.md` | Tailwind + CVA rules replacing the styled-components/rem guide: design tokens, `cn()` merge helper, variant patterns, dark-mode, and the legacy styled-components interop boundary. |
| `accessibility.md` | a11y baseline (Radix primitives give a head start) so autonomous UI meets a bar before human review. |

---

## 9. Quality Gates (deterministic safeguards)

Run by `quality-gate-runner` between stations; the orchestrator **blocks progression** on failure and routes to the fix loop.

| Gate | Command | Pass condition |
|------|---------|----------------|
| Types | `yarn typecheck` | zero errors |
| Lint | `yarn lint` | zero errors |
| **FSD boundaries** | Steiger (or eslint import-boundaries) | no upward/cross-slice-internal imports; every slice has a public `index.ts` |
| Build | `yarn build` | succeeds |
| Coverage | `yarn test:auto` | branches ≥73%, functions ≥78%, lines ≥87%, statements ≥86% |
| Auto-review | `code-review` skill | no `[CRITICAL]`, no unresolved `[IMPORTANT]` |
| **Dependency approval** *(human, station 1a)* | human sign-off on each proposed package | required **before** any `yarn add` |
| **Human approval** *(station 12)* | human review of the finished feature | human sets spec status to `approved` |

**Checkpoint policy**: after 2–3 failed fix-loop iterations, the orchestrator **escalates to the human** with the gate log instead of looping forever.

---

## 10. Orchestration Protocol (delegation & handoff)

1. **Intake + clarify** → `spec-analyst` drafts the spec and, when data is missing, returns a **`CLARIFY_PACKET`** (the `feature-dev` skill asks the human — workers never call `AskUserQuestion`); Q&A is recorded in the spec; **human approves the spec** (checkpoint 1).
2. **Discover** → `code-explorer` fills "FSD impact" + "Reuse map".
3. **Investigate (conditional)** → if the feature needs an unfamiliar approach or a **new package**, `research-analyst` uses **context7 MCP** (+ web) to gather version-accurate docs, records findings under "Tech investigation", proposes a dependency (version, size, license, integration notes), and may ask further follow-ups. → **dependency-approval checkpoint (1b)**: the human approves/rejects each package. Approved packages are installed by `shared-engineer` during build; rejected ones send the plan back for an alternative.
4. **Plan** → orchestrator writes the bottom-up "Build plan"; scales worker count to complexity.
5. **Build (bottom-up)** → `shared` → `entities` → `features` → `widgets`+`pages` → `app`. Independent slices in a layer run in parallel. Each worker: objective + boundary + target slice + skills/rules → work → update spec section → return summary + file paths.
6. **Gate** after each layer group. Fail → fix loop; pass → continue.
7. **Test** → `test-engineer` → coverage gate.
8. **Auto-review** → `code-reviewer` → fix loop until clean.
9. **🧑 Human-in-the-loop (checkpoint 2)** → orchestrator sets status `awaiting-human` and **stops**. Human inspects diff + spec + gate log and either **approves** or **requests changes** (→ back to fix loop / re-plan).
10. **Ship** → *outside the automated line*: the human runs **`/create-pr`** to publish.

**Delegation message template** (orchestrator → worker):
```
OBJECTIVE:  <one sentence>
SPEC:       .spec/features/<slug>.md  (read inputs from §FSD impact / §API contract)
TARGET:     <layer>/<slice> — segments: <ui|model|api|lib|config>
APPLY:      <skill(s)> + <rule(s)>
BOUNDARY:   create/modify only within the target slice + its public index.ts;
            import only from layers below; do not touch <paths>
RETURN:     summary + files changed; update your spec section
```

---

## 11. Failure Modes & Mitigations (from Anthropic's multi-agent research)

| Failure mode | Mitigation |
|--------------|-----------|
| Building on missing/wrong requirements | Clarification loop: `spec-analyst` / `research-analyst` return packets; the **skill** asks the human and records Q&A **before** build (`pipeline-flow.md`) |
| Outdated/hallucinated package API usage | `research-analyst` pulls **version-accurate docs via context7** instead of relying on model memory |
| Wrong / unmaintained / insecure dependency | context7 docs + bundle-size/license/maintenance review + **human dependency approval** before `yarn add` |
| Over-spawning agents | §2 principle 4 + worker-count heuristics + optional consolidated `slice-engineer` |
| Information loss across handoffs | Blackboard spec file (§5); persist + pass lightweight refs |
| Vague delegation → duplicated/wrong work | Delegation template (§10) with objective, target slice, boundary |
| Context flooding | Context isolation (§2.1); summaries only; gate noise stays in gate-runner |
| Cross-layer import violations | FSD-boundary lint gate (§9) blocks them deterministically |
| Runaway loops | `maxTurns` + N-iteration escalation to human |
| Automation ships something wrong | **Human gate (station 12) + PR as a separate manual command** — no agent can publish |
| Non-deterministic "did it work?" | End-state evaluation via gates |
| Cost blowup (~15× tokens) | Model routing: haiku for gates/explore, sonnet for build, opus for orchestrate/review |

---

## 12. Evaluation Harness (how we trust the factory)

- **Golden feature set**: ~10–20 representative past features as regression fixtures; run the pipeline, compare end state (builds? tests pass? FSD-clean? meets acceptance criteria?).
- **LLM-as-judge rubric**: convention + FSD-boundary adherence, reuse vs duplication, test quality, completeness.
- **Human spot-check** for subtle pattern/UX issues automated judges miss (this is also what station 12 institutionalizes).
- Iterate prompts against this set before trusting autonomous runs.

---

## 13. Suggested Implementation Roadmap

**Phase 0 — FSD + UI groundwork**
- Write `fsd-architecture.md` + `fsd-import-boundaries.md`; add the FSD-boundary linter (Steiger) and wire it into `yarn lint`.
- Stand up the **shadcn + Tailwind** foundation: install Tailwind + CVA + `cn()`, run `npx shadcn@latest init`, and confirm the **shadcn MCP** (`.mcp.json`) responds. Write `shadcn-ui-conventions.md` + `styling-conventions.md`.
- Decide migration strategy (see §14 Q1) and the styled-components→Tailwind boundary (§0.1).

**Phase 1 — Foundations (no autonomy)**
- Configure the **context7 MCP server** (add to `.mcp.json` / project settings) and verify `resolve-library-id` / `get-library-docs` work.
- Rules: `feature-spec-format.md`, `quality-gates.md`, `orchestration-protocol.md`, `human-review-protocol.md`, `investigation-protocol.md`, `git-workflow.md`.
- Skills: `run-quality-gates`, `generate-feature-spec`, `investigate-dependency`, `create-slice`, and the `/create-pr` command.

**Phase 2 — Authoring skills + individual workers**
- Skills: `create-entity`, `create-feature`, `create-widget`, `create-page`, `create-shared-ui`, `add-route`, `wire-navigation`, `add-text-content`.
- Author each worker agent (including `research-analyst`); test each in isolation on a real slice.

**Phase 3 — Orchestrated (supervised)**
- Author `feature-orchestrator`; run end-to-end with the human approving spec + every gate + station 12.

**Phase 4 — Dark factory (autonomous, but bounded)**
- Reduce checkpoints to **spec-approval + human gate (station 12)**; enable parallel slice groups + worktree isolation; wire the evaluation harness. Shipping stays manual via `/create-pr`.

---

## 14. Open Questions & Recommendations (my ideas)

1. **FSD migration strategy** — the repo is layered-modular today. Options: (a) big-bang migrate `src/` to FSD; (b) **new features authored in FSD, legacy left in place, bridged via `shared`** (recommended — lower risk, lets the factory prove itself). Either way, `fsd-architecture.md` must document the mapping (§3) so workers place code correctly.
2. **FSD linter** — adopt **Steiger** (the official FSD architectural linter) for the boundary gate; it makes cross-layer violations a *deterministic* failure rather than a review judgment call.
3. **Blackboard location** — `.spec/features/<slug>.md`, checked in: doubles as PR documentation (the `/create-pr` body is generated from it).
4. **Human gate ergonomics** — station 12 should present a *concise* packet (diff stat + spec summary + gate log), not the full diff, so the human decides fast. Detail on demand.
5. **`/create-pr` is human-only** — mark it `disable-model-invocation: true`; no orchestrator or worker may call it. This is the hard boundary between "built" and "shipped."
6. **Start narrow** — first target one archetype: *"new entity slice + one feature + one page."* Your existing `add-api-domain` / `create-component` / `create-table` skills already cover most of the segment-level work; the new pieces are mostly FSD placement, shadcn UI sourcing, and the orchestration layer.
7. **Skill-first, agent-second** — most value is in the authoring skills; agents are the thin isolation/coordination layer. Don't build an agent for work a skill already does in-context.
8. **context7 MCP is a prerequisite** — the investigation station depends on it being configured. It must be added to MCP settings before Phase 2. Its docs are also worth pulling for *existing* deps when an agent is unsure of an API, not only for new packages.
9. **Follow-up questions are a first-class step, not an interruption** — front-load them at intake (and during investigation) so ambiguity is resolved *before* build, when it is cheapest to fix. Keep them batched (skill-owned `AskUserQuestion` on a packet), not one-at-a-time, and never from a subagent.
10. **Dependency approval is a hard gate** — adding a package is hard to reverse (bundle, license, supply-chain surface). Route every new dependency through explicit human sign-off; agents may *propose and document*, never *install unapproved*.
11. **shadcn is registry-first, not hand-rolled** — the factory should *browse then add* from the shadcn registry via MCP and adapt, rather than author primitives from scratch. Keeps generated UI consistent, accessible (Radix), and low-effort. Hand-authoring is the exception, logged in the spec.
12. **The stack change is the biggest risk** — moving AntD + styled-components → shadcn + Tailwind touches every UI unit. Confirm §0.1 before Phase 2. If a full migration is undesirable, scope shadcn to *new* FSD slices and keep AntD in legacy `containers/*` behind `shared/ui` adapters.

---

## 15. References

- Anthropic — [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)
- Anthropic — [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- Claude Code — [Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Feature-Sliced Design](https://feature-sliced.design/) — layers, slices, segments, import rules
- [shadcn/ui](https://ui.shadcn.com/) + [shadcn MCP](https://ui.shadcn.com/docs/mcp) — component registry and MCP server (`npx shadcn@latest mcp`, wired in `.mcp.json`)
- [context7 MCP server](https://github.com/upstash/context7) — version-accurate, up-to-date library documentation for LLMs
- Internal — `CLAUDE.md`, `.claude/rules/*`, `.claude/skills/*`, `.mcp.json`
