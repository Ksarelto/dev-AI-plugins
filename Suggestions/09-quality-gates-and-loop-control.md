# 09 — Quality gates and loop control

Two jobs, both deterministic:

- **Gatekeeper** — is this output good enough to move on?
- **Loop Warden** — if not, what happens next, and when do we stop?

Principle: *let models exercise judgement; let scripts decide when to stop.*

## Gate catalogue

| Gate | Stage | Checks (script) | Owner of the check |
|---|---|---|---|
| `gate-intake` | S0 | every requirement-bearing paragraph has a source ID; coverage checklist has no blocker gaps (else → guided interview) | core |
| `gate-conformance` | A0 | architecture rules of the stack pack (e.g. FSD import boundaries) | stack pack |
| `gate-spec` | S1 | schema valid; IDs unique; ACs measurable (no "fast", "intuitive"); 0 blocker questions; delta-spec has `removed` | core |
| `gate-stories` | S2 | every story → REQ; ACs parse as Gherkin; UX states listed | core |
| `gate-proto` | S2.5 | writes only in sandbox; renders; no new deps; report schema valid | role pack |
| `gate-arch` | S3 | contract lints (OpenAPI); every component owned by a story; reuse decisions present | core |
| `gate-plan` | S4 | DAG acyclic; every AC → ≥ 1 test; task size ≤ limits; `files_expected` inside role `owns_paths`; every net-new item has `reuse_rejected`; every `HD-*` note made so far is mapped to a REQ / AC / task or declined | core |
| `gate-plan` (TDD part) | S4 | every behaviour-bearing task has `tdd.mode: required` and `red_tests`; `exempt` only for whitelisted task types, with a reason | core |
| `gate-red` | S5 (red) | new tests type-check; each new test fails with an assertion or not-implemented error (not import / syntax / type errors); pre-existing tests still pass | core + role pack |
| `gate-impl` | S5 (green) | tsc, lint, unit tests, build — scoped to touched files; red test files' hash unchanged since `gate-red` | role pack |
| `gate-verify` | S6 | coverage of changed lines ≥ threshold; acceptance tests pass; 0 P0/P1 review findings; audits within thresholds; contract conformance; no fixture imports in `src/` | core + role pack |
| `gate-qa` | S7 | S1/S2 defects = 0 or waived by a human | core |
| `gate-docs` | S8a | feature doc exists and lists every AC of the feature; ADRs referenced in the plan are promoted to `docs/adr/`; CHANGELOG entry present; OpenAPI regenerated and diff-clean when `api-contract.yaml` changed | core |
| `gate-ready-for-pr` | S8 | commitlint; every commit has a task trailer; PR template complete; CI green; no `HD-*` note still `open` | core |
| ID coverage (every stage exit) | all | every ID in the exiting stage's `tracked_ids` that is still open appears in its outputs or in the digest ([07](07-context-engineering.md#where-context-can-be-lost-and-what-catches-it)) | core |

Gates return a normalised result:

```json
{ "gate": "gate-impl", "pass": false,
  "progress_signal": 2,                  // failing checks + failing tests + unsatisfied ACs; lower is better
  "fingerprint": "a91f3e",               // sha1(normalised stderr: paths, line numbers, timings stripped)
  "failures": [{ "check": "eslint", "rule": "jsx-a11y/label-has-associated-control", "file": "…", "count": 2 }],
  "cached": false }
```

**Gate result caching**: inputs are hashed; an expensive gate (e2e, Lighthouse) is skipped when nothing it depends on changed.

## Preconditions

Before every dispatch the Conductor runs a cheap precondition script:

- Working tree of the target worktree is clean (excluding `.factory/`) — kept from app-dev-kit.
- Index SHA matches the feature's frozen SHA.
- Task dependencies are `done`.
- **Idempotency**: if `files_expected` exist, the task's tests pass, and the file-state hash equals the hash at the last PASS → mark `skipped_idempotent`, don't dispatch. Makes `/factory:run` safely resumable after crashes and compaction.

## Loop Warden

### Budgets as state

```yaml
budgets:
  feature:   { tokens: 2_500_000, wall_clock_min: 240, dispatches: 60 }
  stage:     { dispatches_max: 8 }
  task:      { attempts_max: 3, wall_clock_min: 25 }      # wall clock = hung-agent detection
  prototype: { revisions_max: 3, tokens: 180_000 }
  backward_edges:
    prototype_to_requirements: 1
    verification_to_implementation: 2
    qa_to_implementation: 2
    total_regressions_max: 4
```

Exhaustion is not an error to retry — it is a terminal transition to `blocked` with `blockers.md` and a human notification.

### Detection rules

| Rule | Trigger | Action |
|---|---|---|
| **Monotonic progress** | `progress_signal[n] >= progress_signal[n-1]` twice | escalate (don't retry same rung) |
| **Fingerprint repeat** | same fingerprint twice in a row | escalate immediately |
| **Oscillation** | file-state hash at attempt n == attempt n-2 | escalate |
| **Hung agent** | task wall clock exceeded / no envelope | kill, record `transient`, one retry from checkpoint, then escalate |
| **Business error** in envelope | `error.type == business` | never retry; route to analyst or human |

### Escalation ladder (each rung used at most once)

| Rung | Action | Context change |
|---|---|---|
| 0 | initial dispatch | standard pack |
| 1 | same agent + validator output | + T3 feedback, "fix only what's reported" |
| 2 | same agent, **higher model tier**, must state a hypothesis before editing | + previous attempt diffs |
| 3 | `diagnostician` (read-only) writes `root-cause.md` | full gate logs, wider read allowlist, cold context allowed |
| 4 | **split**: Conductor asks the planner to replace the task with 2–3 smaller tasks | fresh packs |
| 5 | **human**: `blocked` + `blockers.md` with everything tried | — |

Rung 3 is the one teams skip and shouldn't: separating diagnosis from repair removes the failed attempts' assumptions.

## Review design

One review stage, distinct lenses, no overlap (replaces today's three overlapping reviews). Lenses run as **parallel read-only spokes** sharing a cached prefix, then a cheap merge pass deduplicates findings.

| Lens | Question | Mandatory when |
|---|---|---|
| 1 Behaviour preservation | Did the change alter behaviour the spec did not authorise? | brownfield / change request |
| 2 Hidden assumptions | What did the code assume about data, APIs, errors, users? | always |
| 3 Spec / ADR drift | Does it respect the spec and recorded decisions? | always |
| 4 Independent tests | Were tests written from the spec, separately? (checks provenance) | always |
| 5 Edge cases | Empty, boundary, failure, concurrency, locale | standard + full tiers |
| 6 Security and tool surface | injection, secrets, unsafe input handling, auth paths | always |
| 7 Over-engineering | abstractions / deps / config not traceable to the spec | always |

Plus **stack-specific auditors** from the role pack (a11y with axe, bundle budget, token usage, i18n keys for frontend).

Review rules:

- The reviewer never sees the builder's envelope summary — only diff, spec, ADRs, golden files (avoids anchoring).
- **Multi-pass for large diffs**: per-file pass, then a cross-file integration pass on the per-file findings.
- Findings are structured (`lens`, `severity`, `file`, `line`, `claim`, `evidence`). P0/P1 block; P2 → fix if budget; P3 → listed in the PR.
- Security-sensitive paths (auth, payments, secrets) are flagged for **mandatory human review** at GATE-C regardless of findings.

## Independent tests

| Test kind | Written by | Context | When |
|---|---|---|---|
| Unit / component | role test-author | task DoD, ACs, test-plan cases, existing code — **never the builder's draft** | S5, per task, **before** the builder (red phase) |
| **Acceptance** | `acceptance-test-author` | **spec + contract only, no `src/`** | written at S5 start (must fail), run at S6 |
| Characterisation | role test-author | existing code, before modification | S5, first task of a change request (must pass on today's code) |
| Regression (from defects) | role test-author | QA steps | before each S1/S2 defect fix (must reproduce the defect, i.e. fail first) |

Every test kind except characterisation is **red-first**: a test that has never failed has not proven it tests anything. The red → green → refactor loop and its rules are in [03](03-sdlc-pipeline.md#test-first-two-nested-loops).

## QA and defect triage

`qa-engineer` is black-box: it reads stories, ACs, UX notes and the running app — never `src/` (hook-enforced). It works in **time-boxed charters** using a heuristic skill (boundaries, data volume, interruption, network, permissions, concurrency, i18n, a11y, input, device, state, visual).

| Placement | Charter | Time box | Output |
|---|---|---|---|
| QA-P (after prototype) | light: walkable? console clean? spec gaps? | 10 min | spec gaps → `spec_delta` |
| QA-H (after S6 machine gates, in parallel with review) | exploratory + adversarial + visual regression | 20 min (standard tier) / 40 min (full tier) | defects + spec gaps |

```yaml
qa:
  gate_policy:
    S1: block_pr
    S2: block_pr                 # or explicit human waiver + ledger entry
    S3: fix_if_budget_else_defer
    S4: auto_defer
    S5: auto_defer
  cycles: { qa_to_fix_max: 2, on_exhausted: human_decision }
  rules:
    qa_may_not_fix: true
    qa_may_not_create_tasks: true          # triage → planner creates tasks
    cycle_2_only_reopens_on: [S1, S2]      # stops the endless long tail
    spec_gaps_route_to: requirements-analyst
    s1_s2_become_regression_tests: true
```

## Hooks (enforcement summary)

| Hook | Enforces |
|---|---|
| `PreToolUse(Write\|Edit)` | protected paths; role `owns_paths`; task `files_expected`; sandbox during prototype; only planner writes `tasks.yaml`; builders cannot touch the task's `red_tests`; test-authors cannot touch source files beyond stubs |
| `PreToolUse(Read\|Grep\|Glob)` | read allowlist / budget; no unscoped search; `src/**` denied for QA and acceptance-test-author |
| `PreToolUse(Bash)` | no `git push --force`, no package installs outside approved tasks, no network calls except allowlisted |
| `PostToolUse(Write\|Edit)` | format + lint changed file; validate `.factory/**` artifacts against schemas |
| `SubagentStop` | envelope schema + summary length; required exit gate was run |
| `SessionStart` | load `state.json` summary and open `HD-*` notes; warn on stale index. Also fires after compaction (`compact` matcher), so the Conductor restarts from files |

Because hooks are workstation-local, the **same checks run again server-side as required CI checks** on the PR (`factory gate verify` in GitHub Actions). Hooks are the fast feedback; CI is the enforcement that survives a tool change.
