# Completeness Checklist — 10 Categories

**Used by**: `spec-completeness` (gate), `spec-analyst` (gap detection), `spec-interrogator` (targeted questions)

---

## Why These 10 Categories

Research on software defects (see: `kit-spec/spec_feature.md`) shows these categories are **consistently missing** from initial requirements, causing the most expensive downstream rework.

Each category has a weight. Total possible score: 100. Threshold for spec approval: **≥ 85**.

---

## Category Scoring

| # | Category | Weight | Gate Question |
|---|----------|--------|---------------|
| 1 | Error States | 15 | Are failure scenarios defined for every user action? |
| 2 | Permissions & Roles | 15 | Is it clear who can see/do what, and who cannot? |
| 3 | Edge Cases | 12 | Are boundary conditions and corner cases addressed? |
| 4 | Non-Functional Requirements | 12 | Are perf, security, and a11y constraints specified? |
| 5 | Backward Compatibility | 8 | Does this change break existing behavior for current users? |
| 6 | Undo / Rollback | 8 | Can destructive actions be reversed? Is confirmation required? |
| 7 | Notifications | 8 | What feedback does the user receive after each action? |
| 8 | Data Lifecycle | 8 | How is data created, updated, archived, and deleted? |
| 9 | Observability | 7 | What must be logged, monitored, or alerted on? |
| 10 | Localization & Accessibility | 7 | Are i18n and a11y requirements stated? |

---

## Category Definitions and Scoring Rules

### 1. Error States (15 pts)

**Full credit** (15): Every user-initiated action has a defined failure scenario with a specific error message or recovery path.

**Partial credit** (8): Some actions have error states but critical ones (e.g., form submission) are missing.

**No credit** (0): Only happy path described.

**Check for**:
- Network failure during form submit
- Invalid input that passes client-side validation but fails server-side
- Concurrent modification (two users editing the same record)
- Permission denied response
- Timeout / server unavailable
- Empty results vs. error (different states)

---

### 2. Permissions & Roles (15 pts)

**Full credit** (15): Every screen, action, and data field specifies who can access/modify it, including what happens when an unauthorized user attempts access.

**Partial credit** (8): High-level roles defined but field-level or action-level permissions missing.

**No credit** (0): No roles or auth model mentioned.

**Check for**:
- At minimum 2 roles defined (or "single role" explicitly stated)
- Each user story specifies the actor role
- Unauthorized access behavior (redirect, 403, hidden UI element)
- Data visibility rules (can user A see user B's data?)
- Admin vs. standard user distinctions

---

### 3. Edge Cases (12 pts)

**Full credit** (12): Boundary conditions for all data inputs and state transitions are specified.

**Partial credit** (6): Some boundaries mentioned; critical inputs (lists, dates, numeric ranges) missing.

**No credit** (0): No edge cases mentioned.

**Check for**:
- Empty list / zero results
- Maximum list size / pagination behavior
- Extremely long strings (truncation? tooltip? error?)
- Date/time boundaries (timezone, DST, leap year)
- Concurrent edits / race conditions
- Offline / degraded network behavior
- Browser back button / refresh during multi-step flow

---

### 4. Non-Functional Requirements (12 pts)

**Full credit** (12): Performance, security, and accessibility each have at least one measurable constraint.

**Partial credit** (6): One or two of the three covered.

**No credit** (0): None mentioned.

**Check for**:
- Performance: specific p95 latency or load time target
- Security: auth method, data encryption in transit/at rest, input sanitization
- Accessibility: WCAG level, keyboard navigation, screen reader support
- Bonus: scalability (concurrent users), browser support matrix

---

### 5. Backward Compatibility (8 pts)

**Full credit** (8): Impact on existing users/data explicitly assessed. Migration path defined if breaking.

**Partial credit** (4): "No breaking changes" asserted but not verified against existing features.

**No credit** (0): Existing users/data not mentioned.

**Check for**:
- Does this change existing API endpoints or response shapes?
- Does this change existing UI flows current users rely on?
- Does this require a data migration?
- Is a feature flag needed to roll out safely?

---

### 6. Undo / Rollback (8 pts)

**Full credit** (8): Destructive actions have confirmation dialogs and/or undo capability defined.

**Partial credit** (4): Confirmation mentioned but no undo.

**No credit** (0): Destructive actions (delete, archive, status change) with no safeguard.

**Check for**:
- Delete: soft delete or hard delete? Can it be undone?
- Bulk operations: confirmation required? undo window?
- Status changes: reversible? Who can reverse?
- Confirmation dialog copy specified (not just "are you sure?")

---

### 7. Notifications (8 pts)

**Full credit** (8): Every user-initiated action has a corresponding success AND failure notification/feedback defined.

**Partial credit** (4): Success states covered but failure feedback missing (or vice versa).

**No credit** (0): No feedback model mentioned.

**Check for**:
- Toast/notification on successful create, update, delete
- Error notification on failure (specific message vs. generic)
- In-progress state (spinner? disabled button? optimistic update?)
- System-initiated notifications (email, push) if applicable
- Notification persistence (auto-dismiss? duration?)

---

### 8. Data Lifecycle (8 pts)

**Full credit** (8): Create, read, update, delete (and archive if applicable) operations defined for every core entity.

**Partial credit** (4): CRUD partially covered; archival/retention not addressed.

**No credit** (0): Data model mentioned but lifecycle not addressed.

**Check for**:
- Who creates each entity?
- Can records be updated? By whom? All fields or subset?
- Soft delete vs. hard delete? Retention period?
- Archival policy (can archived records be restored?)
- Data ownership (who owns a record when its creator is deleted?)

---

### 9. Observability (7 pts)

**Full credit** (7): Key business events are identified as loggable, with log fields specified.

**Partial credit** (4): "Log this action" mentioned but fields/structure not defined.

**No credit** (0): No logging or monitoring requirements.

**Check for**:
- Which user actions must be auditable (who did what, when)?
- What error conditions must trigger an alert?
- Are there metrics that product/ops teams need? (e.g., conversion rate)
- What goes in the audit trail? (userId, timestamp, previous value, new value)

---

### 10. Localization & Accessibility (7 pts)

**Full credit** (7): Both i18n and a11y requirements are stated, even if minimal.

**Partial credit** (4): One of the two mentioned.

**No credit** (0): Neither mentioned.

**Check for**:
- Is multi-language support needed? If not, explicitly state "English only".
- Date/number/currency formatting requirements
- Right-to-left (RTL) layout support needed?
- WCAG level stated (AA is standard minimum)
- Keyboard-only navigation required for all interactive elements?
- Screen reader support required?

---

## Scoring Algorithm

```
score = sum(category_points_awarded)

for each category:
  if full_credit: add full weight
  if partial_credit: add half weight (rounded down)
  if no_credit: add 0

threshold = 85
gate_passes = score >= threshold
missing_categories = [c for c in categories if c.score == 0]
partial_categories = [c for c in categories if c.score == partial]
```

---

## Output Format

`spec-completeness` returns:

```json
{
  "completeness_score": 72,
  "gate_passes": false,
  "missing_categories": [
    {
      "category": "Error States",
      "weight": 15,
      "gap_description": "No failure scenarios defined for form submission or network errors.",
      "example_question": "What should happen if profile creation fails on the server?"
    }
  ],
  "partial_categories": [
    {
      "category": "Permissions & Roles",
      "weight": 15,
      "awarded": 8,
      "gap_description": "Admin/user roles defined but unauthorized access behavior not specified.",
      "example_question": "What happens when a standard user tries to access an admin-only screen?"
    }
  ]
}
```
