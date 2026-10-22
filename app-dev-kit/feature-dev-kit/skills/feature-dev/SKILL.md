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
| `references/development-cycle.md` | this skill, orchestrator | outer + inner implement loops. **Not** a spoke read — the station card plus `ui-build-contract.md` is enough |
| `references/upstream-contract.md` | this skill, `spec-analyst` | spawn payload and YAML field map |
| `references/packets.md` | this skill, orchestrator, spec-analyst, research-analyst | packet types the hub may return |
| `references/handoff-format.md` | build engineers | return shape for `board.mjs handoff` |
| `references/orchestration-protocol.md` | orchestrator | delegation format, handoff-via-spec, retry/escalation. Listed in the orchestrator's own Inputs — this skill does not load it |
| `references/feature-spec-format.md` | `spec-analyst` (Station 0), all workers | the blackboard schema every section must satisfy |
| `references/fsd-architecture.md` | `code-explorer` (Station 1) | layers, slices, segments, where code belongs. Build engineers get the compact rules from `ui-build-contract.md` § 0 |
| `references/fsd-import-boundaries.md` | host setup, Station 11 boundary fixes | the import matrix + Steiger / ESLint config. Build engineers use `ui-build-contract.md` § 0 |
| `references/investigation-protocol.md` | `research-analyst` (Station 1a) | context7 flow, dependency proposal format |
| `references/quality-gates.md` | orchestrator / this skill on a red gate (Stations 3–9) | gate commands, thresholds, per-failure remediation |
| `references/definition-of-done.md` | orchestrator (Station 11), `code-reviewer` | the standing bar every change clears |
| `references/ui-build-contract.md` | every engineer that writes `src/` | the one build-time contract for a spoke: simplicity ladder, slice order, layer rules (§ 0), shadcn fidelity, copy, boundaries, tests, parity, self-check |
| `references/human-review-protocol.md` | this skill (Station 12) | what the human is shown and which decisions are offered |
| `references/context-budget.md` | orchestrator, once | handoff-by-link contract and per-agent section allowlists |
| `references/artifact-naming.md` | this skill (Station 0) | slug derivation, branch name, spec path |
| `references/mcp-servers.md` | `shared-engineer`, `research-analyst` | shadcn + context7 setup and verification |
| `templates/feature-spec.md` | `spec-analyst` (Station 0) | blackboard skeleton copied to `.spec/features/<slug>.md` |
| `templates/build-plan.md` | orchestrator (Station 2) | build-plan table format |
| `templates/delegation-message.md` | orchestrator (Stations 3–7) | the exact worker briefing format |
| `templates/review-packet.md` | orchestrator (Station 11 → return) | the Station 12 packet shape |
| `scripts/new-feature.sh` | this skill (Station 0, Bash) | slug + branch + spec scaffold |
| `scripts/import-upstream.mjs` | this skill (Station 0, Bash) | scoped YAML + prototype → blackboard |
| `scripts/extract-prototype-inventory.mjs` | this skill (Station 0, Bash) | prototype page → `.context/prototype-inventory.md` when `prototype-page:` is set |
| `scripts/validate-feature-spec.mjs` | this skill (Station 0.5, Bash) | deterministic blackboard validation |
| `scripts/run-gates.sh` | orchestrator, this skill on patch (Bash) | runs the gate sequence, emits JSON; `--spec` records each gate in `<slug>.context/gate-status.md` + `gate-log.jsonl` (not on the board) |
| `scripts/board.mjs` | orchestrator, build workers (Bash) | section get/put, `card`, `row`, `append`, `gate`, `timing`, `snapshot`, `changed`, `audit-scope`, `parent-map` |
| `scripts/port-prototype-theme.mjs` | `shared-engineer` (Station 3); orchestrator (Station 6 `--check`) | copy prototype `:root` tokens into `globals.css`; `--check` diffs them and does not write |
| `scripts/preflight-host.mjs` | this skill (Step 1, Bash) | reports host setup gaps (gate scripts, `.spec` lint ignore, git-ignored transcripts) before any build |
| `scripts/commit-feature.sh` | this skill (Station 12, Bash) | `--stage-only` before review; one commit on approve |
| `scripts/write-kit-result.mjs` | this skill (Station 12 approve or abort) | `.spec/features/{slug}.kit-result.json` path-only envelope |

`{KIT_DIR}/rules/` holds only `ui-quality` and `git-workflow`. Do not name rule files in `APPLY`.
Companion **frontend-dev-kit** is the convention source: its rules attach by glob, and workers load
`react-component`, `tailwind-styles`, `accessibility`, `testing`, `rhf-form`, `react-query-hook`,
`shadcn-usage`, `routing`, and `i18n`. `architecture-audit` is preloaded by `architecture-auditor`.
Never copy those files here.

---

## Prerequisites

| Requirement | Check | If missing |
|-------------|-------|-----------|
| Git repo on a non-protected branch | `git rev-parse --abbrev-ref HEAD` | `scripts/new-feature.sh` creates the feature branch |
| FSD host app | `src/app`, `src/pages`, `src/features`, `src/entities`, `src/shared` exist | STOP — this kit does not clone a starter; open the consumer app repo |
| frontend-dev-kit installed | `frontend-dev-kit:architecture-audit` resolves, or `~/.cursor/plugins/local/frontend-dev-kit` exists | Run **Companion install** below. Do not skip the audit gate |
| shadcn registry lookup returns a component | see `references/mcp-servers.md` — call search/list before Station 0 | STOP — do not start intake, and do not hand-write primitives |
| context7 MCP responding | see `references/mcp-servers.md` | Warn; Station 1a falls back to web search |
| Working tree clean | `git status --porcelain -- . ':(exclude).spec'` | Ask the human to commit or stash first. Skip when resuming: the feature branch and `.spec/features/<slug>.md` already exist and HEAD is that branch |
| Host setup | `node {KIT_DIR}/skills/feature-dev/scripts/preflight-host.mjs` (exit 0) | Exit 1: one `AskUserQuestion` listing each `ISSUE` and its `fix` — **Apply the fixes** (edit the host; a `lint:fsd` tool or any new package still needs the human's pick and Station 1b approval) · **Continue anyway** · **Abort**. Skip this script when the caller passed `PREFLIGHT: passed` or `PREFLIGHT: accepted` — the orchestrator already ran it. A standalone `/feature-dev` has no `PREFLIGHT` and still runs it |

A spec from `/generate-spec` at the `spec_path` in `.spec/app/current.json` (`.spec/spec/spec-*/spec.md`) is **optional but preferred**. When
frontend-orchestrator-kit (or the human) also passes `FEATURE_ID` / `SCREEN_REFS`, Station 0 imports
**only that feature's nested screens**. Never ingest a whole `type: app` spec into one feature run.

### Companion install

Run before Station 0 when the prerequisite check fails.

1. Installed when `frontend-dev-kit:architecture-audit` resolves, or `~/.cursor/plugins/local/frontend-dev-kit/.cursor-plugin/plugin.json` exists. Then continue.
2. Host: `$CURSOR_PROJECT_DIR` or a `.cursor/` directory, and `$CLAUDE_PLUGIN_ROOT` unset → Cursor. `$CLAUDE_PLUGIN_ROOT` set and no Cursor signal → Claude. Both or neither → ask the user, Cursor or Claude, then do that step.
3. Cursor — symlink one plugin (not `npm run install:cursor-local`). Marketplace root is two levels above `KIT_DIR`:

```bash
mkdir -p "$HOME/.cursor/plugins/local"
ln -sfn "$(cd "$KIT_DIR/../.." && pwd)/frontend-dev-kit" "$HOME/.cursor/plugins/local/frontend-dev-kit"
```

Tell the user to reload the window. If `architecture-audit` still does not resolve, STOP.

4. Claude — this skill cannot run the slash command from bash. Ask the user to run `/plugin install frontend-dev-kit@dev-AI-plugins`, then re-check. Still missing → STOP.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[feature-slug or request]` | Optional | An existing slug in `.spec/features/` resumes that feature. Free text starts a new one. Omitted → this skill asks for the request. |

Structured fields (from frontend-orchestrator-kit or the human) may accompany the argument: `UPSTREAM_SPEC`,
`FEATURE_ID`, `SLICE_REF`, `TASK_IDS`, `SCREEN_REFS`, `STORY_REFS`, `AC_REFS`, `ENTITY_REFS`,
`PROTOTYPE_REF`, `CHECKLIST_PATH`, `SLUG_HINT`, `PARENT_BRANCH`, `CHANGE`, `RESULT_OUT`, `PREFLIGHT`.
`REQUEST` may be a one-line pointer when `UPSTREAM_SPEC` + `FEATURE_ID` are set — do not expect
an inlined spec body. Pass `CHANGE=remove` only when every nested task `change` is `remove`.
See `references/upstream-contract.md`.

```
/feature-dev
/feature-dev decline-profile
/feature-dev "reviewers can decline a profile with an optional reason"
```

---

## Steps

Do not read `pipeline-flow.md` into this conversation. The tier table below is the parent-loop contract. The orchestrator reads the station map once inside its own context.

### Step 1 — Resolve the feature

0. **Shadcn gate, before Station 0.** Call the session's shadcn search or list tool (`search_items_in_registries` with `query: "button"`, or the host's equivalent). Require a payload that names a real component. `npx shadcn@latest mcp --help` does not count. If the tool is missing or the call fails, STOP. Tell the human to merge `{KIT_DIR}/mcp.json` and reload. Do not start intake. Do not fall through to hand-written UI.
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
     `SLICE_REF` (2.0 checklists), and nested `TASK_IDS` / `SCREEN_REFS`. A `done` feature is not rebuilt unless that feature,
     or one of its tasks, is `pending` with `blocked-reason: spec changed`. If nothing matches,
     standalone feature — no whole-app dump. Do not glob `.spec/spec/spec-*/spec.md` or `.spec/app/spec-*/spec.md`.

| Spec `status` | Resume at |
|---------------|-----------|
| `draft`, `awaiting-clarification` | Station 0 |
| `approved` | Station 1 |
| `awaiting-dep-approval` | Station 1b |
| `building` | Re-spawn the orchestrator with `RESUME_AT: build`. It continues at the first Build Plan row that is not `done`. It does not re-plan |
| `review` | Re-spawn the orchestrator with `RESUME_AT: 9` (gates and reviews re-run, then Station 11) |
| `changes-requested` | The Station 12 changes-requested path with the change recorded under `## Human Review`: the local UI fix, or `MODE: revise` |
| `awaiting-human` | Station 12 |
| `done` | If `.spec/features/{slug}.kit-result.json` is missing, finish Step 6 (commit if anything is staged, then write the envelope) and stop. If the envelope exists, report and stop — unless the checklist row is `pending` with `blocked-reason: spec changed`. Then import with `--changes` and resume at Station 1 |

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
  --slice-ref {SLICE_REF or omit} \
  --story-refs {comma-separated or omit} \
  --ac-refs {comma-separated or omit} \
  --entity-refs {comma-separated or omit} \
  --prototype-ref {PROTOTYPE_REF or omit} \
  --checklist {CHECKLIST_PATH or omit} \
  --change {remove, or omit} \
  --require-scoped \
  --changes {dirname(UPSTREAM_SPEC)}/artifacts/changes.json
```

Pass `--changes` only when that file exists. Pass `--checklist` when `CHECKLIST_PATH` is set — import reads it and does not edit it. Pass `--change remove` only when `CHANGE=remove` (every nested task is a removal). A mixed feature omits it; import reads each task's `change` from the checklist. `--require-scoped` is mandatory when the upstream spec `type` is `app` or has more than one
screen. Standalone requests omit it.

If import prints `SKIP: board at status`, the board is left as it is. If it also prints `WARN upstream-changed`, ask once: **Re-import** (re-run the same command with `--force`, set `status: approved`, then run Station 0.5 again) or **Keep my edits** (continue from the status table above). Do not overwrite a human's Split or Edit silently.

When the board has a `prototype-page:` line, build the parity contract (it prints `SKIP` otherwise):

```bash
node {KIT_DIR}/skills/feature-dev/scripts/extract-prototype-inventory.mjs --spec {SPEC_PATH}
```

It writes `.spec/features/{slug}.context/prototype-inventory.md` — every string, control, field, state, and dialog on the prototype page. Station 6 fills its React target / Status columns. See `references/upstream-contract.md` § Prototype inventory. After import, re-read frontmatter `status`. If it is `approved` and the board has `## Change request`, skip Stations 0 and 0.5 and spawn the orchestrator at Station 1. When `CHANGE=remove`, delete the existing pages and routes for those screen refs. Do not scaffold a replacement. When `## Change request` says `Remove these screens only`, delete only the listed screens and build the rest. Import writes that instruction (`Remove` / `Remove these screens only` / `Extend existing`), which Station 1 obeys.

Then spawn `spec-analyst` with `SPEC_PATH` — the import already wrote the scoped slice (screens,
stories, ACs, entities, prototype page) into the blackboard. Do not paste the slice.
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

On exit 0, present the acceptance criteria. If import printed `WARN prototype-ref`, show that line too. Classify the tier the same way Step 4 does (slice count, new package, new route) before asking. When that tier would be **full**, or `## Dependencies` names a new package while the slice title or request names one behavior, add **Split**. Ask (single `AskUserQuestion`):
**Approve & build** · **Edit criteria** (relay free text, re-run this step) · **Split** (list the acceptance-criteria groups to defer — the "owned by other slices" section, or groups the human names; record them under `## Decisions & Open Questions`, drop them from `## Acceptance Criteria`, re-run this step) · **Abort**.

On approval set `status: approved` in the spec front matter. No subagent may do this.

### Step 4 — Choose a tier, then build

Classify from the approved blackboard only (slice count, new package, new route). Do not read the upstream app spec.

When the feature renders UI, resolve `dev_url` before the first build spawn. Read it from `session.md`. If it is missing, ask once for the running app URL. `curl -sf -o /dev/null` that URL. If it does not respond, ask the human to start the server and check again. Write `dev_url` into `session.md`.

| Tier | When | What this skill does |
|------|------|----------------------|
| **patch** | One layer, at most two slices, no new dependency, no new route | Do **not** spawn `feature-orchestrator`. Spawn one `slice-engineer` (no worktree; `shared-engineer` when the layer is `shared`) in the foreground per Spawning below. Pass `LAYER`, `SLICE`, and one `create-*` skill. It writes behavior tests in the same change. Then `bash {KIT_DIR}/skills/feature-dev/scripts/run-gates.sh --until conventions --spec {SPEC_PATH} --station patch`. If UI changed, run the UI review below before Step 5. Comments go back to `slice-engineer` with `ui-review.md`. Before that re-spawn, `run-gates.sh --fix` on the changed files (`SKIP` means the host has no fixer). A testable finding includes a regression test (`ui-build-contract.md` § 5), then re-run that gate. |
| **standard** | One screen, up to five slices | Spawn `feature-orchestrator` with `TIER: standard`. |
| **full** | Six or more slices, or a new route plus a new entity | Spawn `feature-orchestrator` with `TIER: full`. |

Orchestrator spawn (standard and full only):

```
MODE:        build
TIER:        standard | full
SLUG:        {slug}
SPEC_PATH:   .spec/features/{slug}.md
BRANCH:      {branch}
PARENT:      {PARENT}
KIT_DIR:     {resolved plugin root}
SESSION:     .spec/features/{slug}.context/session.md   (omit if it does not exist)
RESUME_AT:   build   (when the board status is building — continue the plan, do not re-plan)
RESUME_AT:   9   (only when re-spawning after a CONTINUE_PACKET)
RESUME_AT:   2   (only when re-spawning after DEP_PACKET verdicts)
UI_FINDINGS: .spec/features/{slug}.context/ui-review.md   (omit when that file has no findings)

Read pipeline-flow.md once. Run the stations for this TIER.
Return one packet per references/packets.md (paths only) and STOP.
Do NOT ask the user anything. Do NOT run /create-pr, push, or merge.
Do NOT write files under src/.
Do NOT pass the upstream spec body or any worker report — spokes return a HANDOFF path.
```

### Spawning

Spawn every agent (orchestrator, `slice-engineer`, `test-engineer`) in the foreground and wait for the Agent call to return. Do not background it, sleep, or poll. The orchestrator's final message is its packet; a worker's final message is its HANDOFF / CONTAINS lines.

Once the board exists, log each spawn first: `board.mjs timing {SPEC_PATH} --station "<station or step>" --event spawn --agent <name>`. Without it, `timing --summary` counts the agent's time as "between steps".

If an Agent call errors or returns without a result, retry it once from the checkpoint path (`.spec/features/{slug}.context/orchestrator-checkpoint.md`, or the blackboard). Do not paste the old transcript. If the retry also fails, write the envelope `--outcome error --reason agent-failed` and stop.

If this conversation is near its limit (several clarify rounds, a revise cycle, or a packet plus a long spec), write `.spec/features/{slug}.context/session.md` first (status, pending packet path, links only) and pass that path. Do not replay the prior conversation into the spawn.

Loop on the returned packet's `type`. Every re-spawn follows Spawning above.

| Packet | This skill |
|--------|------------|
| `DEP_PACKET` | Present each package; Approve / Reject — find an alternative / Abort. Record verdicts in `## Dependencies` (`Status`: `approved` or `rejected`), re-spawn `MODE: build` with `RESUME_AT: 2`. |
| `CONTINUE_PACKET` | Run the UI review below, then re-spawn with `RESUME_AT: 9`. Pass `UI_FINDINGS` when `ui-review.md` has findings. Findings are Station 11 input, not a revise cycle. |
| `REVIEW_PACKET` | Step 5. If `ui-review.md` had findings, open the route again first so the human can confirm the fixes. |
| `ESCALATION_PACKET` | `AskUserQuestion` with `errors[]` and `options[]`. Apply the choice or STOP. |

### UI review — after CONTINUE_PACKET, and after a patch build

This skill owns the browser. The orchestrator has no browser tools. Load **frontend-dev-kit:browser-debug**. Skip the review when the diff has no rendered UI. Structure and theme tokens are the Station 6 parity gate (`extract-prototype-inventory.mjs --check` and `port-prototype-theme.mjs --check`). Layout is what the human looks at here. No screenshots and no snapshots.

1. `node {KIT_DIR}/skills/feature-dev/scripts/board.mjs timing {SPEC_PATH} --station "UI review" --event start`
2. Re-check `dev_url` (`curl -sf -o /dev/null`). If it does not respond, ask the human to start the server and check again. Do not stop the run.
3. `navigate_page` to `{dev_url}` plus the feature route from `## UI Surface`. `list_console_messages`. An error from the app is the first finding.
4. Leave that page open. When a prototype page is bound, `new_page` on the prototype HTML (`prototype-ref` + `prototype-page`) so the human can compare.
5. `AskUserQuestion`: **Looks right** · **Comments** (free text, one finding per line) · **Abort**.
6. Write `.spec/features/<slug>.context/ui-review.md` with the route, `dev_url`, console pass or fail, the prototype path, and the findings. Then `board.mjs timing {SPEC_PATH} --station "UI review" --event end`.
7. **Abort** stops the run. **Looks right** with a clean console: re-spawn `RESUME_AT: 9` and omit `UI_FINDINGS`. **Comments** or a console error: pass `UI_FINDINGS` pointing at that file. Station 11 folds each finding into the fix batches. A finding whose behavior is testable includes a regression test (`ui-build-contract.md` § 5).
8. Patch has no verify phase: send `ui-review.md` back to `slice-engineer`, then re-run `--until conventions`.

Before the Station 12 question, if `ui-review.md` has findings, `navigate_page` to the route again so the human can confirm the fixes. Do not ask the UI question again.

### Step 5 — Human review gate (Station 12 — THIS skill owns it, max 3 cycles)

1. Stage the feature once. Do not commit yet, and do not commit per nested task:

   ```bash
   bash {KIT_DIR}/skills/feature-dev/scripts/commit-feature.sh {slug} --stage-only
   ```

   Read `review_path` **once** (patch runs: the slice-engineer handoff). Then show
   `git diff --cached --stat`. Say `Review locally: git diff --cached`. Do not paste the
   blackboard or the diff body into chat.
2. `AskUserQuestion` — "Review the staged feature. How should I proceed?":
   - **Approve** → do not set `status: done` and do not commit. Run the review pass below. Same on patch, standard, and full.
   - **Request changes** → write `session.md` (the change request and `review_path`, not the review body). **Local UI** is one layer, at most two slices, and no new dependency, route, or acceptance criterion. Patch, and a local UI change on standard or full, do not spawn the orchestrator:
    1. `board.mjs snapshot {SPEC_PATH} --round <n>`
    2. One `slice-engineer` (no worktree; `shared-engineer` for a `shared` slice) with `LAYER`, `SLICE`, and the change text.
    3. `run-gates.sh --fix` on the changed files, then `run-gates.sh --until conventions --spec {SPEC_PATH} --station revise`. `SKIP` means the host has no fixer.
    4. `board.mjs changed {SPEC_PATH} --since <n>` is `FIX_SCOPE`. Write it to `fix-scope-<n>.txt`.
    5. Re-open the route (step 3 of the UI review). Do not ask the full question again unless the human still has comments; those go back to `slice-engineer` once.
    6. On standard and full, spawn `architecture-auditor` and `code-reviewer` in one turn, `MODE: verify`, on `FIX_SCOPE`. Patch skips both. Each prompt names its agent file (`{KIT_DIR}/agents/<name>.md`) and carries `SPEC_PATH`, the `fix-scope-<n>.txt` path, the agent's latest handoff in `<slug>.context/`, and the change request as the finding to verify.
    Anything else (a dependency, a route, a second layer, or an acceptance-criterion change) re-spawns the orchestrator. The orchestrator re-enters at the lowest affected station, replays Stations 9–10 (including 9.5), and returns a fresh packet.
     ```
     MODE:           revise
     TIER:           standard | full
     CHANGE_REQUEST: {user's text}
     SESSION:        .spec/features/{slug}.context/session.md
     SLUG / SPEC_PATH / BRANCH / KIT_DIR: (same as build)
     ```
   - **Abort** → do not commit. Leave the index as it is. Write kit-result `aborted` and stop.
3. After 3 change cycles without approval, ask: accept-as-is, keep iterating, or abort.

### Review pass — after the first Approve

Station 10 does not load `frontend-dev-kit:code-review`. This pass does.

1. Load **frontend-dev-kit:code-review**. `FIXED_POINT` is the parent branch. `SPEC_PATH` is `.spec/features/{slug}.md`.
2. Must-fix findings (pattern hits, duplicates, spec `none` / `partial`, bucket violations) go to the owning engineer the way a local Station 12 change does: `slice-engineer` for one layer, `shared-engineer` when the fix is "move to shared". A `useQuery` or `useMutation` in `hooks/` moves into the owning `api/` and the callers import that hook. A `let`, an IIFE, or a pure calculation in a component moves to a `const` condition or `{component}/utils.ts`. Then `run-gates.sh --until conventions` on the touched files.
3. Re-run `scan-review-patterns.mjs` and `scan-duplicates.mjs`. Re-spawn only buckets that had findings. One fix round. What is still open stays in the report.
4. Write `.spec/features/{slug}.context/code-review.md` with the full list.
5. Second `AskUserQuestion` — "Review the code-review result. How should I proceed?":
   - **Approve** → set `status: done` (human-only transition), go to Step 6.
   - **Request changes** → the revise path above.
   - **Abort** → do not commit. Write kit-result `aborted` and stop.

### Step 6 — Result envelope, report, hand off

On the second approve: one commit for the feature, then the envelope. Do not push. On abort or error, skip
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
  --parent-branch {PARENT} \
  --feature-id {FEATURE_ID} \
  --slice-ref {SLICE_REF}
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
| **patch** (one slice, `--until conventions`, no orchestrator) | one worker plus a short gate |
| **standard** (one screen, ≤5 slices) | discovery, layer gates, UI review, one sweep, audit and review in parallel |
| **full** (6+ slices) | standard, plus a scoped baseline audit |

---

## Troubleshooting

| Issue | Resolution |
|-------|-----------|
| "No shadcn MCP" | Merge `{KIT_DIR}/mcp.json` into root `.mcp.json`; see `references/mcp-servers.md` |
| "architecture-audit not found" | Companion install below. Cursor: symlink then reload. Claude: `/plugin install frontend-dev-kit@dev-AI-plugins` |
| Pipeline seems stuck | Check for a pending `AskUserQuestion` — answer it to continue |
| Same gate fails 3× | Expected escalation. Read `.spec/features/<slug>.context/gate-status.md` (and the failed block in `.spec/.gate-log`); the plan or spec is usually wrong |
| Orchestrator returned no packet | It hit a hard stop — read `gate-status.md`, the checkpoint, and the board `status` |
| Worker touched files outside its slice | The delegation was under-specified; tighten `BOUNDARY` per `templates/delegation-message.md` |
| Import dumped every app screen | Pass `FEATURE_ID` / `SCREEN_REFS` and `--require-scoped` |
| Coverage stuck below threshold | Do not weaken thresholds — find the untested branches listed in the gate output |
| Want to restart clean | Set spec `status: draft` and re-run `/feature-dev {slug}` |
