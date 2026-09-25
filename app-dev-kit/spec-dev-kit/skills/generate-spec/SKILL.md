---
name: generate-spec
description: Transforms raw user requirements in .spec/context/ into a validated, approved hybrid YAML+Markdown spec in .spec/spec/. Runs the full spec-dev-kit pipeline — intake, gap analysis, clarification, enrichment, completeness gating, synthesis, deterministic validation, diagram generation, and human review — then publishes the result. Use when starting any new feature, domain, or app where no spec exists yet, or when the next feature's context files should continue the last app spec's story and screen ids.
argument-hint: "[feature-name]"
allowed-tools: [Read, Glob, Grep, Write, Bash, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, TaskGet]
---

# SKILL: generate-spec

**Command**: `/generate-spec [feature-name]`
**Entry point for**: the spec-dev-kit pipeline
**Pipeline driver**: `spec-orchestrator` agent (see `../../agents/spec-orchestrator.md`)

This skill runs in the **main conversation**. It owns every `AskUserQuestion` call. The
orchestrator is a subagent and must never ask the user — it returns a packet and stops.

---

## Purpose

Transforms raw user requirements in `.spec/context/` into a structured, validated, approved
hybrid YAML+Markdown spec under `.spec/spec/`. Downstream kits read `.spec/app/current.json`
for the path — never the spec body in chat. Pass `{RUN_DIR}/spec.md` and `{RUN_DIR}/kit-result.json`.

---

## Resolve KIT_DIR (do this first)

`KIT_DIR` is the **plugin root** (the directory that contains `agents/` and `skills/`). Resolve in
this order; use the first that exists:

1. Parent of this skill folder — `{this SKILL.md directory}/../..` (Claude: if
   `${CLAUDE_SKILL_DIR}` is set, `KIT_DIR` is `${CLAUDE_SKILL_DIR}/../..`).
2. `app-dev-kit/spec-dev-kit` relative to the workspace root (this marketplace repo).
3. `.spec/spec-dev-kit` (legacy consumer copy).

All script and reference paths are `{KIT_DIR}/skills/generate-spec/…`. Never hardcode
`.spec/spec-dev-kit/skills/…`.

---

## Companion files (loaded on demand — not loaded unless a step references them)

| Path | Loaded by | When |
|------|-----------|------|
| `references/pipeline-flow.md` | this skill, orchestrator, every agent | before starting — station order, loop guards, ownership |
| `references/spec-schema.md` | synthesizer (Station 6), validator (Station 7) | synthesis + deterministic validation |
| `references/completeness-checklist.md` | `spec-completeness` (Station 5) | completeness scoring |
| `references/clarification-protocol.md` | `spec-interrogator` (Station 2a), this skill (Station 9 restate) | question strategy, assumption tiering, Restate & Confirm |
| `references/context-protocol.md` | this skill (Station 1) | reading and normalizing `.spec/context/*.md` |
| `references/artifact-naming.md` | this skill (Station 0) | timecode derivation, slug, output path |
| `references/context-budget.md` | orchestrator | payload contracts — paths, not blobs |
| `templates/spec-frontmatter.yaml` | synthesizer (Station 6) | YAML front matter template |
| `templates/spec-body.md` | synthesizer (Station 6) | Markdown body template |
| `scripts/validate-spec.mjs` | orchestrator (Station 7, Bash) | deterministic schema validation |
| `scripts/publish-spec.mjs` | this skill (Station 10, Bash) | set `approved`, re-validate, revert to `reviewing` on failure |
| `scripts/continue-spec.mjs` | this skill (Station 0, Bash) | timecode freeze + run-folder scaffold |
| `scripts/write-kit-result.mjs` | this skill (publish or abort) | `{RUN_DIR}/kit-result.json` path-only envelope for frontend-orchestrator-kit / app-orchestrator-kit |

---

## Prerequisites

The user MUST have at least one `.md` file in `.spec/context/` containing requirements, notes, or
feature descriptions. If `.spec/context/` is empty, report and stop:

```
No requirement files found in .spec/context/.
Drop your requirements as .md files there, then run /generate-spec again.
```

Accepted content: feature requests, user notes, meeting summaries, partial specs,
screenshot-to-text transcriptions, email/Slack transcripts.

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `[feature-name]` | Optional | Hint for the spec slug. If omitted, slug is derived from context files per `references/artifact-naming.md`. |

```
/generate-spec
/generate-spec profile-management
/generate-spec "Invoice Approval Workflow"
```

---

## Steps

Read `{KIT_DIR}/skills/generate-spec/references/pipeline-flow.md` before Station 0.

### Step 1 — Context Check

1. `Glob(".spec/context/*.md")`.
2. If none found → report to user and STOP (do not write a kit-result — there is no `RUN_DIR` yet).
3. List found files: `"Found {N} requirement file(s): {filenames}. Proceeding."`

### Step 2 — Scaffold Run (Station 0)

1. Read `references/artifact-naming.md`.
2. Derive `slug` from `[feature-name]` (normalized) or from context file signals.
3. Scaffold from the shared pointer (`.spec/app/current.json`), not from older context files.
   `.spec/processed/` is archive, not input. See `references/app-state.md`.

```bash
node {KIT_DIR}/skills/generate-spec/scripts/continue-spec.mjs --slug {slug}
```

Capture `MODE`, `SPEC_ID`, `RUN_DIR`, `PRIOR_INDEX`, `APP_SLUG`, and `TIMECODE` from stdout.
Use `APP_SLUG` as the app slug from here on (`MODE=continue` keeps the existing app slug).
4. Log: `"[generate-spec] Timecode: {TIMECODE} | Slug: {APP_SLUG} | Run dir: {RUN_DIR} | MODE: {MODE} | KIT_DIR: {KIT_DIR}"`

### Step 3 — Intake (Station 1)

Read and normalize context files per `references/context-protocol.md`:
- Glob `.spec/context/*.md`, sort by modification time descending.
- For each file: extract `raw_requirements`, `source_map`, slug/type hints, surface conflicts.
- Write `intake_report` to `{RUN_DIR}/artifacts/intake.json`.
- Ensure `{RUN_DIR}/artifacts/qa-log.md` exists (empty file is fine).

### Step 4 — Drive the orchestrator until publish

Spawn `spec-orchestrator`. It **never** asks the user. Loop on packets:

```
MODE:      build          # then resume | revise
TIMECODE / SLUG / RUN_DIR / KIT_DIR
APP_SLUG:  {APP_SLUG}
CONTINUE:  {MODE}         # first | continue
PRIOR_INDEX: {PRIOR_INDEX}
INTAKE_REPORT_PATH: {RUN_DIR}/artifacts/intake.json

Read {KIT_DIR}/skills/generate-spec/references/pipeline-flow.md before any station.
Do NOT call AskUserQuestion. Do NOT inline base.spec.md or prior context files.
Return one packet and STOP.
```

| Packet `type` | This skill |
|---------------|------------|
| `CLARIFY_PACKET` | `AskUserQuestion(questions[])` (one batched call). Append `## Round {n}` (or `## Completeness Round {n}`) plus verbatim Q&A to `{RUN_DIR}/artifacts/qa-log.md`. Re-spawn `MODE: resume` with `RESUME_AT`, `NEW_ANSWERS`, and the packet's round counters. |
| `REVIEW_PACKET` | `AskUserQuestion(review_packet)`. On **explicit** approval → Step 5. On changes → re-spawn `MODE: revise` with `CHANGE_REQUEST` and `REVIEW_CYCLES`. Ambiguous "sounds good" is not approval — re-ask (see clarification-protocol § Restate & Confirm). |
| `ESCALATION_PACKET` | `AskUserQuestion` with the packet errors/options. Apply the user's choice (`resume` with answers, approve-as-is → Step 5, or STOP after writing an aborted `kit-result.json`). |
| `READY_TO_PUBLISH` | Step 5. |

Max rounds are enforced by the orchestrator; this skill still stops if a loop exceeds the table in
`pipeline-flow.md`.

### Step 5 — Publish (Station 10)

Only after explicit approval (or approve-as-is escalation):

1. Approve the spec only when it still passes the minimum-viable check. This sets
   `status: approved`, re-runs the validator, and on failure puts `status` back to `reviewing`:

```bash
node {KIT_DIR}/skills/generate-spec/scripts/publish-spec.mjs {RUN_DIR}/spec.md
```

Exit 0: `status` is `approved`. Continue. Exit 1: `status` is `reviewing` again. Show the
validator errors to the human. Do not archive. Do not write an approved envelope. Stop.

2. Archive the inbox and move the shared pointer. Do this only after exit 0. An abort leaves
   `.spec/context/` in place and does not change `current.json`.

```bash
node {KIT_DIR}/skills/generate-spec/scripts/archive-context.mjs --run {RUN_DIR}
```

3. Write the path-only envelope (parent orchestrators read this file, not this report):

```bash
node {KIT_DIR}/skills/generate-spec/scripts/write-kit-result.mjs \
  --out {RUN_DIR}/kit-result.json \
  --kit generate-spec \
  --outcome approved \
  --spec-path {RUN_DIR}/spec.md \
  --slug {slug} \
  --run-dir {RUN_DIR}
```

If the caller passed `RESULT_OUT`, add `--also {RESULT_OUT}`.

4. Report **paths only** (do not paste spec YAML):

```
Spec published: {RUN_DIR}/spec.md
Pointer: .spec/app/current.json
Context archived: .spec/processed/{SPEC_ID}/
Result: {RUN_DIR}/kit-result.json

Next steps:
  /generate-html → add screens to the prototype (reads current.json)
  /feature-dev   → build one new feature (reads current.json)
```

On any STOP after Step 2 created `RUN_DIR` (human abort, drop, unrecoverable escalation):

```bash
node {KIT_DIR}/skills/generate-spec/scripts/write-kit-result.mjs \
  --out {RUN_DIR}/kit-result.json \
  --kit generate-spec \
  --outcome aborted \
  --spec-path {RUN_DIR}/spec.md \
  --slug {slug} \
  --run-dir {RUN_DIR} \
  --reason "{short reason}"
```

---

## Validation

The orchestrator runs Station 7:

```bash
node {KIT_DIR}/skills/generate-spec/scripts/validate-spec.mjs {RUN_DIR}/spec.md
```

Exit 0 = valid; exit 1 = `ERROR [CODE] …`. After two failed correction passes the orchestrator
returns `ESCALATION_PACKET`. Semantic warnings surface in Station 9, not here.

---

## Expected Duration

| Phase | Typical Duration |
|-------|-----------------|
| Intake + Analysis | ~30 s |
| Per clarification round | ~2 min (user response time varies) |
| Enrichment + Completeness | ~45 s |
| Synthesis | ~60 s |
| Validation + Diagrams | ~30 s |
| Review | ~1–3 min (user response time varies) |
| **Total (0 clarification rounds)** | ~3 min |
| **Total (2 clarification rounds)** | ~7–10 min |

---

## Re-Running

A later `/generate-spec` reads `.spec/app/current.json`, copies that spec to `base.spec.md`, and
assigns the next `US` / `SCR` / `AC` ids. The model sees `artifacts/prior-index.json` (id, title,
route, entity name) plus the new inbox files — not the old notes and not the full previous spec.
Publish writes a new `.spec/spec/{spec-id}/` folder, moves the inbox to `.spec/processed/{spec-id}/`,
and leaves the previous spec on disk.

`revert-increment.mjs` points `current.json` at the parent spec and prototype. It does not delete
the newer folders.

Station 9 still applies targeted edits inside the current run before publish.

---

## Troubleshooting

| Issue | Resolution |
|-------|-----------|
| "No files found in .spec/context/" | Drop `.md` files with your requirements there |
| Pipeline seems stuck | Check for a pending `AskUserQuestion` from **this** skill — answer it |
| Spec generated but incorrect | Add notes to `.spec/context/` and re-run |
| Validation errors repeat | Check `references/spec-schema.md` for the failing rule code |
| Slug is wrong | Run `/generate-spec [correct-slug]` |
| `validate-spec.mjs` exits with FATAL | Run from repo root so `node_modules/yaml` is resolvable |
| Scripts not found | Re-resolve `KIT_DIR` (plugin root, not `.spec/spec-dev-kit/` unless that copy exists) |
