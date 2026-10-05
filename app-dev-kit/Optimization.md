# Frontend pipeline optimization

**Scope:** `/orchestrate-frontend` (frontend-orchestrator-kit) and the kits it drives —
spec-dev-kit (`/generate-spec`), html-generator-kit (`/generate-html`), feature-dev-kit (`/feature-dev`),
with frontend-dev-kit as the companion rule/skill set.
**Date:** 2026-10-05
**Target host:** Cursor, Grok 4.7 as the parent/orchestrator model.
**Symptoms:** high token usage across spec → prototype → feature, and spec generation over 3 hours.

Each issue lists the evidence (file and lines), what it costs, the suggested change, and a rough
effort: **S** (an hour or less, prose/frontmatter), **M** (a script or a station rewrite),
**L** (pipeline redesign). Status **done** means it shipped with this document.

---

## 1. Where the time and tokens go

Generated **output** tokens are the slow part of an LLM pipeline; input tokens are the expensive
part when the same large context is re-sent many times. This pipeline does both:

1. **The spec kit writes the same requirement list three times** (intake → enriched → spec), at
   maximum reasoning effort, and re-reads ~1,600 lines of templates for every synthesis and
   correction pass.
2. **Two nested polling loops spent a model turn every minute** — the main chat polled its
   orchestrator, and each orchestrator polled its workers — re-sending the whole inlined context
   each time. (Removed — X-2.)
3. **Model tiering did not apply in Cursor**, so mechanical agents ran on the parent model.
4. **Fan-out stations multiply identical prompt text** (html Station 4, feature builders).

The kit's own duration table (`spec-dev-kit/skills/generate-spec/SKILL.md` L273-284) promises
3-10 minutes. Nothing records real per-station time, so the observed 3 hours cannot yet be
attributed station by station — see X-6.

---

## 2. Cross-cutting issues

### X-1 Model tiers were ignored in Cursor — **done**

- **Evidence:** every agent uses `model: haiku|sonnet|opus` and four spec agents use
  `effort: xhigh`. Cursor's subagent `model` field takes `inherit` or a Cursor model id
  (`https://cursor.com/docs/context/subagents`); the aliases and `effort` are not documented there.
  `scripts/install-cursor-local.mjs` symlinks the kits unchanged, so Cursor read the Claude files.
- **Cost:** mechanical agents (parsers, gate runners, validators) most likely ran on the parent
  model. Inferred from the docs, not measured.
- **Change:** `scripts/model-tiers.json` maps each Claude alias to a Cursor id;
  `scripts/build-cursor-agents.mjs` writes `<kit>/cursor-agents/` and each kit's
  `.cursor-plugin/plugin.json` points there. Claude Code keeps `agents/`. `npm run validate`
  fails when the generated files drift. Tier table in §6.
- **Not verified:** whether Cursor accepts the `[effort=…]` / `[fast=false]` suffixes on these
  ids for this account. Check the subagent task card on the first real run.

### X-2 One-minute polling at two levels — **done (polling removed)**

- **Evidence (before):** a parent loop of `sleep 60` + `check-pulse --check` in every kit skill, a
  nested loop in each orchestrator, and the liveness protocol in `agent-liveness.md`.
- **Cost (before):** ~60 parent turns per hour plus ~60 per hour inside each orchestrator, each
  re-sending the inlined skill bodies (~1,500 lines across the four skills).
- **Change (done):** every agent is spawned in the foreground; the caller waits and the agent's
  final message (plus its file envelope) is the result. On an error or a missing result the caller
  retries once from the on-disk checkpoint, then records `agent-failed`. `check-pulse.mjs`, its
  test, `agent-liveness.md`, the pulse files and the `test:frontend-orchestrator` npm script are
  deleted.
- **Trade-off:** nothing watches a hung agent any more. If a worker hangs, the run stalls until the
  user interrupts it; re-running the same command resumes from the checkpoint.
- **Further (S):** resume the same orchestrator by agent id on each packet instead of spawning a
  fresh one (see S-6).

### X-3 The main chat accumulates three kits' worth of context

- **Evidence:** `orchestrate-frontend/SKILL.md` Stations 1-3 invoke `generate-spec`,
  `generate-html` and `feature-dev` inline, one after another, in one conversation.
- **Cost:** by Station 3 the parent carries ~1,500 lines of skill text plus references and every
  packet round, re-sent on every turn.
- **Change (S):** after each station's envelope is written, tell the user to continue in a fresh
  chat with `/orchestrate-frontend {slug}`. Station 0 already resumes from
  `.spec/app/current.json` and `task-checklist.md`, so nothing is lost.

### X-4 Unrelated always-on rules load on every turn

- **Evidence:** `backend-dev-kit/rules/stack.mdc` and `agent-dev-kit/rules/stack.mdc` are
  `alwaysApply: true` with globs `**/*.{ts,mts,mdc,md,json}`. `base-dev-kit/rules/honesty.mdc` and
  `frontend-dev-kit/rules/honesty.mdc` are both always-on and overlap.
- **Cost:** backend and agent stack text sits in every frontend turn, including subagents.
- **Change (S):** set `alwaysApply: false` on both `stack.mdc` files with narrow globs
  (`src/http/**`, `src/db/**` for backend; `src/llm/**`, `src/agents/**` for agent). Keep one
  honesty rule always-on; make the frontend one glob-scoped or drop the duplicated part.

### X-5 The same contract is written in three or four places

- **Evidence:** station order and loop caps appear in each `SKILL.md`, its
  `references/pipeline-flow.md`, and the orchestrator prompt. (The liveness paragraph that was
  repeated in 13 files is gone with X-2.)
- **Cost:** tokens on every load, and drift (each change has to touch every copy).
- **Change (S):** keep the procedure in `pipeline-flow.md`; reduce every other copy to a one-line
  pointer.

### X-6 No per-station timing

- **Evidence:** nothing records when a station starts or ends (the pulse files that held the
  latest timestamp were removed with X-2).
- **Cost:** the 3-hour spec run cannot be broken down; fixes are prioritised by reading, not
  measurement.
- **Change (S):** have each orchestrator append `{station, at}` to `artifacts/timings.jsonl` via a
  one-line Bash `echo` at every station boundary, then fix the slowest station first.

---

## 3. spec-dev-kit — the 3-hour hot spot

### S-1 Station 1 intake runs in the most expensive context — **done**

- **Evidence (before):** `generate-spec/SKILL.md` Step 3 — the main conversation extracted
  **atomic** requirements ("a long structured PRD yields hundreds of entries") into
  `artifacts/intake.json`.
- **Change (done):** `scripts/extract-intake.mjs` splits bullets, signal sentences and every table
  row into `R-NNN` with `source_file` / `source_line`, routes open questions, copy examples,
  glossary, decisions and success metrics, and computes `context_starved_categories` and the slug.
  The skill only fills the judgement fields (`type_hint`, consolidated entities/roles, conflicts,
  terminology drift).

### S-2 The requirement list is copied three times — **partly done**

- **Evidence:** intake writes `raw_requirements[]`; `agents/spec-enricher.md` L31 writes one
  `requirements[]` entry per intake entry into `enriched.json`; `agents/spec-synthesizer.md` Step 2
  writes the whole register again into `spec.md`.
- **Cost:** the largest output in the run, generated three times at `effort: xhigh`.
- **Change (done):** `scripts/build-enriched.mjs --seed` builds the requirement register from
  intake (one REQ per intake entry with type, priority, scope and source). The enricher writes only
  `requirement_edits` (modify / split / new `answered`) plus the non-register sections to
  `enriched.patch.json`; `build-enriched.mjs --patch` merges and validates (unknown ids, duplicate
  adds, bad sources → exit 1 and one `FIX_ERRORS` re-spawn).
- **Later:** prefill the `requirements[]` register in `spec.md` from `enriched.json` so the
  synthesizer only adds `covered-by` links (the third copy).

### S-3 Maximum reasoning effort on four agents

- **Evidence:** `effort: xhigh` on `spec-analyst`, `spec-interrogator`, `spec-enricher`,
  `spec-synthesizer` (`references/pipeline-flow.md` station map).
- **Cost:** slow, long thinking on every pass, including re-analysis and correction passes.
- **Change:** **done** for the interrogator (it phrases questions from the gap list
  `gate-check.mjs` already computed). Further (S): drop xhigh on the enricher once S-2 makes it a
  patch writer, and run Station 7 correction passes at medium.

### S-4 The synthesizer reads ~1,600 lines and writes one monolithic file

- **Evidence:** `agents/spec-synthesizer.md` Step 1 loads `templates/spec-frontmatter.yaml` (287),
  `templates/spec-body.md` (75), `references/spec-schema.md` (415) and
  `fixtures/example-spec.md` (**897**). Every Station 7 correction pass (up to 2) repeats it.
- **Cost:** input on every pass; one long write that cannot start the next section until the
  previous one is done.
- **Change (M/L):**
  - Replace the 897-line fixture with a ~150-line excerpt (one entity, one state machine, one
    story with ACs, one slice).
  - Split synthesis into section workers that run in parallel where they are independent —
    entities + state machines + rules + permissions / stories + ACs / API + UI + notifications /
    delivery plan — each writing a YAML fragment; `merge-spec.mjs` (already exists for continue
    runs) assembles them.
  - Correction passes receive only the failing ids and edit those items in place instead of
    re-reading everything.

### S-5 Loop caps allow many full re-runs

- **Evidence:** `references/pipeline-flow.md` — clarification ≤ 3 rounds, completeness ≤ 3 rounds,
  validation ≤ 2 passes, review ≤ 3 cycles. A completeness failure re-runs analyst (gap mode) →
  interrogator → enricher update → completeness (`agents/spec-orchestrator.md` Station 5).
- **Cost:** in the worst case 3 + 3 extra analyst/enricher cycles before synthesis even starts.
- **Change (S/M):** fold completeness questions into the clarification round (the analyst already
  checks the same 10 categories, `spec-analyst.md` Step 6), cap completeness at 1 round, and send
  anything left to `open-questions[]`.

### S-6 Every packet spawns a fresh orchestrator

- **Evidence:** `generate-spec/SKILL.md` packet table — each `CLARIFY_PACKET` / `REVIEW_PACKET`
  re-spawns `spec-orchestrator` in `MODE: resume|revise`; it re-reads its 291-line prompt and the
  251-line `pipeline-flow.md` each time.
- **Change (S):** `resume` the same agent id with the answers (both hosts support resume), so the
  prompt and prior reads stay cached.

### S-7 Mechanical stations run on models — **done**

- **Evidence (before):** Station 8 `spec-diagram` wrote Mermaid diagrams from YAML fields only;
  Station 5 source fidelity was "every intake id appears in some `intake_refs`"; Station 9 review
  packets were assembled by an agent.
- **Change (done):** `render-spec-views.mjs` renders user-flow, API-sequence and navigation
  diagrams (the `spec-diagram` agent is deleted); `score-completeness.mjs` computes fidelity and
  evidence, and `spec-completeness` only judges category credit; `compose-review.mjs` builds the
  review packet, and `spec-review-facilitator` only applies edits.
- **Trade-off:** the facilitator's semantic warnings in the packet (weak `then` clauses, slice
  smells, copy drift) are no longer produced.

### S-8 Every agent is told to read `pipeline-flow.md`

- **Evidence:** `generate-spec/SKILL.md` companion table L52: "this skill, orchestrator, every
  agent"; each agent header repeats "Station reference: pipeline-flow.md".
- **Change (S):** only the orchestrator reads it; workers get their station card in the spawn.

### S-9 The duration table is wrong

- **Evidence:** `generate-spec/SKILL.md` L273-284 says ~3 minutes with no clarification rounds.
- **Change (S):** replace with measured numbers once X-6 exists.

---

## 4. html-generator-kit

### H-1 Station 4 multiplies identical text per page

- **Evidence:** each `screen-generator` carries a 335-line prompt
  (`agents/screen-generator.md`), reads `accessibility.md` (57), `alpine-interaction-patterns.md`
  (142), `interaction-conventions.md` (95), `templates/page-shell.md` (156), and gets ~185 lines of
  pasted `design_ref` / `ux_directives` / `component_manifest` (`agents/html-orchestrator.md`
  Station 4).
- **Cost:** ~970 lines × N pages — about 10,000 identical lines for 10 pages — plus the copies held
  in the orchestrator.
- **Change (M):** pass paths, not pasted contracts; move the HTML recipes that repeat
  `page-shell.md` / `interaction-conventions.md` out of the agent body; read
  `alpine-interaction-patterns.md` only for pages that have forms or modals.

### H-2 Station 2 reads ~1,066 lines of CSS templates at once — **done (scripted)**

- **Evidence (before):** `design-system-author` loaded ~1,066 lines of CSS templates and rewrote
  them with the brief's values.
- **Change (done):** the design brief ends with a `## Slots` JSON block;
  `apply-design-brief.mjs` fills tokens/base/components CSS, appends the ALWAYS + selected
  signature blocks, applies locked tokens verbatim and writes `design-system-ref.md`. The agent
  is deleted; a bad slot goes back to `design-strategist` as `FIX:`.

### H-2b Other mechanical html stations — **done (scripted)**

- `delta-pages.mjs` → `spec-summary.json` replaces `spec-interpreter` (Station 0/1).
- `assemble-prototype.mjs` replaces `assembly-wiring` (Station 5; index copies the first page's
  shell so the shell-consistency check holds).
- `qa-prototype.mjs` replaces `qa-validator` (Station 6; every static checklist row).
  Trade-off: the warning-only `ui-ux-pro-max` pro-rules pass is dropped.
- `finalize-prototype.mjs` writes README + `page-map.json` (Station 8) instead of the skill
  hand-writing them.

### H-3 Many `ui-ux-pro-max` queries in Station 1.5

- **Evidence:** `agents/design-strategist.md` runs 4-6+ `search.py` calls, one UX query per page
  type, each with a retry, plus the 162-line `references/ui-ux-pro-max.md`.
- **Change (S):** one batched UX query for all page types; cache results in the run folder so a
  revise does not repeat them.

### H-4 Listed references no agent reads

- **Evidence:** `generate-html/SKILL.md` companion table lists `references/qa-checklist.md` (139)
  and `references/artifact-structure.md` (155) as loaded by agents. With the QA script in place,
  `qa-checklist.md` is the script's documentation; `artifact-structure.md` is still unread.
- **Change (S):** remove the table rows or delete the files, so a model following the table does
  not read them.

### H-5 Broad revise cascades

- **Evidence:** `references/pipeline-flow.md` — a "more modern" request re-runs Stations 1.5, 2, 3
  and every page.
- **Change (M):** cascade to pages only when tokens/classes they use changed (`delta-pages.mjs`
  already computes page deltas for append runs).

### H-6 Model tier

- **Change:** **done** — `modification-router` (keyword triage) moved to the fast tier.

---

## 5. feature-dev-kit

### F-1 Same-layer slices run one at a time; gates after every layer

- **Evidence:** `skills/feature-dev/references/pipeline-flow.md` L143-156 (sequential, worktrees
  forbidden); `run-gates.sh --until fsd` after each of Stations 3-7.
- **Change (M):** run independent slices of one layer in parallel when their file sets do not
  overlap (the build plan already names each slice's paths); run one gate pass per layer instead
  of per slice.

### F-2 Builders load a long reference and skill chain

- **Evidence:** every builder reads `ui-build-contract.md` (84), `fsd-architecture.md` (138),
  `increment-protocol.md` (121), `development-cycle.md` (78), some also `fsd-import-boundaries.md`
  (112); then chains, e.g. `create-feature` → `rhf-form` + `react-query-hook` +
  `create-react-component` → `react-component` + `tailwind-styles` + `accessibility` + `testing` +
  `error-handling` + `i18n`.
- **Change (M):** one ~100-line builder card per layer that inlines the rules each builder actually
  applies, and load companion skills only when the slice needs them (form → `rhf-form`, etc.).

### F-3 Broad frontend-dev-kit rules attach to nearly every edit

- **Evidence:** `frontend-dev-kit/rules/react.mdc` (227, `**/*.{tsx}`), `typescript.mdc` (219) and
  `general-coding-principles.mdc` (224) on `**/*.{ts,tsx}`; `testing.mdc` also on
  `**/src/**/*.{ts,tsx}`.
- **Change (S/M):** trim each to the constraints (≤ 40 lines per the repo's own authoring rule) and
  move the procedures into the skills that already exist.

### F-4 Late review in separate passes

- **Evidence:** Station 9.5 `architecture-auditor` and Station 10 `code-reviewer` both read the
  whole diff; the browser check before Station 12 can trigger a full `MODE: revise`.
- **Change (M):** one review pass over the diff with both checklists, or run them in parallel.

### F-5 `code-explorer` always runs

- **Evidence:** Station 1 on standard and full tiers (`pipeline-flow.md` L43).
- **Change (S):** skip when `prototype-inventory.md` and the upstream import already name the
  touched slices and they all exist.

### F-6 Model tier

- **Change:** **done** — `app-engineer` (route and navigation wiring) moved to the fast tier;
  `code-reviewer` and `architecture-auditor` got `effort: high` (judgement work).

### F-7 Mechanical agents — **done (scripted)**

- `upstream-interpreter` deleted: the skill already runs `import-upstream.mjs` into the
  blackboard, and `spec-analyst` reads `SPEC_PATH` directly.
- `quality-gate-runner` deleted: the orchestrator (or the skill, on patch) runs
  `run-gates.sh … --spec {SPEC_PATH} --station "Station N"`, which also appends the Gate Log row.
- orchestrate-frontend: `update-checklist.mjs` does every Station 3 status/log write and maps the
  feature-dev envelope to `next: continue | rerun | ask | stop`.

---

## 6. Model selection

### Tier map (`scripts/model-tiers.json`)

| Claude frontmatter | Cursor model | Used for |
|---|---|---|
| `opus` | `grok-4.7[effort=high]` | orchestrators |
| `sonnet` + `effort: high` or `xhigh` | `grok-4.7[effort=high]` | analysis, synthesis, review |
| `sonnet` | `grok-4.7[effort=medium]` | implementers, writers |
| `haiku` | `composer-2.5[fast=false]` | parsers, gate runners, validators, wiring |

Pricing basis (`https://cursor.com/docs/models`, per million tokens): Grok 4.7 $2 in / $6 out;
Composer 2.5 $0.5 in / $2.5 out. Both are in the Cursor Models pool.

Regenerate after any frontmatter change: `npm run build:cursor-agents`.

### Per agent (after this change)

| Kit | Agent | Claude | Cursor |
|---|---|---|---|
| spec-dev-kit | spec-orchestrator | opus | grok-4.7 high |
| | spec-analyst | sonnet xhigh | grok-4.7 high |
| | spec-enricher | sonnet xhigh | grok-4.7 high |
| | spec-synthesizer | sonnet xhigh | grok-4.7 high |
| | spec-interrogator | sonnet (was xhigh) | grok-4.7 medium |
| | spec-review-facilitator | sonnet | grok-4.7 medium |
| | spec-completeness | haiku | composer-2.5 |
| html-generator-kit | html-orchestrator | opus | grok-4.7 high |
| | design-strategist, component-library-author, screen-generator | sonnet | grok-4.7 medium |
| | modification-router | haiku (was sonnet) | composer-2.5 |
| feature-dev-kit | feature-orchestrator | opus | grok-4.7 high |
| | code-reviewer, architecture-auditor | sonnet high (was sonnet) | grok-4.7 high |
| | spec-analyst, research-analyst, shared/entities/features/composition-engineer, slice-engineer, test-engineer | sonnet | grok-4.7 medium |
| | code-explorer | haiku | composer-2.5 |
| | app-engineer | haiku (was sonnet) | composer-2.5 |

The parent chat (`/orchestrate-frontend` and the kit skills) runs on whatever model the chat is set
to — pick Grok 4.7 in the Cursor model picker.

Agents whose tools are only Read/Grep/Glob get `readonly: true` in the Cursor copy.

Deleted because a script does the whole job: `spec-diagram`, `spec-interpreter`,
`design-system-author`, `assembly-wiring`, `qa-validator`, `upstream-interpreter`, and the
feature-dev `quality-gate-runner` (backend-dev-kit and agent-dev-kit keep theirs).

---

## 7. Roadmap

| # | Item | Effort | Expected effect |
|---|---|---|---|
| 1 | X-1 model tiers in Cursor | done | mechanical agents on Composer 2.5 |
| 2 | X-2 polling removed (foreground agents) | done | zero polling turns |
| 2b | S-1 / S-7 / H-2 / H-2b / F-7 mechanical stations → scripts | done | 7 agents deleted; their output is now free |
| 3 | X-6 per-station timing | S | measure before redesigning |
| 4 | S-2 enricher patch + seeded register | done; synth prefill later | removes one of three copies now, the second later |
| 5 | S-4 short fixture, section workers, targeted corrections | M/L | shorter synthesis, parallel sections |
| 7 | S-5 / S-6 fewer loops, resume same orchestrator | S/M | fewer full re-runs |
| 8 | X-3 fresh chat per station | S | parent context stops growing across kits |
| 9 | X-4 / F-3 rule scoping | S/M | less always-on text in every turn |
| 10 | H-1 / H-2 paths not pasted contracts, selective CSS reads | M | ~N× fewer duplicated prototype tokens |
| 11 | F-1 / F-2 parallel slices, builder cards | M | shorter feature wall clock |
| 12 | X-5 / S-8 / H-4 de-duplication | S | less text, less drift |
