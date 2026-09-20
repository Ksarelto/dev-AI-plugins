# Increment Protocol — feature-dev-kit

How a build engineer works **inside** its assigned slice. `pipeline-flow.md` sequences the stations;
this file governs the loop a worker runs within one station.

The rule: build in thin vertical increments, leave the slice compiling after each one, and touch
nothing outside the assigned boundary.

---

## The increment cycle

```
Implement smallest complete piece → typecheck → test → verify → next increment
        ▲                                                  │
        └────────── never more than ~100 lines ────────────┘
```

1. **Implement** one complete piece — a hook, a component, a segment.
2. **Typecheck** (`yarn typecheck`) — the cheapest signal, run it first.
3. **Test** — write or extend the colocated test; run it.
4. **Verify** — the piece does what the acceptance criterion says, at runtime.
5. **Next increment.** Carry forward; do not restart.

Do not write the whole slice, then typecheck once at the end. A type error in the first segment
makes every later segment wrong in the same way, and you will be debugging five files instead of one.

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

The slice must typecheck and build after every increment. Never leave a half-renamed symbol or a
component importing a hook that does not exist yet across an increment boundary — an engineer
running in a parallel worktree may pull your state.

---

## Rule 3 — Rollback-friendly

Prefer additive changes. When modifying an existing shared component, keep the change minimal and
backward compatible; if the public API must change, update every call site in the same increment
rather than leaving the tree broken.

---

## Per-increment checklist

- [ ] The increment does one thing and does it completely
- [ ] `yarn typecheck` passes
- [ ] The new code has a colocated test that fails without it
- [ ] Existing tests still pass
- [ ] No file outside the assigned `BOUNDARY` was modified
- [ ] The spec section owned by this worker reflects what was built

Run each command after a change that could affect it. Re-running an unchanged check adds no
information and burns the run's budget.

---

## Red flags

- More than ~100 lines written before the first typecheck
- Two unrelated concerns landing in one increment
- "Let me just quickly also…" scope expansion
- The slice left non-compiling between increments
- A new utility file created for a one-time operation
- Building an abstraction before the third use case demands it
