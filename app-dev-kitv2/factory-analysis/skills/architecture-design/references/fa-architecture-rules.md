# Architecture rules: reuse, placement, ADRs

Used by `architecture-design` (solution-architect, S3). Stack-specific layer rules live in each stack
pack's architecture skill (`react-feature`, `architecture-audit` of the backend) and its rules (T1 lists them by name); this file says how to use
them for a component map, not what they say.

## Reuse ladder

For every piece of behaviour a story needs, stop at the first rung that works:

| Rung | `reuse` | When | Evidence the gate or reviewer checks |
|---|---|---|---|
| 1 | `existing` | an existing module does the job as it is | `path` exists |
| 2 | `extend` | an existing module needs a new option, field, case or prop — no fork, no copy | `path` exists; the change is additive |
| 3 | `new`, composed | nothing fits, but the new part is built from existing ones | `reuse_considered` lists what it composes and what was rejected |
| 4 | `new` | nothing related exists | `reuse_considered` lists the candidates you checked, `reuse_rejected` says why each fails |

Where to look, cheapest first:

1. the component inventory (`_index/component-inventory.yaml`): `name`, `path`, `layer`, `exports`,
   `used_by` — a module with a high `used_by` is the shared one to extend;
2. the capability map: which folders hold the area the story touches;
3. a scoped Grep inside one of those folders for a name or a signature.

`reuse_rejected` is a real reason of four words or more, naming the candidate: "shared/ui/input has
no inline error slot; the field composes it with shared/ui/inline-error". Never "n/a", "none" or
"new feature". `reuse_considered` is never empty for a `new` component.

Forking is the failure this ladder prevents: a copy of an existing component with small changes is
`extend` on the original, never `new` beside it.

## Placement by stack

The component's `layer` is the reference architecture's layer name. Decide it by what the code does,
then confirm with the stack's architecture skill and rules (T1):

| Stack | Ask | Layer examples |
|---|---|---|
| frontend-dev-kit (FSD) | domain-agnostic? a business object? one user action? a reusable block of several actions? a routed screen? app wiring? | `shared`, `entities`, `features`, `widgets`, `pages`, `app` |
| node-backend-dev-kit (layered) | input shape? HTTP mapping? a business rule? data access? the table? wiring? | `schemas`, `routes` / `controllers`, `services`, `repositories`, `db`, `container` |
| node-agent-dev-kit (LangGraph) | a capability the model calls? shared run data? one reasoning step? the flow? the HTTP entry? | `tools`, `state`, `nodes`, `graph`, `services` / `routes` |

Rules that hold for every stack:

- One component, one layer. A component that would span two layers is two components.
- Imports only go the way the reference architecture allows; a component that needs an upward
  import is placed wrong.
- A slice or module is used from outside only through its public entry (the slice's `index.ts`,
  the service's exported factory).
- Set `role` on each component when more than one role is enabled, so the planner routes its
  tasks without guessing. The `path` sits inside that role's `owns_paths`.
- In a `partial` or `non-conformant` app (app profile `conformance`), new slices follow the
  reference architecture; changes inside a deviating area follow that area's local pattern. Say
  which applies in the component map body.

## Component map fields

| Field | Rule |
|---|---|
| `name` | unique in the map (`duplicate`); the module's real or planned exported name |
| `path` | the file or folder; for `existing` / `extend` it must exist (`missing-path`) |
| `layer` | the reference architecture's layer |
| `role` | the owning role when several are enabled |
| `stories` | at least one story ID that exists (`unknown-story`); every story has a component (`story-without-component`) |
| `reuse` | `existing`, `extend` or `new` |
| `reuse_considered` | candidates checked (inventory names or paths); required for `new` (`nothing-considered`) |
| `reuse_rejected` | why the candidates fail, four words or more, for `new` (`no-reason`); `null` otherwise |

`decisions` lists the ADR IDs the map relies on; each needs a file (`missing-adr`). `contract_ops`
lists every API operation the feature calls or adds, by `operationId`; each must be defined in the
contract (`unknown-operation`). An operation the app already has is still listed when the feature
calls it.

The Markdown body explains how the parts fit: the data flow from screen to storage, where state
lives, how an error travels to the copy the ACs quote, and which unchanged guarantee each extended
module keeps. Refer to IDs; do not repeat the front matter.

## ADRs

Write one when a later reader would ask "why like this?":

- a new shared component, entity or service other features will reuse;
- where state lives (server cache, URL, local store, graph state) when more than one place works;
- a data-shape choice (a new field, an enum, a derived value) or a calculation's home;
- any deviation from the reference architecture — without an ADR it fails review;
- a choice between two reasonable approaches a source made visible;
- a change to an agreed API contract after GATE-B.

| Part | Content |
|---|---|
| file | `03-architecture/adr-NNN-<kebab-slug>.md`, NNN from the next free ADR ID |
| front matter | `id: ADR-NNN`, `title`, `status: accepted` (or `proposed` when it waits on an open question), `feature`, `supersedes: ADR-MMM` when it replaces one |
| Context | the forces, citing REQ / STORY / SRC IDs and the constraint that matters |
| Decision | one decision, in one or two sentences, in the active voice |
| Alternatives | each option considered and the reason it lost |
| Consequences | what becomes easier, what harder, which tests or guarantees cover it |

One decision per ADR. Never edit another feature's ADR: supersede it with a new one.

## Bootstrap (A0, greenfield)

The engine has already copied each enabled role's boilerplate. The app profile describes the app the
PRD will define:

| Field | Source |
|---|---|
| `name`, `goal` | the normalised sources (one-sentence goal) |
| `scope` | the user-visible areas the sources name, kebab-case |
| `out_of_scope` | only what a source states |
| `components` | one key per enabled role in `factory.config.yaml`: `{ stack: <stack>, path: <role path or "."> }` |
| `nfr` | only targets a source states (`web_vitals`, `a11y`, `browsers` …); none invented |
| `conformance` | `conformant` — the boilerplate follows its stack's reference architecture |
| `origin` | `greenfield` |
| `notes` | anything the requirements analyst must know (a fixed brand, a mandated platform) |

The profile gate checks only the schema; the requirements stage reads the profile next.
