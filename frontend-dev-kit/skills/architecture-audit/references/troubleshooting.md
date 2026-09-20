# Troubleshooting

Residual bottleneck smells from the architecture playbook. Do not restate hits already filed under a named topic. File here only when the pattern is present and no earlier topic captured it.

## Evaluate

**Judgment — bottlenecks**

- God-slice: ~200-file feature, merge conflicts, two unrelated export groups (see lifecycle split signals).
- Anemic `models/`: real business rules live only in `hooks/` (`await`s are fine there; predicates, thresholds, step machines are not).
- Provider pyramid in `app/`: unstable context values; feature providers that should sit in the feature subtree.
- Context/store over-subscription: one fat context; Zustand selector returning a fresh array every call (no `useShallow`).
- `shared/` dumping ground: `shared/utils.ts` with dozens of exports; a helper that names a business concept.
- `entities/` as a second dumping ground: cross-model policies piled into the shared kernel.
- Query-key namespace collisions: two registry files whose factory root is the same array. A unit test asserting unique roots is the mitigation.
- Registry as a shared-edit hotspot: no owner comment / CODEOWNERS on a domain file.
- Orchestration hook grown into a monolith: 80-line `mutationFn` of mixed `await`s and rules. Extract rules to `models/`; if it has a rollback branch, that is a missing backend command — do **not** let `models/` import `api/`.
- N+1 queries in lists: per-row fetch without expansion. List endpoints should return what the row needs.
- Domain objects prop-drilled through UI: pass ids + view models; features read their own data via hooks.
- Bundle creep: data routes without `lazy()` / `lazyFeature` (if routing already filed it, skip).
- Boundary rules as warnings, not errors (if enforcement already filed it, skip).

**Hard (only if not already filed)**

- SSE connection sprawl: more than one `EventSource` / stream class (realtime should have caught this).
- Server data copied into a store (state-ownership should have caught this).
- Premature widget / widget-in-disguise with `models/` or `api/` (layers/lifecycle should have caught this).

## How

Sample the largest feature folders (`find src/features -type f | cut -d/ -f1-3 | sort | uniq -c`). Read the longest `hooks/use*.ts` for inlined rules. List `src/shared/**/*.ts` for business nouns. Compare `query-keys/*.ts` factory roots.
