---
name: discovery-scan
description: Procedure for the factory codebase-analyst — map an existing application into an app profile, a capability map of features with paths and routes, and a baseline feature ledger, with a conformance verdict against the stack's reference architecture. Preloaded by the codebase-analyst; not for direct use.
user-invocable: false
---

# Discovery scan (once per app)

Runs on: codebase-analyst (sonnet) — reading an unfamiliar repository's structure, not its bodies,
and describing it in three checkable files.

Produce `.factory/app-profile.yaml` ([fa-app-profile.yaml](../../templates/fa-app-profile.yaml)),
`.factory/_index/capability-map.yaml` ([fa-capability-map.yaml](../../templates/fa-capability-map.yaml))
and `.factory/ledger/feature-ledger.yaml`
([fa-feature-ledger.yaml](../../templates/fa-feature-ledger.yaml)). The human confirms them once at
GATE-D; every later feature is specified and planned against them, so wrong is worse than short.

## Budget

You have about 30 reads (T4). Spend them on structure: file lists, router and route files, slice
`index.ts` files, `package.json`, a README, one or two representative modules. Never read every
component. `git ls-files` (Bash) costs no read; unscoped Grep / Glob is blocked — pass a folder.

## 1. Layout (cheap)

1. `git ls-files | head -400` and `git ls-files | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -60`
   for the folder shape. Note the package manager (lock file), the framework (`package.json`
   dependencies), the source root, and each role's folder from `factory.config.yaml`
   (`roles.<role>.path`; the frontend usually sits at `.`).
2. Find the entry points per stack:

| Stack (T1 "Stack ·" line) | Entry points | A capability is usually |
|---|---|---|
| frontend-dev-kit (FSD) | `src/app/router*`, `src/pages/*`, route definitions | a page group: `src/pages/<page>/**` plus the `features/` and `entities/` slices it composes |
| node-backend-dev-kit (layered Express) | `src/routes/index.ts`, `src/routes/*.routes.ts` | a resource: its route, controller, service, repository and `db/schema` file |
| node-agent-dev-kit (LangGraph) | `src/agents/*/graph.ts`, `src/routes/*.routes.ts` | an agent: `src/agents/<name>/**` plus the service and route that call it |
| anything else | router config, page folders, API routers | one user-visible area |

## 2. Capabilities

One entry per **user-visible area** a later request could name: "checkout", "order history",
"admin users". Not one per folder, not one per layer.

| Field | Rule |
|---|---|
| `name` | kebab-case, the area's user-facing name; stable — later features cite it |
| `paths` | the folders that implement it, as specific globs (`src/pages/checkout/**`, `src/entities/order/**`); include its role folder prefix (`apps/api/src/routes/orders.routes.ts`) |
| `routes` | UI routes as paths (`/checkout`); API routes as `METHOD /path` (`GET /api/v1/orders`) |
| `summary` | one line: what a user can do there |
| `conformance` | optional per capability: `conformant`, or `partial: <the deviation>` |

The gate checks every path: a literal path must exist, a glob must match at least one file
(`phantom-path`). With more than one capability in an app of 20+ files, a glob that matches more than
half of the files fails (`too-broad`) — name the folders. Shared code (`src/shared/**`, `src/lib/**`)
is not a capability; leave it out unless it is user-visible (a design system app).

Stop when every top-level user-visible area has a capability. Precision beats detail.

## 3. Conformance

Compare the layout with each stack's reference architecture (the "Stack ·" lines in T1) and pick one
verdict for the profile:

| Verdict | When | Effect later |
|---|---|---|
| `conformant` | the layout follows the reference architecture and you saw no deviation | full mode |
| `partial` | new code can follow it, but some areas deviate | new slices conform; edits in deviating areas follow local patterns |
| `non-conformant` | the app follows a different architecture | adapter mode only, or a human decision |
| `unknown` | you could not tell (no tool, no clear structure) | treated with care by later stages |

Deviations to look for: FSD — legacy `src/components` / `src/containers` / `src/utils`, slices
without `index.ts`, deep imports into another slice, upward imports. Layered Express — a controller
or route importing the database, missing `container.ts`, services sending HTTP responses.
LangGraph — graphs without a typed state module, tools outside `tools/`, models created inside nodes.

**`conformant` is checked.** The gate runs every enabled stack's architecture check (e.g.
`depcruise src`) and fails the claim if the check fails (`not-conformant`). If the exit check reports
that, switch to `partial` and copy the reported violations, summarised, into `notes`. A stack whose
tool is not installed cannot refute the claim — then say so in `notes`. Never fix a deviation.

## 4. App profile

- `name` from `package.json`; `goal` in one sentence from the README or the normalised sources.
- `scope`: the capability names. `out_of_scope`: only what a source states.
- `components`: one key per enabled role, `{ stack: <stack>, path: <role folder> }`.
- `nfr`: only what the repository proves (a browserslist, an axe test, a configured budget); never
  invented targets.
- `conformance`: the verdict; `origin: discovered` (the gate requires it).
- `notes`: the deviations, adapter-mode areas, and anything a later stage must know (generated
  code, a second app in the repo, missing tests).

## 5. Feature ledger

One entry per capability: `{ name, status: discovered, version: 1, paths }` with the same paths as
the capability map. No `id` (discovered features have no FEAT ID) and no `requirements` (none were
specified). Later features add versions; you only write the baseline.

## What the discovery gate checks

| Rule | Failure |
|---|---|
| all three files exist and are schema-valid | `missing`, `schema` |
| `origin` is `discovered` | `origin` |
| at least one capability | `empty` |
| every path matches a real file (not under `.factory/` or `node_modules/`) | `phantom-path` |
| no glob matches over half the files when there are several capabilities | `too-broad` |
| a `conformant` claim survives each stack's architecture check | `not-conformant` |

Run the exit check from T0 before you return. It runs the architecture tools, so it can take a while.
