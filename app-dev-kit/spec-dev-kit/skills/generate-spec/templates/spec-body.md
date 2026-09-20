# Spec Body Template (Markdown)
# Used by: spec-synthesizer — append this below the YAML front matter
# Replace ALL {{PLACEHOLDER}} values. Do not leave any placeholder in the final output.

---

# {{Human-Readable Feature Title}}

## Problem Context

{{2–4 paragraphs. Describe:
- What the current situation is and why it is problematic
- Who is affected and how
- What happens today without this feature (the workaround, if any)
- Why solving this now matters (urgency, impact)

Be concrete and specific. Avoid generic statements like "this will improve the user experience".}}

---

## Solution Overview

{{1–2 paragraphs. Describe what this feature/app does at a high level:
- What the user can now do that they could not do before
- The key flow(s) from user perspective
- What systems are involved
- What it does NOT do (high-level out-of-scope)

This is business-level description, not implementation detail.}}

---

## User Flows

{{For each major user story (US-001, US-002, ...), write a numbered step-by-step flow.}}

### Flow 1: {{User Story Title from US-001}}

**Actor**: {{user role}}
**Precondition**: {{starting state}}

**Happy Path**:
1. {{Step 1: what user does}}
2. {{Step 2: what system responds}}
3. {{Step 3: next user action}}
4. {{...}}
5. {{Final step: success state}}

**Error Path — {{Error Scenario Name}}**:
1. {{Steps up to the point of failure}}
2. {{System detects error condition}}
3. {{System presents error message: "{{exact error message text}}"}}
4. {{User can: {{recovery options}}}}

### Flow 2: {{User Story Title from US-002}}

{{Same structure}}

---

## Design Rationale

{{Key decisions made during spec clarification. For each decision:
- What the question was
- What alternatives were considered  
- What was decided and why

Only include decisions where the rationale is non-obvious or there were meaningful trade-offs.}}

### {{Decision Topic 1}}

{{Explanation of the decision and reasoning.}}

### {{Decision Topic 2}}

{{Explanation.}}

---

## Out of Scope

The following are explicitly excluded from this spec. They may be addressed in future specs.
Each item here MUST also appear in the `context.non-goals[]` YAML field (the machine-visible form).

- **{{Excluded Item 1}}**: {{Brief explanation of why it's excluded or when it might be addressed.}}
- **{{Excluded Item 2}}**: {{Explanation.}}
- **{{Excluded Item 3}}**: {{Explanation.}}

---

## Boundaries

Guardrails for the build phase — a three-tier contract (borrowed from spec-driven-development).
Keep each list short and concrete; these are read by downstream build agents.

**Always do**
- {{e.g. Validate inputs at the API boundary; follow existing naming conventions}}

**Ask first**
- {{e.g. Schema/migration changes; adding a new dependency; changing shared components}}

**Never do**
- {{e.g. Commit secrets; remove existing tests to pass CI; bypass the auth guard}}

---

## Assumptions & Open Questions

### Key Assumptions

The following gaps in the stated requirements were filled with standard defaults or inferred from context. Items marked ⚠️ require human confirmation before build.

{{For each assumption with requires-confirmation: true:}}
- ⚠️ **ASSM-{{N}}**: {{Assumption description}}. *Confidence: {{low|medium|high}}.*

{{For each assumption with requires-confirmation: false:}}
- ✓ **ASSM-{{N}}**: {{Assumption description}}.

### Open Questions

These items remain unresolved and should be answered before or during the build phase:

{{For each open question:}}
- **Q-{{N}}**: {{Question text}}
  - *Raised by*: {{analyst|enricher|user}}
  - *Impact if unresolved*: {{What breaks or is blocked if this stays open}}

---

## Acceptance Criteria Coverage Map

Quick reference: which user stories are covered by which acceptance criteria.

| Story | Criteria | Testable |
|-------|----------|---------|
| US-001 | AC-001, AC-002 | ✓ |
| US-002 | AC-003 | ✓ |

{{Fill in all story/criteria mappings}}

---

## API Endpoints Summary

Quick reference for the build team.

| ID | Method | Path | Auth | Purpose |
|----|--------|------|------|---------|
| API-001 | GET | /v1/{{resource}} | ✓ | {{Description}} |
| API-002 | POST | /v1/{{resource}} | ✓ | {{Description}} |

---

## Data Model

Quick reference for the build and prototype teams. One row per field; mark the status enum values.

### {{EntityName}}

{{One-line description of the entity.}}

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string | ✓ | Unique identifier |
| {{fieldName}} | {{type}} | ✓ | {{description}} |
| status | {{EntityName}}Status | ✓ | One of: {{VALUE_A, VALUE_B, VALUE_C}} |

{{Repeat one subsection per entity.}}

---

## Screen Inventory

| ID | Title | Route | Page Type | Primary Entity | Key Components | States |
|----|-------|-------|-----------|----------------|----------------|--------|
| SCR-001 | {{Title}} | {{/route}} | {{list\|detail\|form\|dashboard\|settings}} | {{Entity}} | {{ProfilesTable, StatusFilterDropdown, CreateProfileModal}} | loading, empty, error, success |

---

## Schema History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | {{YYYY-MM-DD}} | Initial spec |
