# Spec Dev Kit — Analysis (HISTORICAL)

> **Superseded.** This memo is dated **2026-07-17** (P0 banner 2026-07-27). Do not treat it as
> the current runtime contract. Canonical station map, HITL ownership, and eval guidance live in:
>
> - [`skills/generate-spec/references/pipeline-flow.md`](skills/generate-spec/references/pipeline-flow.md)
> - repo-root [`ANALYSIS.md`](../../ANALYSIS.md) (2026-09-17 research + first-pass eval)
>
> Current HITL owner is the **`generate-spec` skill**, not the orchestrator (a subagent cannot
> reach the user). Agent YAML frontmatter, marketplace registration, and `{KIT_DIR}` script paths
> were follow-ups to that research.

**Date**: 2026-07-17  
**Scope**: `.spec/spec-dev-kit/` (agents, rules, templates, skill) plus alignment with `kit-spec/` design notes and downstream kit naming  
**Verdict (then)**: Conceptually strong — internally inconsistent at the time. Several P0 items listed below were later addressed in `pipeline-flow.md`; remaining issues are tracked in `ANALYSIS.md` §5.

---

---

## 1. Executive summary

The kit gets the hard parts right:

- Clarify **before** enrich (in spirit)
- Explicit assumptions + conflict surfacing
- Hybrid YAML+Markdown contract
- Bounded loops + review deltas
- Completeness checklist grounded in known omission categories
- Diagrams derived from spec, not the reverse

What undermines it today is not missing ambition — it is **drift between documents** (station order, who asks the user, output paths, assumption confirmation rules) and a few **missing analysis/schema dimensions** that research and your own `kit-spec/spec_feature.md` already called out (feature vs app intake, source roles, machine-checkable schema, persisted intermediate state).

If an agent runs this kit “as written,” different files will give it different station numbers and different AskUserQuestion owners. That is the highest-priority fix.

---

## 2. Structure assessment

### 2.1 What is consistent and well shaped

| Layer | Assessment |
|-------|------------|
| Top-level layout | Clear: `agents/` · `rules/` · `templates/` · `skills/` — good kit pattern |
| Agent roster | Complete relative to design: intake → analysis → interrogator → enricher → completeness → synthesizer → validator → diagram → review → publisher + orchestrator |
| Rules coverage | Schema, naming, clarification, completeness, pipeline, context, context-budget — solid rule set |
| Templates | Front matter + body templates match the intended hybrid artifact |
| Principles | Four non-negotiables are clear and repeated on purpose (useful as invariants) |

Folder shape matches how the other kits in this repo are organized. Nothing in the tree looks like dead experimental junk; `context-budget.md` is a real addition (token hygiene) even though the README directory tree forgot it.

### 2.2 Unnecessary / redundant material

Not “delete everything,” but there is **duplication that invites drift**:

1. **Pipeline described in 4 places** — `README.md`, `rules/pipeline-flow.md`, `agents/spec-orchestrator.md`, and (conceptually) `kit-spec/flow.md` / `critical-notes.md`. Those already disagree on stage order.
2. **Principles restated** in README + pipeline-flow + agent boundaries — fine for emphasis, but only if one file is canonical.
3. **Model routing table** in README and pipeline-flow — keep one source of truth.
4. **Design notes outside the kit** (`kit-spec/*`) still describe an older stage order (diagrams before synthesis). Easy for agents/humans to load the wrong mental model.

**Suggestion**: Make `rules/pipeline-flow.md` the single canonical flow. README gets a short diagram + link. Agent headers only say “see pipeline-flow Station N” and must match that file. Archive or annotate `kit-spec/flow.md` as historical.

### 2.3 Naming / path inconsistencies (concrete bugs)

| Issue | Where | Why it hurts |
|-------|--------|--------------|
| Output path | Skill header: flat `{tc}_{slug}.spec.md`; skill success text + artifact-naming: folder `spec-{tc}_{slug}/spec.md`; pipeline-flow Stage 10: `{tc}_{slug}.spec.md` (missing `spec-` prefix) | Publisher and discovery globs will disagree |
| Review station | Skill: “hard stop at Station 7”; orchestrator: Station 9; review-facilitator header: Stage 7 | Orchestrator/skill stop conditions wrong |
| Downstream kit names | README / schema / skill: `prototype-dev-kit` + `ux-architect` | Actual kit in repo is `html-generator-kit` (and `/generate-html`) |
| README “What It Feeds” | Still says `.spec/app/*.spec.md` flat glob | Conflicts with folder layout |
| `context-budget.md` | Missing from README directory tree | Agents may not know it exists |

---

## 3. Pipeline consistency — the critical issues

### 3.1 Station order conflict (must fix)

**`rules/pipeline-flow.md` + `context-budget.md` imply:**

```
Enrichment (3) → Ask-before-enriching check (4) → Completeness (5) → Synthesis (6) → …
```

**`agents/spec-orchestrator.md` implements:**

```
Enrichment (3) → Completeness (4) → Ask-before-enriching check (5) → Synthesis (6) → …
```

So the orchestrator (the executable source of truth at runtime) **reorders** Completeness vs the ask-before-enriching check relative to the rules.

Worse: the check named **“Ask before enriching”** runs **after** enrichment (and in the orchestrator, after completeness). That name describes a pre-condition; the implementation is a post-hoc audit. Either:

- Move a real gate **before** Station 3 enrichment, or  
- Rename to “Ask-before-finalizing / unresolved-gap audit” and place it consistently.

### 3.2 Agent header station numbers are stale

| Agent | Claims | Orchestrator reality |
|-------|--------|----------------------|
| `spec-synthesizer` | Station 5 / correction Station 6 | Station 6 / correction under Station 7 |
| `spec-validator` | Station 6 | Station 7 |
| `spec-diagram` | Stage 6, “after completeness, before review” | Station 8, after synthesis+validation |
| `spec-review-facilitator` | Stage 7 | Station 9 |
| `spec-publisher` | Station 8 | Station 10 |

`spec-diagram.md` still encodes the **old** kit-spec order (diagrams before review from incomplete/enriched state). That contradicts the improved rule “diagrams only after validated synthesis.”

### 3.3 Synthesis correction loop diagram is wrong

In `pipeline-flow.md`, the “Synthesis Correction Loop” section labels Validation as Station 6 and re-synthesis as Station 5, then “EXIT to Station 7.” That does not match the Stage Sequence table in the same file (Synthesis 6, Validation 7, Diagram 8). Agents following the ASCII diagram will mis-route.

### 3.4 Who owns `AskUserQuestion`?

Conflicting contracts:

- Orchestrator: “the only agent that interacts with the user mid-pipeline” and `answers = AskUserQuestion(questions)` after interrogator returns `questions[]`
- Interrogator: “primary output is the AskUserQuestion call itself”; tools include AskUserQuestion
- Review facilitator: also calls AskUserQuestion
- Clarification protocol: interrogator batches AskUserQuestion

**Pick one model:**

1. **Recommended**: Orchestrator is the sole UI gate. Interrogator / review-facilitator return structured question packets; orchestrator asks.  
2. Or: Sub-agents may ask, and orchestrator never duplicates AskUserQuestion for the same station.

Until this is unified, you risk double prompts or skipped prompts depending on which agent file wins.

### 3.5 Assumption confirmation policy conflict

- `clarification-protocol.md`: all defaults → `requires-confirmation: true`
- `spec-enricher.md`: high-confidence defaults → `requires-confirmation: false`

Review facilitator only forces confirmation for `requires-confirmation: true`. Under the enricher rule, many defaults skip human confirmation — which violates Non-Negotiable #2 if read strictly.

**Suggestion**: Tiered policy, documented once:

| Confidence | `requires-confirmation` | Review treatment |
|------------|-------------------------|------------------|
| high (standard UI/a11y patterns) | false | listed in summary, not blocking |
| medium | true | confirm by cycle 2 |
| low / blocking | true + `open-questions` | block approve until answered or explicitly deferred |

### 3.6 Spec status set too early

`spec-synthesizer` sets `status: "approved"` while building the draft. Approval belongs to the review facilitator (or publisher after approval). Until then status should be `draft` / `reviewing`. Otherwise validators and downstream kits can treat an unreviewed draft as approved.

---

## 4. Requirements analysis quality

### 4.1 What the kit does well

Aligned with modern RE practice (BDD, Volere/FURPS-style omission lists, Socratic elicitation, spec-as-code):

| Practice | Kit support |
|----------|-------------|
| Goal / problem framing | `context.problem`, `context.goal`, body “Problem Context” |
| User stories + MoSCoW | `user-stories[]` with must/should/could/wont |
| Testable ACs (Given/When/Then) | `acceptance-criteria[]` + `testable` |
| Gap-driven questioning | analyst + interrogator + clarification protocol |
| Propose-and-confirm | explicit question format |
| Conflict as first-class | intake surface conflicts + analyst deep types |
| Explicit assumptions | `assumptions[]` |
| Traceability | `traceability.source-requirements` + source_map through intake |
| Out of scope | Markdown body section |
| NFR / a11y / security | schema + completeness categories |
| UI state completeness | 4 states on data screens |
| Review UX | deltas + convergence detection |
| Diagrams as communication | Mermaid derived from YAML |
| Bounded human cost | 3–7 Qs, max 3 rounds |

The 10-category completeness checklist is one of the strongest parts of the kit — it matches what `kit-spec/spec_feature.md` argued from research (error states, permissions, edge cases, etc.).

### 4.2 Gaps in analysis depth (things often missed)

These are not “nice to have fluff”; they are what turn a good feature sketch into a build-ready contract.

#### A. Feature vs app intake is typed but not branched

Schema has `type: feature | app | domain | integration`, but:

- Same question bank / completeness weights for all types
- No alternate depth for greenfield app (personas, journeys, MVP cut, bounded contexts) vs small feature (integration, migration, back-compat)

Your own design doc called this out as a structural difference. **Without branching, feature specs bloat and app specs stay thin.**

#### B. Source roles collapsed

Design notes assumed **customer vs architect** (or product vs eng) inputs with conflict reconciliation between roles. Context protocol treats all `.md` files as equal blobs. There is no `source-role: customer | architect | product | eng` on requirements.

Result: “latest file wins” is a weak conflict heuristic when roles matter more than timestamps.

#### C. No intermediate persisted blackboard

Critical notes recommended externalizing evolving state. The kit keeps `intake_report` / `analysis_report` / `enriched_requirements` as in-memory handoffs only.

Missing for “perfect” auditability:

- Written `intake-report.json` / `analysis-report.json` in the run folder (or `.spec/runs/{tc}/`)
- Full `qa_log` artifact
- Decision log before final YAML

Without this, long runs are hard to debug and hard to resume after a crash.

#### D. Schema gaps vs a comprehensive build contract

Present and useful: entities, stories, ACs, API, UI, NFR, risks, assumptions, open questions, traceability, decisions.

Weak or missing as first-class fields:

| Missing / weak | Why it matters |
|----------------|----------------|
| `context.non-goals` in YAML | Body has Out of Scope; machines/downstream kits won’t see it unless they parse prose |
| Permission / role matrix | Completeness checks for it; schema has no structured `roles[]` / `permissions[]` |
| Business rules / invariants | Only buried in AC text |
| Validation rules (field-level) | Entity fields lack maxLength, pattern, enums beyond free text |
| Domain events / side effects | API has errors; no first-class events (design doc had them) |
| Dependencies on other specs/features | No `depends-on` / `extends` |
| Success metrics / KPIs | Goal is prose-only |
| Glossary / ubiquitous language | Cross-team specs suffer without it |
| Feature flags / rollout | Completeness mentions flags; schema doesn’t |
| Data migration notes | Completeness category without a home in YAML |
| Analytics / product events | Distinct from observability logs |
| Offline / concurrency policy | Edge-case checklist items, not structured |
| `api-surface.endpoints` vs `mutations` | Overlapping shapes; unclear when to use which |

#### E. Validation is LLM-mechanical, not machine-mechanical

`spec-validator` is a haiku agent reading markdown rules. That is better than nothing, but not a trendy/best-practice hard gate.

Best practice for hybrid specs today:

1. Authoritative **JSON Schema** (or Zod) for front matter  
2. Deterministic validate step (script or tool)  
3. LLM only for semantic checks (orphan AC narrative, weak “then” clauses, etc.)

Without (1)+(2), “hard gate” is still probabilistic.

#### F. Gap score vs completeness score can diverge

Clarification exits at `gap_score ≤ 25`. Completeness later demands ≥ 85 on a different rubric. That is OK if intentional, but undocumented interaction causes thrash:

- Analyst can mark many gaps `can_assume_default: true` → interrogator skips them → enricher fills → completeness may still fail on categories that were “assumed” shallowly

Need a rule: assumed coverage counts as **partial** for completeness unless AC/error/permission artifacts exist.

#### G. INVEST / story quality not enforced

Stories are shaped, but there is no check that stories are Independent / Negotiable / Valuable / Estimable / Small / Testable beyond “has an AC.” Synthesizer guidance mentions independence; validator does not.

#### H. EARS / requirement quality language

No guidance to rewrite vague shall-statements into EARS-style (WHEN / IF / WHERE / THE SYSTEM SHALL). Analyst classifies types but does not normalize language quality.

#### I. Downstream consumer contract not locked

`feature-dev-kit` does not yet show concrete field reads for this schema (integration note even says kits “will be updated”). Until consumers declare `spec-version` + required fields, the YAML contract is sacred in theory and soft in practice.

---

## 5. Best practices & trendy approaches — scorecard

| Approach (2024–2026) | Kit status | Notes |
|----------------------|------------|-------|
| Spec-as-code in git | ✅ | Timestamped folders, history preserved |
| Hybrid YAML + MD | ✅ | Matches ADR / Backstage-style practice |
| Multi-agent pipeline with orchestrator | ✅ | Good decomposition |
| Human-in-the-loop with batching | ✅ | Strong design |
| Bounded loops + escalation | ✅ | Present |
| Explicit assumptions / decisions | ✅ | Present; policy conflict needs fix |
| Completeness rubric for known omission classes | ✅ | Excellent |
| Blackboard / persisted run state | ⚠️ | Described as in-memory only |
| Machine-checkable schema (JSON Schema) | ❌ | Markdown rules + LLM validator |
| Feature vs app elicitation forks | ⚠️ | Type field only |
| OpenAPI / AsyncAPI export | ❌ | API surface is custom YAML subset |
| Gherkin export / dual AC format | ⚠️ | GWT in YAML only |
| Structured outputs / tool schemas for agent I/O | ⚠️ | JSON examples in prompts, not enforced schemas |
| Eval harness for question quality / spec quality | ❌ | No golden context→spec tests |
| Resume / idempotent re-run | ⚠️ | New folder each run; no resume mid-pipeline |
| Context budgeting | ✅ | `context-budget.md` is modern and needed |
| Diagram-from-spec | ✅ | Correct polarity |

**Bottom line on trendiness**: You are in the right family of solutions (spec kits, agentic RE, hybrid contracts). You are behind on **deterministic validation**, **persisted intermediates**, **typed consumer contracts**, and **intake branching**.

---

## 6. Is anything unnecessary?

Candidates to simplify (not necessarily delete):

1. **Eleven agents** — workable, but intake+analyst or completeness as a pure script could reduce spawn overhead. Not wrong; just heavy for small features.
2. **Ask-before-enriching as a separate numbered station** — should be a precondition check inside orchestrator before Station 3, not a pseudo-stage after the fact.
3. **Duplicate API lists** (`endpoints` + `mutations` with same shape) — pick one list + `kind: query|mutation`, or generate mutations from stories.
4. **Body sections that restate YAML** (API summary table, screen inventory, AC coverage map) — useful for humans; mark clearly as generated views so synthesizer doesn’t invent divergent data.
5. **Emoji in review packets / assumption lists** — fine for UX; optional if you want stricter enterprise tone.

Nothing in the kit feels like pure filler documentation with no operational role — the problem is **conflicting operational instructions**, not empty files.

---

## 7. What would make the spec “perfect / comprehensive”

A practical definition for this repo (downstream: feature-dev-kit + html-generator-kit):

### Must be true before `status: approved`

1. Problem, goal, users, non-goals (YAML-visible)
2. Every must-story has ≥1 happy + ≥1 unhappy AC, all `testable: true` where automatable
3. Entities with fields, types, and lifecycle notes
4. Roles + permission matrix for every must action
5. API (or explicit “UI-only / local-only”) with error codes for must flows
6. Screens + interactions + 4 UI states for data views
7. NFR: performance, a11y, security at minimum
8. Assumptions listed; blocking ones confirmed or moved to open-questions with owner
9. Traceability: every must-story maps to ≥1 source file or assumption id
10. Schema validates deterministically

### Should be true for app-type specs

11. Personas / journeys (even lightweight)
12. MVP cut + phased scope
13. Bounded contexts or module boundaries
14. Glossary

### Nice for operational excellence

15. Domain events / side effects
16. Rollout / feature flag / migration
17. Observability + product analytics split
18. Run folder with intake/analysis/qa artifacts

The current schema covers ~60–70% of “must” if agents behave; permissions matrix, non-goals-in-YAML, and deterministic validation are the biggest holes.

---

## 8. Prioritized recommendations

### P0 — Consistency (do before next real `/generate-spec` run)

1. Canonicalize station map in `pipeline-flow.md`; rewrite orchestrator + all agent headers + skill to match.
2. Fix AskUserQuestion ownership (recommend: orchestrator-only).
3. Unify output path to ` .spec/app/spec-{timecode}_{slug}/spec.md` everywhere.
4. Rename/move ask-before-enriching so the name matches behavior.
5. Resolve `requires-confirmation` policy conflict.
6. Synthesizer must emit `status: reviewing` (or `draft`), not `approved`.
7. Replace `prototype-dev-kit` references with `html-generator-kit` (or whatever the real consumer name is).

### P1 — Analysis & contract completeness

8. Add YAML `non-goals`, `roles[]`, optional `permissions[]` / matrix.
9. Branch clarification + completeness weights by `type` (feature vs app).
10. Tag context files / requirements with `source-role`.
11. Persist intermediate reports under the run folder.
12. Add JSON Schema + a non-LLM validate step; keep haiku for semantic warnings.
13. Clarify `endpoints` vs `mutations` (or merge).
14. Wire feature-dev-kit / html-generator-kit to declare consumed fields + `spec-version`.

### P2 — Quality bar & operability

15. Golden-file evals: sample `.spec/context/` → expected gap categories / must-have sections.
16. Resume protocol (reload last run intermediates).
17. Optional OpenAPI stub export from `api-surface`.
18. Story quality checks (INVEST + “one actor, one capability”).
19. Shrink README to overview; delete duplicated tables once P0 is done.
20. Annotate `kit-spec/flow.md` as superseded by `rules/pipeline-flow.md`.

---

## 9. Suggested target station map (canonical)

Use this (or any single map — but only one) everywhere:

| # | Stage | Agent |
|---|-------|-------|
| 0 | Context discovery + naming | orchestrator (+ parallel intake spawn) |
| 1 | Intake | `spec-intake` |
| 2 | Analysis | `spec-analyst` |
| 2a | Clarification questions | `spec-interrogator` → orchestrator asks |
| 2b | Re-analysis | `spec-analyst` |
| 3 | Pre-enrich gate | orchestrator only (blocking gaps asked or assumed) |
| 4 | Enrichment | `spec-enricher` |
| 5 | Completeness | `spec-completeness` → maybe back to 2/2a |
| 6 | Synthesis | `spec-synthesizer` |
| 7 | Validation | `spec-validator` (+ deterministic schema tool) |
| 8 | Diagrams | `spec-diagram` |
| 9 | Review | `spec-review-facilitator` → orchestrator asks |
| 10 | Publish | `spec-publisher` |

---

## 10. Final judgment

| Question | Answer |
|----------|--------|
| Consistent structure? | **Folder yes; runtime contracts no** — station/path/AskUser/assumption conflicts |
| Unnecessary stuff? | Mild duplication; no large useless modules — **drift is the waste** |
| Follows best / trendy practices? | **Yes on HITL, hybrid spec, completeness rubric, assumption hygiene**; **no on deterministic schema, blackboard persistence, intake branching** |
| Anything missed for comprehensive specs? | **Yes** — roles/permissions structure, non-goals in YAML, source roles, feature/app forks, side effects/events, machine validation, downstream lock-in |
| Requirements analysis solid? | **Strong skeleton**; enrichment + completeness can paper over shallow answers unless assumed coverage is scored honestly |

**Recommended next move**: P0 consistency pass on orchestrator + pipeline-flow + skill + agent headers (no new agents). Then add JSON Schema + `non-goals`/`roles` before investing in more agent sophistication.

---

## Appendix A — File inventory reviewed

- `README.md`
- `skills/generate-spec/SKILL.md`
- `agents/*` (11 agents)
- `rules/*` (7 rules including `context-budget.md`)
- `templates/spec-frontmatter.yaml`, `templates/spec-body.md`
- Cross-read: `kit-spec/flow.md`, `kit-spec/critical-notes.md`, `kit-spec/spec_feature.md`

## Appendix B — Quick inconsistency checklist for implementers

- [ ] One station numbering scheme across README, pipeline-flow, context-budget, orchestrator, all agent headers, skill
- [ ] One output path pattern
- [ ] One AskUserQuestion owner
- [ ] One assumption confirmation policy
- [ ] One diagram placement (after validation)
- [ ] One downstream kit name set
- [ ] Status lifecycle respected by synthesizer vs review
- [ ] README directory tree includes `context-budget.md`
