# Context Budget — feature-dev-kit

**Binding payload contract.** Defines exactly what each agent receives at each station. Prevents
context explosion on multi-slice features and large-diff reviews — the failure mode that turns a
working pipeline into a stalling one.

`pipeline-flow.md` gives the summary table; this file is the authority when they differ.

## The two failure modes

| Failure | Symptom | Cause |
|---------|---------|-------|
| **Starvation** | Agent invents APIs, ignores conventions, re-implements existing helpers | The delegation named no rule files and no reuse map |
| **Flooding** | Agent loses focus, edits outside its slice, output degrades late in a run | Full spec, raw diffs, or another worker's file list was inlined |

Both are fixed the same way: name the exact sections and rule files, and nothing else. Aim for under
~2,000 lines of focused context per worker. Context window size is not attention budget.

## Handoff by link

Chat is a pointer. The orchestrator does not receive a worker's report, diff, gate log, or file bodies.

Directory: `.spec/features/<slug>.context/`

| File | Writer | What is inside |
|------|--------|----------------|
| `<agent>-<station>.md` | the spoke that just finished | station, outcome, paths touched, decisions, open questions, link to any longer artifact |
| `architecture-auditor-<station>.md` | `architecture-auditor` | the full architecture report. The blackboard stores this path plus one summary line |
| `orchestrator-checkpoint.md` | `feature-orchestrator` | current station, status, decisions, next action, links to spoke handoffs |
| `session.md` | `feature-dev` skill | where the human-facing run left off, which packet is pending, links only |
| `cards/row-<n>.md` | `board.mjs card` (orchestrator) | one delegation's rows plus the sections that agent builds from — the worker's only view of the board |
| `fix-batch-<n>.md` | `feature-orchestrator` (Station 11) | one owning agent's findings, one line each |
| `gate-status.md`, `gate-log.jsonl` | `run-gates.sh --spec` / `board.mjs gate` | latest result per gate; full gate history |
| `glossary.md` | `import-upstream.mjs` | the spec glossary, read by path by workers that write copy |
| `timings.jsonl` | `board.mjs` (card, gate, timing) | spawn and gate timeline per station — measure before optimizing |

A handoff file is **at most ~15 lines**: outcome, paths touched, decisions, open questions. Name a
gate and its result (`lint: pass`); never copy gate output, Gate Log rows, or the row's Build Plan
note into it — each fact is written once (gate → `gate-status.md`, row state → `board.mjs row`,
detail → the handoff).

Chat return from any spoke, at most five lines:

```
HANDOFF: .spec/features/<slug>.context/<agent>-<station>.md
CONTAINS: <one line — files touched, gate result, open questions>
```

**Always:** do not inline. The next agent opens a handoff only when its station card names that path.

**When a spoke is near its limit** (it has read a large diff, a long spec section, or a gate transcript, or it is about to re-read something it already summarized): refresh its handoff with the main facts and keep working from that file.

**When the orchestrator is near its limit** (a layer just finished, or it has more than one spoke return and is about to spawn the next station): rewrite `orchestrator-checkpoint.md`, then spawn the next worker with only that checkpoint path, the station card, and the one handoff link that worker must read. Do not restate earlier spoke chat. Do not `Read` source files the worker just wrote.

**When the main `feature-dev` conversation is near its limit** (several clarify rounds, a revise cycle, or a returned packet plus a long spec): rewrite `session.md`. The next spawn receives `session.md` plus `SPEC_PATH`. Do not replay the prior conversation.

Packets stay small JSON. `REVIEW_PACKET.review_path` points at the review handoff. The skill reads that file once when it asks the human.

## Blackboard-first rule

The spec file at `.spec/features/<slug>.md` is the shared state for decisions. Chat history is never a handoff medium. Long artifacts live in `.spec/features/<slug>.context/`.

- The Read tool cannot open one section of a file, so "read sections X, Y" alone still costs the
  whole board. Section access is a script: `scripts/board.mjs`.
- Pre-build workers (Stations 0–1b) edit their assigned sections directly.
- Build workers (Stations 3–8) get a **work card** — `board.mjs card <board> --row <n> --agent <name>`
  writes `<slug>.context/cards/row-<n>.md` with their rows and the sections in the table below,
  verbatim. They never Read or Edit the board. They write back with `board.mjs row` (Status + one
  current Note) and `board.mjs append` (`Reuse Map`, `Decisions & Open Questions`) — atomic script
  writes, so nobody holds a stale copy.
- Gate results never go onto the board (`run-gates.sh --spec` / `board.mjs gate` →
  `<slug>.context/gate-status.md` + `gate-log.jsonl`).
- The orchestrator reads the checkpoint and `board.mjs section <board> --get "<Header>"` for what it needs — not the entire spec every hop.
- Cross-kit: return `.spec/features/{slug}.kit-result.json` (paths + outcome) to `orchestrate-frontend`.
  Never paste the blackboard or a diff into the parent conversation.

## Per-worker input allowlist

Stations 0–1b delegations name `SPEC_SECTIONS` (read / write). Stations 3–8 delegations name a
`CARD` instead — the card *is* the allowlist:

```
OBJECTIVE: <one sentence>
CARD: .spec/features/<slug>.context/cards/row-<n>.md
TARGET: <layer>/<slice>[, <slice>…]/<segment>
APPLY: skill: <one skill>
BOUNDARY: <paths>
RETURN: HANDOFF path + one CONTAINS line. No file bodies, diffs, or command output.
```

Workers read the card and the paths its "Read by path" block names, when they need them. On
Cursor, rule files attach by glob; on Claude they do not, so the card names the rule file a
worker must read. `APPLY` names one skill.

**Fixed text first, card last.** Every worker's agent body puts its fixed reads
(`ui-build-contract.md`, `increment-protocol.md`, the glob rules) ahead of the per-spawn `CARD`.
The fixed part is byte-identical across every spawn of that role, so the host serves it from its
prompt cache after the first one — a batched row or a 9-spawn layer pays for the contract once.
Keep the delegation fields in the order above and do not inline card content into `OBJECTIVE`;
either makes each prefix unique and loses the discount.

## Layer-specific slices

Every card also carries Request, Clarifications, and Decisions & Open Questions (binding human
input), the Build Plan preamble, and its `### Not building` list. `board.mjs` owns the exact map.

| Worker | reads (card for Stations 3–8) | writes |
|--------|------------------------------|--------|
| `spec-analyst` | Request, Clarifications, Acceptance criteria, UI surface, API contract | those same sections; never status `approved` |
| `code-explorer` | Request, Acceptance criteria, UI surface | FSD Impact, Reuse map, UI surface (refine), Decisions |
| `research-analyst` | FSD Impact, API contract, UI surface | Tech Investigation, Dependencies |
| `shared-engineer` | card: Acceptance criteria, FSD Impact, API contract, Reuse map, Dependencies | `board.mjs row` (its rows), `append` Reuse Map |
| `entities-engineer` | card: Acceptance criteria, FSD Impact, API contract, Reuse map | `board.mjs row`, `append` Reuse Map |
| `features-engineer` | card: Acceptance criteria, FSD Impact, API contract, UI surface (its screens), Reuse map | `board.mjs row`, `append` Reuse Map |
| `composition-engineer` | card: Acceptance criteria, FSD Impact, API contract, UI surface (its screens), Reuse map | `board.mjs row`, `append` Reuse Map |
| `app-engineer` | card: Acceptance criteria, FSD Impact, UI surface (route map), Reuse map | `board.mjs row` |
| `slice-engineer` | card: every build section | `board.mjs row`, `append` Reuse Map |
| `test-engineer` | card: Acceptance criteria, UI surface | `board.mjs row` (test rows) |
| `architecture-auditor` | FSD Impact paths (full-tier baseline) or changed-file list (diff) | **none on the blackboard** — writes the report to its handoff file |
| `feature-orchestrator` | Build plan, `gate-status.md`, status, Human Review, checkpoint — via `board.mjs section --get` | `.spec/features/<slug>.md` and `.spec/features/<slug>.context/` (never `src/`) |

Anything outside the listed sections is off-limits without an explicit orchestrator note extending the allowlist.

## code-reviewer input contract

The `code-reviewer` must NOT receive the raw output of `git diff main...HEAD`. Instead:

1. Orchestrator runs `git diff --name-only main...HEAD` and passes the file list.
2. `code-reviewer` iterates the file list, reading each file's diff on demand via `git diff main...HEAD -- <path>`.

Never load the entire diff into the reviewer's prompt. If the file list is large, the 100 KB
diff-size guard still applies per path; do not invent a second triage agent.

## test-engineer invocation model

- One `test-engineer` invocation per **layer group** (shared, entities, features, composition, app), not one per slice — otherwise per-slice invocations pay the setup cost N times.
- Each invocation receives:
  - `LAYER_GROUP`: one of `shared` / `entities` / `features` / `composition` / `app`
  - `SLICE_PATHS`: [ `src/{layer}/{slice}`, ... ]
  - `COVERAGE_TARGETS`: from `quality-gates.md`
- The invocation writes coverage results per slice into its handoff (one line per slice); the Station 9 coverage gate records the gate result.

## Slice workers

Each worker receives only its own rows' card. Do not inline every slice's sections into one worker.
A batch row (same-shape slices, `build-plan.md` rule 1) is one card and one worker.

## Fix batches (Station 11)

Group every open finding (gate, architecture-audit, code-review, parity) by owning agent and layer.
Write each group to `<slug>.context/fix-batch-<n>.md` (one line per finding: path, rule, what to
change) and spawn **one** owning engineer per batch with that path and a card for the affected
rows. The same finding in N sibling slices is one batch, not N spawns.

## Prototype inventory

`.spec/features/<slug>.context/prototype-inventory.md` is passed by **path** to UI workers and to
`code-reviewer`. Never paste its rows into a prompt or onto the blackboard. Workers read the rows
for their page/state and edit only the React target / Status cells. The prototype HTML itself is
read only by `composition-engineer` (and the browser check), never by the orchestrator.

## Size guards

| Payload | Soft limit | Action on breach |
|---------|-----------|------------------|
| Any single worker's spec slice | 12 KB | Split the section; escalate to orchestrator to re-scope |
| Diff passed to reviewer | 100 KB | Split the file list; reviewer reads remaining paths on demand |
| `git status` output attached | never | Reviewer runs git commands itself; orchestrator does not inline output |

## Anti-patterns

| ❌ Never | Why |
|---------|-----|
| Read the entire spec in every station | The spec grows with each station; re-reading amplifies cost |
| Pass raw `git diff` output to `code-reviewer` | Reviewer's prompt grows linearly with feature size |
| Pass all slice paths to every worker | Parallel workers should not know about each other's files |
| Batch multiple stations' outputs into one prompt | Every station's payload is single-purpose |
| Return command output or file contents to the orchestrator | Return `HANDOFF` + `CONTAINS`; the next agent opens the file only if named |
| Say "follow the project conventions" instead of naming rule files | An unnamed rule loads nothing — that is starvation |
| Inline the same reference into every parallel worker | Pass the path; each worker loads it in its own window |
| Point a build worker at the blackboard | Pass its card (`board.mjs card`); the board holds every other row and section |
| Spawn one fixer per finding or per slice for the same change | One fix batch per owning agent + layer |
| Write gate rows or row history onto the board | `gate-status.md` / `gate-log.jsonl`; one current Note per row |

## When context conflicts

If the spec contradicts the codebase — the spec says REST, the entity slice uses GraphQL — do not
silently pick one. Write the conflict to `## Decisions & Open Questions`, state both options and
your recommendation, and return to the orchestrator. Inventing a resolution is how a feature ends up
half-built against each answer.

Likewise, when the spec does not cover a case the implementation needs: check the codebase for
precedent first; if none exists, escalate rather than inventing a requirement.
