---
name: feature-dev
description: Builds a complete React feature end-to-end from a request or an existing spec, following Feature-Sliced Design. Runs the full feature-dev-kit hub-and-spoke pipeline — scoped intake from spec-dev-kit plus an optional html prototype, codebase discovery, architecture-audit, bottom-up slice construction (shared → entities → features → widgets/pages → app), tests, quality gates, and auto-review — then stops at a mandatory human review gate. Never opens a pull request. Use when implementing any new feature, screen, or user interaction in a React + TypeScript codebase.
argument-hint: "[feature-slug or request]"
allowed-tools: [Read, Glob, Grep, Write, Edit, Bash, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, TaskGet]
---

# Feature Dev

**Command**: `/feature-dev [feature-slug or request]`
**Entry point for**: the feature-dev-kit pipeline
**Pipeline driver**: `feature-orchestrator` agent (see `../../agents/feature-orchestrator.md`)
**Blackboard**: `.spec/features/<slug>.md`

This skill runs in the **main conversation**. It owns every `AskUserQuestion` call. The
orchestrator is a subagent and must never ask the user — it returns a packet and stops.

---

## Resolve KIT_DIR (do this first)

`KIT_DIR` is the **plugin root** (the directory that contains `agents/` and `skills/`). Resolve in
this order; use the first that exists:

1. Parent of this skill folder — `{this SKILL.md directory}/../..` (Claude: if
   `${CLAUDE_SKILL_DIR}` is set, `KIT_DIR` is `${CLAUDE_SKILL_DIR}/../..`).
2. `app-dev-kit/feature-dev-kit` relative to the workspace root (this marketplace repo).
3. `.spec/feature-dev-kit` (legacy consumer copy).

All script and reference paths are `{KIT_DIR}/skills/feature-dev/…`. Never hardcode
`.spec/feature-dev-kit/skills/…`.

---

## Companion files (loaded on demand — not loaded unless a step references them)

| Path | Loaded by | When |
|------|-----------|------|
| `references/pipeline-flow.md` | orchestrator, once | canonical station order, tiers, gates, loop guards. This skill does not load it into the main chat |
| `references/development-cycle.md` | this skill, orchestrator, build engineers | outer + inner implement loops |
| `references/upstream-contract.md` | this skill, `upstream-interpreter`, `spec-analyst` | spawn payload and YAML field map |
| `references/packets.md` | this skill, orchestrator, spec-analyst, research-analyst | packet types the hub may return |
| `references/orchestration-protocol.md` | orchestrator | delegation format, handoff-via-spec, retry/escalation |
| `references/feature-spec-format.md` | `spec-analyst` (Station 0), all workers | the blackboard schema every section must satisfy |
| `references/fsd-architecture.md` | every build engineer | layers, slices, segments, where code belongs |
| `references/fsd-import-boundaries.md` | build engineers, `quality-gate-runner` | the import matrix + boundary lint config |
| `references/investigation-protocol.md` | `research-analyst` (Station 1a) | context7 flow, dependency proposal format |
| `references/quality-gates.md` | `quality-gate-runner` (Stations 3–9) | gate commands, thresholds, per-failure remediation |
| `references/definition-of-done.md` | orchestrator (Station 11), `code-reviewer` | the standing bar every increment clears |
| `references/increment-protocol.md` | every build engineer | thin-slice discipline inside one slice |
| `references/human-review-protocol.md` | this skill (Station 12) | what the human is shown and which decisions are offered |
| `references/context-budget.md` | orchestrator, once | handoff-by-link contract and per-agent section allowlists |
| `references/artifact-naming.md` | this skill (Station 0) | slug derivation, branch name, spec path |
| `references/mcp-servers.md` | `shared-engineer`, `research-analyst` | shadcn + context7 setup and verification |
| `templates/feature-spec.md` | `spec-analyst` (Station 0) | blackboard skeleton copied to `.spec/features/<slug>.md` |
| `templates/build-plan.md` | orchestrator (Station 2) | build-plan table format |
| `templates/delegation-message.md` | orchestrator (Stations 3–8) | the exact worker briefing format |
| `templates/review-packet.md` | orchestrator (Station 11 → return) | the Station 12 packet shape |
| `scripts/new-feature.sh` | this skill (Station 0, Bash) | slug + branch + spec scaffold |
| `scripts/import-upstream.mjs` | this skill (Station 0, Bash) | scoped YAML + prototype → blackboard |
| `scripts/validate-feature-spec.mjs` | this skill (Station 0.5, Bash) | deterministic blackboard validation |
| `scripts/run-gates.sh` | `quality-gate-runner` (Bash) | runs the gate sequence, emits JSON |
| `scripts/write-kit-result.mjs` | this skill (Station 12 approve or abort) | `.spec/features/{slug}.kit-result.json` path-only envelope |

The kit's `{KIT_DIR}/rules/` directory holds coding conventions workers apply while writing code.
Name them in each delegation `APPLY`. Companion **frontend-dev-kit** supplies `architecture-audit`
(preloaded by `architecture-auditor`), `code-review`, and `testing` — never copy their files here.

---

## Prerequisites

| Requirement | Check | If missing |
|-------------|-------|-----------|
| Git repo on a non-protected branch | `git rev-parse --abbrev-ref HEAD` | `scripts/new-feature.sh` creates the feature branch |
| FSD host app | `src/app`, `src/pages`, `src/features`, `src/entities`, `src/shared` exist | STOP — this kit does not clone a starter; open the consumer app repo |
| frontend-dev-kit installed | skill `architecture-audit` (or `frontend-dev-kit:architecture-audit`) is resolvable | STOP — required companion; do not skip the audit gate |
| shadcn MCP responding | see `references/mcp-servers.md` | STOP — the kit sources UI from the registry |
| context7 MCP responding | see `references/mcp-servers.md` | Warn; Station 1a falls back to web search |
| Working tree clean | `git status --porcelain` | Ask the human to commit or stash first |

A spec from `/generate-spec` at the `spec_path` in `.spec/app/current.json` (`.spec/spec/spec-*/spec.md`) is **optional but preferred**. When
frontend-orchestrator-kit (or the human) also passes `FEATURE_ID` / `SCREEN_REFS`, Station 0 imports
**only that feature's nested screens**. Never ingest a whole `type: app` spec into one feature run.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[feature-slug or request]` | Optional | An existing slug in `.spec/features/` resumes that feature. Free text starts a new one. Omitted → this skill asks for the request. |

Structured fields (from frontend-orchestrator-kit or the human) may accompany the argument: `UPSTREAM_SPEC`,
`FEATURE_ID`, `TASK_IDS`, `SCREEN_REFS`, `PROTOTYPE_REF`, `CHECKLIST_PATH`, `SLUG_HINT`,
`PARENT_BRANCH`, `RESULT_OUT`. `REQUEST` may be a one-line pointer when `UPSTREAM_SPEC` + `FEATURE_ID`
are set — do not expect an inlined spec body. See `references/upstream-contract.md`.

```
/feature-dev
/feature-dev decline-profile
/feature-dev "reviewers can decline a profile with an optional reason"
```

---

## Steps

Do not read `pipeline-flow.md` into this conversation. The tier table below is the parent-loop contract. The orchestrator reads the station map once inside its own context.

### Step 1 — Resolve the feature

1. `Glob(".spec/features/*.md")`. If the argument matches an existing slug, read **frontmatter `status` only**. If `.spec/features/{slug}.context/session.md` exists, that path is the resume context — do not read the whole blackboard. Report: `"Resuming {slug} at Station {N}."`
2. Otherwise derive a slug per `references/artifact-naming.md`. **Do not** reuse the app spec's
   `metadata.slug` as the feature slug — derive from `SLUG_HINT` (the feature's kebab title),
   so `.spec/features/sign-in.md` does not collide with the app slug. `SLUG_HINT` is required
   when the checklist feature has no title to kebab. Never fall back to the app slug.
3. Resolve upstream from disk, not from chat:
   - If `UPSTREAM_SPEC` was passed, use it.
   - Else read `.spec/app/current.json`. Set `UPSTREAM_SPEC` to `spec_path` and `PROTOTYPE_REF`
     to `prototype_ref` when those fields are non-empty.
   - Then read `.spec/app/task-checklist.md`. If a **feature** matches the request
     (title, slug-hint, or a nested task `screen-ref`), adopt that feature's `FEATURE_ID`,
     nested `TASK_IDS` / `SCREEN_REFS`. A `done` feature is not rebuilt unless that feature,
     or one of its tasks, is `pending` with `blocked-reason: spec changed`. If nothing matches,
     standalone feature — no whole-app dump. Do not glob `.spec/spec/spec-*/spec.md` or `.spec/app/spec-*/spec.md`.

| Spec `status` | Resume at |
|---------------|-----------|
| `draft`, `awaiting-clarification` | Station 0 |
| `approved` | Station 1 |
| `awaiting-dep-approval` | Station 1b |
| `building` | Station 2 (re-plan from the Build plan section) |
| `review`, `changes-requested` | Station 11 |
| `awaiting-human` | Station 12 |
| `done` | Report and stop — nothing to do, unless the checklist row is `pending` with `blocked-reason: spec changed`. Then import with `--changes` and resume at Station 1 |

### Step 2 — Scaffold + scoped import (Station 0)

If `PARENT_BRANCH` is set and `HEAD` is not that branch, `git checkout {PARENT_BRANCH}` first.
Do not check out `develop` / `main` / `master` between features.

```bash
bash {KIT_DIR}/skills/feature-dev/scripts/new-feature.sh {slug}
```

Capture `SLUG`, `BRANCH`, `PARENT`, and `SPEC_PATH` from stdout. `PARENT` is the branch this one
was cut from (`git checkout -b` off the current HEAD). Nested tasks do not call this script.

If `UPSTREAM_SPEC` is set, run the deterministic mapper (never paste spec body into a prompt):

```bash
node {KIT_DIR}/skills/feature-dev/scripts/import-upstream.mjs \
  --spec {UPSTREAM_SPEC} \
  --out {SPEC_PATH} \
  --slug {slug} \
  --feature-id {FEATURE_ID} \
  --task-ids {TASK_IDS} \
  --screen-refs {SCREEN_REFS} \
  --story-refs {comma-separated or omit} \
  --ac-refs {comma-separated or omit} \
  --entity-refs {comma-separated or omit} \
  --prototype-ref {PROTOTYPE_REF or omit} \
  --require-scoped \
  --changes {dirname(UPSTREAM_SPEC)}/artifacts/changes.json
```

Pass `--changes` only when that file exists. `--require-scoped` is mandatory when the upstream spec `type` is `app` or has more than one
screen. Standalone requests omit it. After import, re-read frontmatter `status`. If it is `approved` and the board has `## Change request`, skip Stations 0 and 0.5 and spawn the orchestrator at Station 1. When `CHANGE=remove`, delete the existing pages and routes for those screen refs. Do not scaffold a replacement.

Then spawn `upstream-interpreter` with **paths and ids only** (it may re-run the same script).
Pass its `HANDOFF` path to `spec-analyst` together with `SPEC_PATH`. Do not paste the slice.
If `REQUEST` is more than one line of ids/paths, ignore the extra — the blackboard already has stories/ACs from import.
`spec-analyst` fills remaining gaps and returns a **CLARIFY_PACKET** — it does not ask the human
and it never sets `status: approved`.

Relay each returned question via `AskUserQuestion` (batched, max 3 rounds per
`references/pipeline-flow.md`), write the answers into `## Clarifications`, and re-spawn
`spec-analyst` to refine. Unresolved items after round 3 go to `## Decisions & Open Questions`.

### Step 3 — Spec approval gate (Station 0.5 — THIS skill owns it)

```bash
node {KIT_DIR}/skills/feature-dev/scripts/validate-feature-spec.mjs {SPEC_PATH}
```

When this run has `FEATURE_ID` / `TASK_IDS` / `SCREEN_REFS`, also pass `--require-scoped`.

Exit 1 means required sections are missing or acceptance criteria are untestable — route the
`ERROR [CODE]` lines back to `spec-analyst` (max 2 correction passes).

On exit 0, present the acceptance criteria and ask (single `AskUserQuestion`):
**Approve & build** · **Edit criteria** (relay free text, re-run this step) · **Abort**.

On approval set `status: approved` in the spec front matter. No subagent may do this.

### Step 4 — Choose a tier, then build

Classify from the approved blackboard only (slice count, new package, new route). Do not read the upstream app spec.

| Tier | When | What this skill does |
|------|------|----------------------|
| **patch** | One layer, at most two slices, no new dependency, no new route | Do **not** spawn `feature-orchestrator`. Spawn one `slice-engineer` (no worktree) with `LAYER`, `SLICE`, and one `create-*` skill. Then `bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh --until fsd`. Go to Step 5. |
| **standard** | One screen, up to five slices | Spawn `feature-orchestrator` with `TIER: standard`. |
| **full** | Six or more slices, or a new route plus a new entity | Spawn `feature-orchestrator` with `TIER: full`. |

Orchestrator spawn (standard and full only):

```
MODE:        build
TIER:        standard | full
SLUG:        {slug}
SPEC_PATH:   .spec/features/{slug}.md
BRANCH:      {branch}
KIT_DIR:     {resolved plugin root}
SESSION:     .spec/features/{slug}.context/session.md   (omit if it does not exist)

Read pipeline-flow.md once. Run the stations for this TIER.
Return one packet per references/packets.md (paths only) and STOP.
Do NOT ask the user anything. Do NOT run /create-pr, push, or merge.
Do NOT write files under src/.
Do NOT pass the upstream spec body or any worker report — spokes return a HANDOFF path.
```

If this conversation is near its limit (several clarify rounds, a revise cycle, or a packet plus a long spec), write `.spec/features/{slug}.context/session.md` first (status, pending packet path, links only) and pass that path. Do not replay the prior conversation into the spawn.

Loop on `type`:

| Packet | This skill |
|--------|------------|
| `DEP_PACKET` | Present each package; Approve / Reject — find an alternative / Abort. Record verdicts in `## Dependencies`, re-spawn `MODE: build` from Station 2. |
| `REVIEW_PACKET` | Go to Step 5. |
| `ESCALATION_PACKET` | `AskUserQuestion` with `errors[]` and `options[]`. Apply the choice or STOP. |

### Step 5 — Human review gate (Station 12 — THIS skill owns it, max 3 cycles)

1. Stage the feature once. Do not commit yet, and do not commit per nested task:

   ```bash
   bash {KIT_DIR}/skills/feature-dev/scripts/commit-feature.sh {slug} --stage-only
   ```

   Read `review_path` **once** (patch runs: the slice-engineer handoff). Then show
   `git diff --cached --stat`. Say `Review locally: git diff --cached`. Do not paste the
   blackboard or the diff body into chat.
2. `AskUserQuestion` — "Review the staged feature. How should I proceed?":
   - **Approve** → set `status: done` (human-only transition), go to Step 6.
   - **Request changes** → write `session.md` (the change request and `review_path`, not the review body), then re-spawn. Patch stays on `slice-engineer` unless the change adds a dependency, a route, or a second layer. Standard and full:
     ```
     MODE:           revise
     TIER:           standard | full
     CHANGE_REQUEST: {user's text}
     SESSION:        .spec/features/{slug}.context/session.md
     SLUG / SPEC_PATH / BRANCH / KIT_DIR: (same as build)
     ```
     The orchestrator re-enters at the lowest affected station, replays Stations 9–10 (including 9.5), and returns a fresh packet.
   - **Abort** → do not commit. Leave the index as it is. Write kit-result `aborted` and stop.
3. After 3 change cycles without approval, ask: accept-as-is, keep iterating, or abort.

### Step 6 — Result envelope, report, hand off

On approve: one commit for the feature, then the envelope. Do not push. On abort or error, skip
the commit and write the envelope only.

```bash
bash {KIT_DIR}/skills/feature-dev/scripts/commit-feature.sh {slug}
```

Write the path-only envelope **before** the human-readable report (frontend-orchestrator-kit reads the file):

```bash
node {KIT_DIR}/skills/feature-dev/scripts/write-kit-result.mjs \
  --out .spec/features/{slug}.kit-result.json \
  --kit feature-dev \
  --outcome approved \
  --spec-path .spec/features/{slug}.md \
  --feature-spec .spec/features/{slug}.md \
  --slug {slug} \
  --branch {branch} \
  --parent-branch {PARENT}
```

If `RESULT_OUT` was passed, add `--also {RESULT_OUT}`. On abort / escalation stop, same command
with `--outcome aborted` or `error` and `--reason`.

Then report **paths only**:

```
Feature built and approved — NOT shipped
Spec:    .spec/features/{slug}.md
Result:  .spec/features/{slug}.kit-result.json
Branch:  {branch}

Next step (human only):
  /create-pr
```

**This skill never opens a pull request.** `/create-pr` is `disable-model-invocation: true` and must
be typed by a human.

---

## Non-negotiables

1. **The human gates are real.** Stations 0.5, 1b, and 12 are owned by this skill, never by a subagent.
2. **No unapproved dependency.** The lockfile's package manager runs only after Station 1b sign-off.
3. **Bottom-up, gate-per-layer.** No layer is built on a red gate.
4. **The spec is the handoff medium.** Workers read and write sections; chat output is not state.
5. **One feature per run.** Nested screen-tasks share this branch and this commit. FSD slices
   inside the run are not new feature-dev calls, branches, or commits. Do not dump every app screen.
6. **Architecture-audit is a gate on standard and full.** Station 9.5 is `DIFF_SCOPE`. Station 1.5 runs on the full tier only, scoped to FSD Impact paths. Patch skips both. A missing companion plugin on a tier that requires the audit → escalate, do not skip.
7. **Automation never ships.** No agent pushes, merges, or opens a PR.

---

## Expected Duration

| Phase | Typical |
|-------|---------|
| Intake + clarification | user response time |
| **patch** (one slice, `--until fsd`, no orchestrator) | one worker plus a short gate |
| **standard** (one screen, ≤5 slices) | discovery, layer gates without build, one full sweep, diff audit, review |
| **full** (6+ slices) | standard, plus a scoped baseline audit and parallel slice workers |

---

## Troubleshooting

| Issue | Resolution |
|-------|-----------|
| "No shadcn MCP" | Merge `{KIT_DIR}/mcp.json` into root `.mcp.json`; see `references/mcp-servers.md` |
| "architecture-audit not found" | Install `frontend-dev-kit` from this marketplace |
| Pipeline seems stuck | Check for a pending `AskUserQuestion` — answer it to continue |
| Same gate fails 3× | Expected escalation. Read the gate log in the spec; the plan or spec is usually wrong |
| Orchestrator returned no packet | It hit a hard stop — read the spec's `Gate log` and `status` |
| Worker touched files outside its slice | The delegation was under-specified; tighten `BOUNDARY` per `templates/delegation-message.md` |
| Import dumped every app screen | Pass `FEATURE_ID` / `SCREEN_REFS` and `--require-scoped` |
| Coverage stuck below threshold | Do not weaken thresholds — find the untested branches listed in the gate output |
| Want to restart clean | Set spec `status: draft` and re-run `/feature-dev {slug}` |
