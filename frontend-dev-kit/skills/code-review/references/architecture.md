# Architecture review — what the diff does to the structure

The architecture axis checks the **change**, not the whole tree. It reuses the `architecture-audit`
skill so the invariants live in one place. Run it once per review (not per bucket).

## How to run it

Spawn one subagent with this prompt shape:

```
Load the architecture-audit skill. REPORT_ONLY. DIFF_SCOPE.
Scope: <changed paths, one per line>, plus their importers.
TOPICS: <basenames from the table below, comma separated>
Return the report only.
```

Pick `TOPICS` from the changed paths. Always include `layers-and-segments`, `the-six-layers`, and
`public-api-and-slices`. Add the rest by path:

| Changed path | Add topics |
|---|---|
| `entities/**` | `entities-vs-features`, `cross-feature-communication` |
| `features/**`, `widgets/**` | `cross-feature-communication`, `cross-slice-workflows`, `state-ownership` |
| `**/api/**`, `shared/api/**`, query keys | `api-layer-and-query-keys` |
| `**/models/**`, `**/hooks/**`, stores | `state-ownership`, `cross-slice-workflows` |
| `app/router/**`, `pages/**` | `routing-and-boundaries`, `authentication` when guards change |
| `shared/lib/auth/**`, session code | `authentication` |
| `**/realtime/**`, SSE hooks | `realtime-sse` |
| `**/locales/**`, i18n code | `i18n` |
| `**/ui/**`, `styles.ts`, `globals.css` | `styling`, `component-structure` |
| `**/tests/**`, `*.test.*` | `testing-strategy` |
| ESLint, depcruise, tsconfig paths | `enforcement` |
| New slice, moved or renamed folders | `lifecycle-and-scaling`, `adoption` when the tree is mixed |

## What the reviewer checks without the subagent

Read the diff for these even when the subagent is skipped (small diff, `--focus` excludes it):

1. **Import direction.** Every new `import` in a changed file goes down the layer order. Run
   `rg "from '@/(features|widgets|pages|app)" <changed files>` per layer and read each hit.
2. **Public API.** An import into another slice goes through its `index.ts`; a new export is imported
   by someone outside the folder.
3. **Placement.** The new file is in the right layer and segment: a rule in `models/`, a fetcher in
   `api/`, JSX in `ui/`, a business noun not in `shared/`.
4. **New slice justified.** A new entity needs a second independent consumer; a new widget needs a
   second route; a new feature owns a user-visible rule.
5. **State ownership.** One owner per state; no server data in a store.
6. **Boundaries.** HTTP only through `shared/api`; env through `shared/config`; routes lazy.
7. **Direction of change.** The diff does not make the structure worse than it found it — a
   workaround that adds a second path for something that already has one is a finding even if both
   compile.

## Architecture findings

Tag each with `references/severity.md`. A broken invariant listed in `architecture-audit` is a
**Blocker** (import cycle, feature↔feature, deep import) or **Must fix** (misplaced file, missing
public API). Structural judgement calls (should this be an entity yet?) are **Should fix** or
**Consider**, with the signal that would make it urgent.

Mechanical enforcement: if the project has `npm run lint` with `no-restricted-imports` or
dependency-cruiser, run it and keep every hit. Missing enforcement is itself one **Should fix**.
