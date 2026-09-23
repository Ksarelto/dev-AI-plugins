# Feature Spec Format (blackboard schema)

Every feature developed through this kit has a spec file at `.spec/features/<feature-slug>.md`. This file is the single source of truth and the human-review artifact. It is checked in.

One file = **one feature** with its nested screen-tasks (or a standalone request). See `upstream-contract.md`.

---

## Status Lifecycle

| Status | Meaning | Transition trigger |
|--------|---------|-------------------|
| `draft` | Initial intake, requirements not yet confirmed | Skill + spec-analyst create the file |
| `awaiting-clarification` | Open questions sent to human; blocking | CLARIFY_PACKET returned |
| `investigating` | Station 1a active — researching capability/deps | Investigation engineer working |
| `awaiting-dep-approval` | New packages proposed; blocked on human | Station 1b hard stop (DEP_PACKET) |
| `approved` | Requirements confirmed, no blocking dep issues | **Skill** (human) at Station 0.5 — never a subagent |
| `building` | Build stations 3–7 active | Plan written, build started |
| `review` | Quality gates + auto-review running | Station 9–10 active |
| `awaiting-human` | Station 12 packet emitted; waiting for human | All gates green |
| `changes-requested` | Human requested fixes | Human decision at station 12 |
| `done` | Human approved, ready for `/create-pr` | **Skill** (human) at station 12 |

---

## Front matter

```yaml
slug: kebab-case
status: draft
created: YYYY-MM-DD
ticket: TBD
branch: feature/<slug>
upstream-spec: .spec/app/spec-{tc}_{slug}/spec.md  # or none
feature-id: F-001                                  # or none
task-id: T-001,T-002                               # comma-separated, or none
screen-ref: SCR-001,SCR-002                        # comma-separated, or none
prototype-ref: .spec/prototype/{tc}_{slug}/        # or none
```

---

## Section Schema

| Section | Owner | Purpose | Format hint |
|---------|-------|---------|-------------|
| `## Request` | spec-analyst | Raw feature request; verbatim or lightly cleaned | Free prose |
| `## Clarifications` | skill + Human | Q&A pairs that resolved ambiguity | `**Q**: ... **A**: ...` pairs |
| `## Acceptance Criteria` | spec-analyst (post-clarify) | Testable, numbered list of done conditions | Numbered list |
| `## FSD Impact` | code-explorer | New/modified slices and segments | Table: slice, layer, segments, change type |
| `## API Contract / Data Model` | spec-analyst (stub) then code-explorer | Endpoint shapes, types, query keys — this task only | TypeScript interface blocks or table |
| `## UI Surface` | spec-analyst (stub) then code-explorer | **One** screen: id, title, route, states, prototype-page | Bullet list |
| `## Architecture Baseline` | Station 1.5 architecture-auditor | REPORT_ONLY findings on existing `src/` | Hard / judgment / skipped |
| `## Reuse Map` | code-explorer | Existing slices/components that can be reused | Table: item → source location |
| `## Tech Investigation` | research-analyst | Findings from context7/web research | Free prose + links |
| `## Dependencies` | research-analyst | Proposed new packages with proposal table | See investigation-protocol.md |
| `## Build Plan` | Orchestrator (station 2) | Station-by-station task list with assigned slices | Numbered steps with checkboxes |
| `## Gate Log` | quality-gate-runner | Result of each quality gate run | Table: gate, result, notes |
| `## Human Review` | Orchestrator (end of 11) | Review packet emitted to human | See packets.md + review-packet.md |
| `## Decisions & Open Questions` | Any agent | Architectural decisions made; unresolved items | Bullet list with owner |

---

## Handoff Rule

A worker agent MUST update its owned section(s) before returning control to the orchestrator. Returning without writing to the spec is a protocol violation. The orchestrator will re-delegate if the section is missing.

The orchestrator may write **only** this blackboard file (Build Plan, status, Human Review). It never writes `src/`.

---

## Why a File, Not Conversation State

- The spec survives context resets and session boundaries.
- It is the input to the station-12 human packet.
- It can be used as the PR body source.
- Multiple worker agents can read it in parallel without coordination overhead.
