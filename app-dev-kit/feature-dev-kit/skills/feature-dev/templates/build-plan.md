# Template — Build Plan

Written by the orchestrator at Station 2 into the spec's `## Build plan` section (write the table to a
file, then `board.mjs section <board> --put "Build Plan" --from <file>`). It is the execution
contract: every row becomes exactly one delegation, and every worker marks its own row done with
`board.mjs row` before returning.

```markdown
**Strategy**: ⟨one line — consolidated slice-engineer | one engineer per layer⟩
**Base branch**: ⟨PARENT⟩   **Feature branch**: ⟨feature/IV-1423-decline-profile⟩

| # | Station | Layer | Slice | Segments | Agent | Group | Status | Note |
|---|---------|-------|-------|----------|-------|-------|--------|------|
| 1 | 3 | shared | ui, api/query-keys | Textarea, Dialog (shadcn), profile keys | shared-engineer | — | todo | |
| 2 | 4 | entities | profile | api, model | entities-engineer | P1 | todo | |
| 3 | 4 | entities | reviewer | api, model | entities-engineer | P1 | todo | |
| 4 | 5 | features | decline-profile | models, hooks, api, ui | slice-engineer | — | todo | |
| 5 | 6 | pages | profile-review | ui | composition-engineer | — | todo | |
| 6 | 6 | pages | settings, help, about | ui (same empty layout) | composition-engineer | B1 | todo | |
| 7 | 7 | app | — | routes, navigation | app-engineer | — | todo | |

`Group` — rows sharing a group label run one after another on the feature branch.
An empty group means the row runs alone. `Status` — `todo` → `in-progress` → `done` | `blocked`.
`Note` — one current note per row (what was built, or why it is blocked). `board.mjs row` replaces
it; it is never a history. History lives in the row's handoff file.
`B<n>` — a **batch row**: several same-shape slices of one layer (row 6: three pages with one
layout) built by one delegation. See rule 1.
`Agent` — one slice in `entities`, `features`, `widgets`, or `pages` → `slice-engineer`; two or more
slices in one layer → that layer's specialist. `shared` is always `shared-engineer` (it alone installs
packages) and `app` is always `app-engineer`.

### Acceptance-criteria coverage

| Criterion | Covered by row(s) |
|-----------|-------------------|
| AC-001 Reviewer can open the decline dialog from the profile header | 4, 5 |
| AC-002 Reason is optional and capped at 500 characters | 4 |
| AC-003 Declining invalidates the profile list and detail caches | 2, 4 |
| AC-004 Declined profiles show a "Declined" badge with reason on hover | 2, 5 |

Every criterion must map to at least one row. An uncovered criterion means the plan is incomplete —
re-run discovery rather than starting the build.

### Groups

Rows still run one at a time (`pipeline-flow.md` § Parallelism Rules); a group only marks rows that share no files.

- **P1** — `entities/profile` and `entities/reviewer` share no files. Both write to
  `shared/lib/i18n/locales/common/en.json`? → they are NOT independent; drop the group label.
- **P2** — do not group a page with a widget it imports. Plan `widgets/` only when a second route
  already reuses the same composition; otherwise the page mounts the features directly.

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| ⟨e.g. decline endpoint not in the API map yet⟩ | High | ⟨confirm contract at Station 1a before row 2⟩ |

### Not building

- ⟨explicitly out of scope, so no worker invents it⟩
```

---

## Rules

`board.mjs section --put "Build Plan"` refuses a plan that breaks rule 4, 7, 8, or 10 and prints
`REFUSED: Build Plan rule N — …`. Every extra row is a worker cold start.

1. **One row = one delegation.** If a row needs two briefings, split it into two rows. Slices of one
   layer that share one shape (the same empty-page layout, the same list/detail pattern, the same
   mechanical fix) go into **one batch row** — `Slice` lists them comma-separated, `BOUNDARY` covers
   each. Batch only when one worker can apply the same change to every slice without reading the
   others; at most ~6 slices per batch.
2. **Row order is station order.** Never reorder rows to run a higher layer first.
3. **Group only genuinely independent rows.** Shared-file overlap disqualifies a group.
4. **Sizing: one slice is one row.** A slice is built in one row, in segment order (`ui-build-contract.md` § Inside the slice). Split it only when it adds more than ~12 files of new logic, and then into exactly two rows: the non-UI segments (`models`, `api`, `hooks`, `lib`), then `ui` + `locales`. Never one row per segment — every row is a cold start that re-reads the contract, the card, and the slice.
   A batch row may touch more files when each slice repeats the same structure.
5. **Every acceptance criterion is covered**, and the coverage table proves it. Name criteria by id (`AC-088`) in the table — `board.mjs card` gives each row only the criteria mapped to it.
6. **State what is not being built** — the cheapest defence against scope invention.
7. **Theme row only on drift.** When front matter `prototype-ref` is set and not `none`, run `port-prototype-theme.mjs --check --prototype <prototype-ref> --globals src/shared/ui/theme/globals.css` before writing the plan. Exit 0 → no theme work; write `Theme: in sync` in the preamble. Exit 1 → the port is part of the shared batch row (rule 8). Note the prototype path.
8. **Small shared work is one batch row.** Every shadcn primitive this feature still needs (installed with one `shadcn add a b c` call, then each re-homed), the theme port when rule 7 found drift, and `shared/api/query-keys` changes go in one `shared` row. A hand-written `shared/ui` component (one the registry has no fit for) gets its own row, with `hand-written` in its Note. Do not plan one row per primitive.
9. **Widgets are earned.** A `widgets/` row exists only when a second route reuses the same composition. One page mounts its features directly.
10. **No empty rows.** A layer whose existing slices need no file change gets no row. "Already mounted", "do not scaffold a second page", and "confirm the route test" are preamble notes, not delegations — the layer gates and Station 9 still run over that code. Prototype-inventory rows are filled by the row that writes the file rendering them.
