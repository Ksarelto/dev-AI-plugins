# Increment Protocol — feature-dev-kit

How a build engineer works **inside** its assigned slice. `pipeline-flow.md` sequences the stations;
this file governs the loop a worker runs within one station.

The rule: build in thin vertical increments, leave the slice compiling after each one, and touch
nothing outside the assigned boundary.

---

## The increment cycle

```
Implement one segment → next segment → when the slice is complete: typecheck once → colocated test
```

1. **Implement** one complete piece — a hook, a component, a segment. Stay inside `BOUNDARY`.
2. **Next segment.** Do not shell out to `yarn typecheck` between segments.
3. **Typecheck once** (`yarn typecheck`) when the assigned slice is complete.
4. **Test** — write or extend the colocated test and run that file.
5. **Stop.** Write the handoff file. Do not scan the rest of the repo.

A slice that does not compile at the end is not done. A typecheck after every hundred lines burns
the run without changing the result.

---

## Increment order inside a slice

| Order | Increment | Done when |
|-------|-----------|-----------|
| 1 | `model/` types + schema | Types compile; no `any` |
| 2 | `api/` hooks (entities) or mutations (features) | Query keys defined, invalidation listed |
| 3 | `lib/` pure helpers | Unit-tested without rendering |
| 4 | `ui/` component — happy path | Renders with mock props |
| 5 | `ui/` — loading, empty, error states | Each state has a test |
| 6 | `index.ts` public API | Exports only what consumers need |

Segments below a segment must exist before it is written; that is the same dependency rule as the
layer order, one level down.

---

## Rule 0 — Simplicity first

Before writing, ask: what is the simplest thing that could work? After writing, check:

- Can this be fewer lines?
- Is each abstraction earning its complexity?
- Am I building for a hypothetical requirement, or for the acceptance criteria in front of me?

```
✗ Generic <DataTable> config engine for one list       ✓ One list component
✗ Abstract form factory for two forms                  ✓ Two form components
✗ Custom hook wrapping a single useState               ✓ useState
```

Three similar lines beat a premature abstraction. Abstract on the third real use case, not the first
imagined one.

---

## Rule 1 — Scope discipline

Touch only what the delegation's `BOUNDARY` allows. Do **not**:

- "Clean up" adjacent code, imports, or formatting in files you are only reading
- Modernize syntax in files outside the slice
- Remove comments you do not fully understand
- Add props, variants, or endpoints that are not in the spec because they "seem useful"

Note improvements instead of making them — write them to the spec's `## Decisions & Open Questions`:

```
NOTICED, NOT TOUCHING:
- shared/lib/date.ts duplicates formatDate from entities/profile/lib (separate task)
- widgets/ProfileHeader has no test (outside this slice's boundary)
```

Out-of-scope edits are the most common cause of a red `layer-green` gate in a slice that was
otherwise finished.

---

## Rule 2 — Keep it compiling

The slice must typecheck when you finish it. Never leave a half-renamed symbol or a component
importing a hook that does not exist yet.

---

## Rule 3 — Rollback-friendly

Prefer additive changes. When modifying an existing shared component, keep the change minimal and
backward compatible; if the public API must change, update every call site in the same increment
rather than leaving the tree broken.

---

## Per-increment checklist

- [ ] The slice does one thing and does it completely
- [ ] `yarn typecheck` was run once at the end and passed
- [ ] The new code has a colocated test that fails without it
- [ ] No file outside the assigned `BOUNDARY` was modified
- [ ] The handoff file lists the paths touched

Do not re-run a check that the slice did not change.

---

## Red flags

- `yarn typecheck` between every segment instead of once at the end of the slice
- Two unrelated concerns landing in one increment
- "Let me just quickly also…" scope expansion
- The slice left non-compiling between increments
- A new utility file created for a one-time operation
- Building an abstraction before the third use case demands it
