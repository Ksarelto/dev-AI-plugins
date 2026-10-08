# Template — Build Plan

Written by the orchestrator at Station 2 into the spec's `## Build plan` section (write the table to a
file, then `board.mjs section <board> --put "Build Plan" --from <file>`). It is the execution
contract: every row becomes exactly one delegation, and every worker marks its own row done with
`board.mjs row` before returning.

```markdown
## Build plan

**Strategy**: ⟨one line — consolidated slice-engineer | one engineer per layer | parallel per slice⟩
**Base branch**: ⟨PARENT⟩   **Feature branch**: ⟨feature/IV-1423-decline-profile⟩

| # | Station | Layer | Slice | Segments | Agent | Group | Status | Note |
|---|---------|-------|-------|----------|-------|-------|--------|------|
| 1 | 3 | shared | ui | Textarea, Dialog (shadcn) | shared-engineer | — | todo | |
| 2 | 4 | entities | profile | api, model | entities-engineer | P1 | todo | |
| 3 | 4 | entities | reviewer | api, model | entities-engineer | P1 | todo | |
| 4 | 5 | features | decline-profile | model, api, ui | features-engineer | — | todo | |
| 5 | 6 | widgets | profile-review-panel | ui | composition-engineer | P2 | todo | |
| 6 | 6 | pages | profile-review | ui | composition-engineer | P2 | todo | |
| 7 | 6 | pages | settings, help, about | ui (same empty layout) | composition-engineer | B1 | todo | |
| 8 | 7 | app | — | routes, navigation | app-engineer | — | todo | |
| 9 | 8 | — | all | tests | test-engineer | — | todo | |

`Group` — rows sharing a group label run one after another on the feature branch.
An empty group means the row runs alone. `Status` — `todo` → `in-progress` → `done` | `blocked`.
`Note` — one current note per row (what was built, or why it is blocked). `board.mjs row` replaces
it; it is never a history. History lives in the row's handoff file.
`B<n>` — a **batch row**: several same-shape slices of one layer (row 7: three pages with one
layout) built by one delegation. See rule 1.

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
  `shared/lib/i18n/locales/common/en.json`? → they are NOT independent; drop the group label and sequence them.
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

1. **One row = one delegation.** If a row needs two briefings, split it into two rows. Slices of one
   layer that share one shape (the same empty-page layout, the same list/detail pattern, the same
   mechanical fix) go into **one batch row** — `Slice` lists them comma-separated, `BOUNDARY` covers
   each. Batch only when one worker can apply the same change to every slice without reading the
   others; at most ~6 slices per batch.
2. **Row order is station order.** Never reorder rows to run a higher layer first.
3. **Group only genuinely independent rows.** Shared-file overlap disqualifies a group.
4. **Sizing**: a row touching more than ~5 files of new logic is too large — split it by segment.
   A batch row may touch more files when each slice repeats the same structure.
5. **Every acceptance criterion is covered**, and the coverage table proves it.
6. **State what is not being built** — the cheapest defence against scope invention.
