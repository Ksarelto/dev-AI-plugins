# Template — Build Plan

Written by the orchestrator at Station 2 into the spec's `## Build plan` section. It is the
execution contract: every row becomes exactly one delegation, and every worker marks its own row
done before returning.

```markdown
## Build plan

**Strategy**: ⟨one line — consolidated slice-engineer | one engineer per layer | parallel per slice⟩
**Base branch**: ⟨develop⟩   **Feature branch**: ⟨feature/IV-1423-decline-profile⟩

| # | Station | Layer | Slice | Segments | Agent | Group | Status |
|---|---------|-------|-------|----------|-------|-------|--------|
| 1 | 3 | shared | ui | Textarea, Dialog (shadcn) | shared-engineer | — | todo |
| 2 | 4 | entities | profile | api, model | entities-engineer | P1 | todo |
| 3 | 4 | entities | reviewer | api, model | entities-engineer | P1 | todo |
| 4 | 5 | features | decline-profile | model, api, ui | features-engineer | — | todo |
| 5 | 6 | widgets | profile-review-panel | ui | composition-engineer | P2 | todo |
| 6 | 6 | pages | profile-review | ui | composition-engineer | P2 | todo |
| 7 | 7 | app | — | routes, navigation | app-engineer | — | todo |
| 8 | 8 | — | all | tests | test-engineer | — | todo |

`Group` — rows sharing a group label are dispatched in one message and run in parallel worktrees.
An empty group means the row runs alone. `Status` — `todo` → `in-progress` → `done` | `blocked`.

### Acceptance-criteria coverage

| Criterion | Covered by row(s) |
|-----------|-------------------|
| Reviewer can open the decline dialog from the profile header | 4, 5 |
| Reason is optional and capped at 500 characters | 4 |
| Declining invalidates the profile list and detail caches | 2, 4 |
| Declined profiles show a "Declined" badge with reason on hover | 2, 5 |

Every criterion must map to at least one row. An uncovered criterion means the plan is incomplete —
re-run discovery rather than starting the build.

### Parallel groups

- **P1** — `entities/profile` and `entities/reviewer` share no files. Both write to
  `shared/config/textContent.ts`? → they are NOT independent; drop the group label and sequence them.
- **P2** — widget and page: the page imports the widget, so P2 is invalid unless the page row runs
  after. Verify import direction before grouping.

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ⟨e.g. decline endpoint not in the API map yet⟩ | High | ⟨confirm contract at Station 1a before row 2⟩ |

### Not building

- ⟨explicitly out of scope, so no worker invents it⟩
```

---

## Rules

1. **One row = one delegation.** If a row needs two briefings, split it into two rows.
2. **Row order is station order.** Never reorder rows to run a higher layer first.
3. **Group only genuinely independent rows.** Shared-file overlap disqualifies a group.
4. **Sizing**: a row touching more than ~5 files is too large — split it by segment.
5. **Every acceptance criterion is covered**, and the coverage table proves it.
6. **State what is not being built** — the cheapest defence against scope invention.
