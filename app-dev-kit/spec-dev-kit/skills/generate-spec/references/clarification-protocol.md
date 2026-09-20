# Clarification Protocol — Questioning Strategy

**Used by**: `spec-interrogator` (question packets), `spec-orchestrator` (loop control),
`generate-spec` skill (the only caller of `AskUserQuestion`)

---

## Core Principle

Questions are a **cost on the user**. Every clarification round reduces momentum. The interrogator's job is to ask the **minimum number of high-value questions** that unlock the maximum spec completeness gain.

---

## Elicitation Technique — attach a guess, track confidence

*(Adapted from the `interview-me` method. Reconciled with this kit's batching model below.)*

Two habits sharpen every question and keep the pipeline honest:

1. **Attach your best guess to each question.** For every question, the interrogator records the
   answer it *expects* and the reasoning behind it. A user reacts to a wrong guess far faster than
   they generate an answer from scratch, and a stated guess exposes the assumption the question is
   meant to test. In `AskUserQuestion` terms: the guess becomes the **first option**, labelled
   `(Recommended)`, with the reasoning in its `description`. For open questions, state the guess in
   the question text ("I'm assuming X because Y — correct?").

2. **Carry a confidence number for the whole spec.** The analyst's `gap_score` already measures this
   numerically; state it in prose too when escalating ("~60% confident on the data model — the
   entity relationships are still unresolved"). When confidence is low, name *what* is missing so the
   user can close the gap directly. This is the same signal `gap_score ≤ 25` gates on — keep the
   narrative and the number aligned.

**Reconciliation with batching (important):** `interview-me` asks strictly one question at a time so
the user can react to each guess. This pipeline instead **batches 3–7 questions per round** — a
deliberate trade to cut round-trips on a longer, structured elicitation. We keep the guess-attachment
and confidence tracking, but adapt them to a batch: each batched question still carries its own
recommended-first option. Do **not** "fix" this back to one-at-a-time; the batch is intentional (see
`pipeline-flow.md`). The one exception is Station 9 review confirmation, which is a single question.

---

## Want vs. Should-Want Probe

The most dangerous answers are the ones where the user says what a thoughtful answer *sounds like*
rather than what they actually want. Watch for:

- Best-practice / buzzword answers with no specifics ("make it scalable", "clean", "modern").
- Deference to convention ("the way most apps do it", "the standard approach").
- Hedges: "I should probably…", "I think I'm supposed to…", "good practice says…".

When you hear these, the analyst tags the requirement `sophistication_signal: true` and the
interrogator asks the unmasking question:

> *"If you didn't have to justify this to anyone, what would you actually want here?"*

That single probe frequently does more than five scoped questions. Record both the surface answer and
the unmasked one in the Q&A log — the difference is often a real design decision.

---

## Assumption Tiering — Must / Should / Might be true

*(Adapted from `idea-refine`'s assumption audit; this is the single source of truth for the
`requires-confirmation` policy and supersedes any per-agent rule.)*

Every gap the enricher fills becomes an `assumptions[]` entry. Tier it by how much damage a wrong
assumption does, and map that tier onto `requires-confirmation`:

| Tier | Meaning | `confidence` | `requires-confirmation` | Review treatment |
|------|---------|--------------|-------------------------|------------------|
| **Must be true** (dealbreaker) | If wrong, the feature is wrong — security model, core data shape, who-can-do-what | low/medium | `true` **and** mirror into `open-questions[]` | **blocks** approval until answered or explicitly deferred |
| **Should be true** (important) | Wrong → rework but not fatal — pagination size, sort order, non-standard NFR target | medium | `true` | confirm by review cycle 2 |
| **Might be true** (nice-to-have) | Standard pattern with negligible downstream cost — skeleton loader, WCAG 2.2 AA, retry-on-error toast | high | `false` | listed in the review summary, non-blocking |

This resolves the old conflict where the protocol demanded `requires-confirmation: true` for *all*
defaults while the enricher set high-confidence defaults to `false`. The rule now: **high-confidence
standard patterns → `false`; anything that could be a dealbreaker → `true` + open-question.**

---

## Question Budget

| Round | Max Questions | Focus |
|-------|--------------|-------|
| 1 | 5–7 | Highest-impact gaps + hard conflicts |
| 2 | 3–5 | Remaining critical gaps from round 1 answers |
| 3 | 2–3 | Only blocking unknowns (anything else → assumption) |

**Never ask more than 7 questions in a single round.** Batching all questions into one `AskUserQuestion` call is mandatory — never send one question at a time.

---

## Question Classification

Before generating questions, classify each gap by type:

| Type | Example Gap | Question Strategy |
|------|-------------|-------------------|
| **Goal ambiguity** | "improve the workflow" — which workflow? | Root-goal probing |
| **Actor ambiguity** | "user" — which role? admin or end-user? | Role clarification |
| **Scope ambiguity** | "all profiles" — filtered? paginated? | Boundary probing |
| **Data model gap** | Entity mentioned but structure unknown | Propose + confirm |
| **Hard conflict** | Two contradictory requirements | Present both, ask to resolve |
| **Non-functional omission** | No perf/security mentioned | Propose defaults, ask to confirm |
| **Error/edge case gap** | Happy path described but failures unknown | "What happens when X fails?" |

---

## Question Formats

### Root-Goal Probe (for ambiguous goals)
> "What specific problem are you trying to solve with [feature]? What does success look like for a user 6 months after launch?"

### Propose + Confirm (for data model / non-functional gaps)
> "I'm assuming [X]. Does that sound right, or should it be [Y] or [Z]?"
>
> This format is preferred for gaps that have obvious defaults — it's faster for users than open-ended questions.

### Conflict Resolution (for contradictions between files)
> "I found two conflicting requirements:
> - File A says: '[statement A]'
> - File B says: '[statement B]'
>
> Which should take priority, or is there a way both can be true?"

### Boundary Probe (for scope ambiguity)
> "Should [feature] apply to all [entities], or only [specific subset]? Any exceptions?"

### Error/Edge Case Probe
> "What should happen if [happy path assumption] fails? For example, what if [specific scenario]?"

---

## Question Priority Ranking

Rank all candidate questions before selecting the batch. Send highest-priority first.

1. **Hard conflicts** — must resolve, blocks synthesis
2. **Missing acceptance criteria for must-priority stories** — blocks testability
3. **Missing entity definitions for core domain** — blocks API surface
4. **Missing auth/permissions model** — security gap
5. **Non-functional requirements (perf/a11y/security)** — can use defaults but must confirm
6. **Edge cases and error states** — can assume but must flag
7. **Nice-to-have scope questions** — lowest priority, often deferred to assumptions

---

## When to Use Propose + Confirm vs. Open Question

| Situation | Use |
|-----------|-----|
| Standard/common pattern exists | **Propose + Confirm** — "I'll assume [X]. Correct?" |
| Gap is entirely unique to domain | **Open Question** — "What should happen when [X]?" |
| User has technical background | **Propose + Confirm** with technical detail |
| User is non-technical | **Open Question** with simple language |

---

## Assumption Trigger (No Question Needed)

These gaps **do not require questions** — `spec-enricher` fills them as assumptions:

| Gap | Default Assumption |
|-----|-------------------|
| No auth mentioned | Bearer token required, standard OIDC |
| No perf SLA mentioned | "List loads < 500ms at p95" |
| No a11y standard mentioned | WCAG 2.2 AA |
| No error state described | Standard error message + retry action |
| No empty state described | Empty state with icon + CTA |
| No loading state described | Skeleton loader |
| No pagination strategy | Paginated, 20 items per page |
| No sort order | Default: created_at descending |

All defaults are logged in `assumptions[]`, tiered per **Assumption Tiering** above — high-confidence
standard patterns (the table below) are `requires-confirmation: false`; anything dealbreaking is
`true` and mirrored into `open-questions[]`.

---

## Analyzing Answers

After user answers are received:

1. Map each answer to its corresponding gap in the analysis report.
2. Update `gap_score`: subtract resolved gap weight from total.
3. Mark resolved conflicts as `resolved` in `conflicts[]`.
4. Extract new requirements from answers (user often reveals additional scope).
5. Check if answers introduced new gaps (e.g., user says "and it should also integrate with X").
6. Re-run gap detection on the updated requirement set.
7. Report updated `gap_score` and remaining `gaps[]` to orchestrator.

**Critical rule**: If a user answer introduces new scope, add it to requirements but **do not re-open** closed clarification rounds. New scope is fair game for completeness check but not for re-triggering the clarification loop.

---

## Anti-Patterns

| ❌ Avoid | ✅ Instead |
|----------|-----------|
| One question per turn | Batch 3–7 questions in one `AskUserQuestion` |
| "What are your requirements?" | Ask targeted, specific questions |
| Asking about low-priority gaps first | Prioritize conflicts and blocking gaps |
| Asking the same question twice | Mark as assumption after first miss |
| Technical jargon with non-technical users | Plain language, no acronyms |
| Open questions for well-known patterns | Propose + Confirm for standard cases |
| Asking beyond the stated gap list | Stay focused — do not expand scope |

---

## Restate & Confirm (Station 9 review gate)

*(Adapted from `interview-me`'s restate step. Used by `spec-review-facilitator` + orchestrator.)*

Before finalizing, the review packet restates the captured intent tightly so the user can confirm or
correct line by line — in their own language where possible:

```
- Outcome:      <one line — what the spec delivers>
- Users:        <one line — who benefits>
- Why now:      <one line — what changed / the urgency>
- Success:      <one line — how we know it worked (measurable)>
- Constraint:   <one line — the binding limit>
- Out of scope: <one line — what we are explicitly NOT building>
```

The **Out of scope** line is non-negotiable — silent disagreement about non-goals is half of
misalignment. It maps directly to `context.non-goals[]` in the schema.

**The gate is an explicit "yes."** These are **not** approval and must be re-confirmed:

- *"Whatever you think is best."* → delegation, not a decision. Re-ask with two concrete options.
- *"Sounds good." / "Sure, let's go."* → ambiguous or a polite exit. Ask "Anything you'd refine?"
- Silence → not consent.

Loop the restate until the user gives an explicit yes.
