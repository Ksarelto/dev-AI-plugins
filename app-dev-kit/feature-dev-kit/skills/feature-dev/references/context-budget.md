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

## Blackboard-first rule

The spec file at `.spec/features/<slug>.md` is the ONLY shared state passed between agents. Chat history is never a handoff medium (already enforced by `orchestration-protocol.md`). This rule extends that:

- Workers receive **only the section paths they need to read**, not the full spec content.
- Workers write directly to their assigned sections; the orchestrator does not proxy writes.
- The orchestrator itself reads only the sections it needs to decide the next station — not the entire spec every hop.
- Cross-kit: return `.spec/features/{slug}.kit-result.json` (paths + outcome) to `orchestrate-app`.
  Never paste the blackboard or a diff into the parent conversation.

## Per-worker input allowlist

The delegation template already lists SPEC + TARGET + APPLY + BOUNDARY + RETURN. This rule adds a required `SPEC_SECTIONS` field.

```
OBJECTIVE: <one sentence>
SPEC: .spec/features/<slug>.md
SPEC_SECTIONS:
  read:  <exact section headers the worker needs>
  write: <exact section headers the worker will update>
TARGET: <layer>/<slice>/<segment>
APPLY: <rule files>
BOUNDARY: <paths>
RETURN: <expected outputs>
```

Workers open the spec file, jump to their listed sections, and never scan sections outside their allowlist.

## Layer-specific slices

| Worker | read sections | write sections |
|--------|--------------|----------------|
| `upstream-interpreter` | (reads `UPSTREAM_SPEC` file, not the blackboard) | none — returns a compact slice |
| `spec-analyst` | Request, Clarifications, Acceptance criteria, UI surface, API contract | those same sections; never status `approved` |
| `code-explorer` | Request, Acceptance criteria, UI surface | FSD Impact, Reuse map, UI surface (refine), Decisions |
| `research-analyst` | FSD Impact, API contract, UI surface | Tech Investigation, Dependencies |
| `shared-engineer` | Dependencies, Reuse map, Build plan (shared row) | Build plan (shared row), Gate log |
| `entities-engineer` | API contract, Data model, Reuse map, Build plan (entity rows) | Build plan (entity rows), Gate log |
| `features-engineer` | UI surface (interaction slices), Build plan (feature rows) | Build plan (feature rows), Gate log |
| `composition-engineer` | UI surface (this screen), Reuse map, Build plan (widget/page rows) | Build plan (widget/page rows), Gate log |
| `app-engineer` | UI surface (route map), Build plan (app row) | Build plan (app row), Gate log |
| `slice-engineer` | The sections for its LAYER + SLICE only | Build plan (its row), Gate log |
| `test-engineer` | Acceptance criteria, Build plan | Build plan (test rows), Gate log |
| `quality-gate-runner` | Gate log | Gate log |
| `architecture-auditor` | FSD Impact (baseline) or changed-file list (diff) | **none** — returns report markdown; hub writes the blackboard |
| `feature-orchestrator` | Build plan, Gate log, status, Human Review | **only** `.spec/features/<slug>.md` (never `src/`) |

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
- The invocation writes coverage results per slice into the spec's Gate log before returning.

## Parallel workers

When independent slices run in parallel (worktree-isolated), each parallel worker receives ONLY its own slice's SPEC_SECTIONS. Do NOT batch-inline all slice sections into every worker — pass a slice-scoped payload per worker.

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
| Return command output or file contents to the orchestrator | Return summaries and paths; the orchestrator re-reads what it needs |
| Say "follow the project conventions" instead of naming rule files | An unnamed rule loads nothing — that is starvation |
| Inline the same reference into every parallel worker | Pass the path; each worker loads it in its own window |

## When context conflicts

If the spec contradicts the codebase — the spec says REST, the entity slice uses GraphQL — do not
silently pick one. Write the conflict to `## Decisions & Open Questions`, state both options and
your recommendation, and return to the orchestrator. Inventing a resolution is how a feature ends up
half-built against each answer.

Likewise, when the spec does not cover a case the implementation needs: check the codebase for
precedent first; if none exists, escalate rather than inventing a requirement.
