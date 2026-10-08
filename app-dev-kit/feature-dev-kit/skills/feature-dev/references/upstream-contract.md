# Upstream Contract — feature-dev-kit

What one `/feature-dev` run is allowed to read. A `type: app` spec from spec-dev-kit describes
a whole surface; **frontend-orchestrator-kit** groups it into features. This kit builds **one
feature per run** — every nested screen of that feature, and no other screen. Dumping every
`ui-surface.screens[]` entry into one blackboard is invalid.

Canonical YAML schema: spec-dev-kit `references/spec-schema.md` (version 2.0; 1.x still read).
What each kit reads, and in what order: spec-dev-kit `references/consumer-contract.md`.
Task derivation: frontend-orchestrator-kit `references/task-decomposition.md`.

---

## Spawn payload (frontend-orchestrator-kit → feature-dev)

The `orchestrate-frontend` skill (or a human invoking `/feature-dev` with the same fields) must pass:

| Field | Required | Meaning |
|-------|----------|---------|
| `REQUEST` | no, when `UPSTREAM_SPEC` + `FEATURE_ID` | One line naming the feature. **Never** paste spec YAML, stories, or ACs — `import-upstream.mjs` reads `UPSTREAM_SPEC`. Required only for standalone free-text runs |
| `UPSTREAM_SPEC` | preferred | Path to `.spec/spec/spec-{tc}_{slug}/spec.md` (or the `spec_path` in `.spec/app/current.json`) |
| `FEATURE_ID` | when from frontend-orchestrator-kit | Checklist feature id, e.g. `F-001` |
| `TASK_IDS` | when from frontend-orchestrator-kit | Nested task ids, comma-separated, e.g. `T-001,T-002` |
| `SCREEN_REFS` | when the feature has screens | Nested `ui-surface.screens[].id` values, e.g. `SCR-001,SCR-002` |
| `SLICE_REF` | spec 2.0 checklists | Delivery slice id, e.g. `SL-002`. The import reads `{spec dir}/slices/{SLICE_REF}.yaml` as the source for every section (the whole spec when the brief is missing, or when a passed ref is outside the brief — a screen moved into this feature at Station 2a; it prints `WARN [BRIEF_FALLBACK]`) for the goal, frontend steps, rules, and notifications. `done-when` AC bodies are always included. Slice `api-refs` are unioned with the screens' `api-refs`. With no `SCREEN_REFS`, the slice's screens are imported |
| `STORY_REFS` / `AC_REFS` / `ENTITY_REFS` | from the checklist | Unions of the nested tasks' refs. When passed they win over any derivation. `AC_REFS` is still unioned with the slice's `done-when`. Checklist `entity-refs` already include the slice's `entity-refs` |
| `CHANGE` | only for a removal | `remove` when a nested task `change` is `remove`. Pass `--change remove` to `import-upstream.mjs`. It writes `## Change request` (`Remove. Do not scaffold a replacement.`). Delete those screens' pages and routes |
| `PROTOTYPE_REF` | optional | `.spec/prototype/{proto-tc}_{slug}/` or empty — html-generator's own timecode |
| `CHECKLIST_PATH` | optional | `task-checklist.md`. **Orchestrator-owned write-back** — this kit never edits it. Pass `--checklist` so import can see a `screen-ref` already `done` on another feature and write `Extend existing` into `## Change request` |
| `SLUG_HINT` | yes for a checklist feature | kebab-case feature slug; never the app `metadata.slug` |
| `PARENT_BRANCH` | when HEAD is already `feature/*` | Branch to `git checkout` before `checkout -b`. Empty on the first feature |
| `RESULT_OUT` | optional | Extra copy of `kit-result.json` (orchestrator `{checklist dir}/results/{feature.id}.json`) |
| `PREFLIGHT` | optional | `accepted` when the caller already showed the `preflight-host.mjs` issues and the human chose to continue — this skill reports them without asking again |
| `KIT_DIR` | — | **Not passed.** This skill resolves the plugin root itself (see skill Step 0) |

Direct `/feature-dev "free text"` with no feature fields: glob an approved spec **and** a
`task-checklist.md` feature whose title, slug-hint, or nested screen matches. If a feature
matches, import that feature's screens. If none matches, treat as a **standalone** feature —
import identity + `context.*` only, never every screen.

`--task-id` and `--screen-ref` still select a single screen. They are the one-screen form of
`--task-ids` and `--screen-refs`.

---

## YAML fields to import (filtered)

`scripts/import-upstream.mjs` parses **YAML front matter first**.
Do not look for a `## UI Surface` heading in the app spec — it does not exist there.

| Spec field | Blackboard destination | Filter |
|------------|------------------------|--------|
| `metadata.title`, `context.goal` (or the slice `goal`) | `## Request` | identity + one line |
| slice `steps` (track `frontend`) | `## Request` | `SLICE_REF` only |
| `ui-surface.screens[]` (incl. `page-type`, `primary-entity`, `roles`) | `## UI Surface` | **only** `SCREEN_REFS` |
| `ui-surface.interactions[]` | `## UI Surface` | `screen-ref` is in `SCREEN_REFS` |
| `user-stories[]` | `## Request` | `STORY_REFS`, else the stories of the kept ACs |
| `acceptance-criteria[]` | `## Acceptance Criteria` | `AC_REFS`, always unioned with the slice's `done-when`; else (2.0) ACs of the screens' `story-refs` ∩ the slice's stories (a screen that is not one of the slice's screens keeps all its stories); else (1.x) keyword match on the screen |
| `entities[]` (fields, `values`, `derived`) | `## API Contract / Data Model` | `ENTITY_REFS`; else screens' `primary-entity` plus the slice's `entity-refs` (2.0, same as the checklist); else names in `components[]` (1.x) |
| `api-surface.endpoints[]` (roles, error codes + copy) | `## API Contract / Data Model` | screens' `api-refs` union the slice's `api-refs` (2.0); else path/body mentions a kept entity (1.x; `mutations` merged by id) |
| `state-machines[]` | `### Status lifecycle` | machines of the kept entities |
| `business-rules[]` | `### Rules the UI must surface` | With `SLICE_REF`: the slice's `rule-refs`, plus touching rules no slice lists. Without: `applies-to` a kept entity / endpoint / screen |
| `business-rules[]` | `### Rules owned by other slices (context — do not build)` | `SLICE_REF` only: rules that touch a kept entity / endpoint / screen but another slice lists — one line each, `- BR-019 (SL-004): <first sentence>` |
| `permissions[]` | `### Permissions` | With `SLICE_REF`: the slice's `permission-refs`, plus touching ones no slice lists. Without: `refs` touch a kept screen or endpoint |
| `permissions[]` | `### Permissions owned by other slices (context — do not build)` | `SLICE_REF` only: one line each, `- PERM-004 (SL-004): <action>` |
| `notifications[]` | `### Notifications (copy)` | effects of the kept state machines, or the slice's `notification-refs` |
| `glossary[]` | `{slug}.context/glossary.md`, referenced from `### Glossary` by path | all — the same for every feature, so it is not copied into the board. Work cards name the path for workers that write copy |

Do **not** copy screens that belong to another feature. A Sign-in feature must not list Building
catalogue when that screen is not in `SCREEN_REFS`.

---

## Prototype bind (html-generator-kit)

When `PROTOTYPE_REF` is a directory that exists:

| Prototype file | Use |
|----------------|-----|
| `page-map.json` | Preferred. `{ "SCR-001": "sign-in", "SCR-004": "building-catalogue" }` — spec screen id → HTML page id |
| `README.md` `## Pages` | Fallback. Lines `- {page-id}: {title} — …` matched on `screen.title` |
| `pages/{page-id}.html` | Last resort: kebab-case `title`, then last then first non-param route segment — **only if the file exists** |
| `design-brief.md`, `css/tokens.css`, `design-system-ref.md` | Colour / type / spacing hints for composition — not copied into React |

Never bind a path that is not on disk. Route-first derivation (`/catalogue` → `catalogue.html`) is
wrong when html-generator uses a semantic id (`building-catalogue.html`).

Write the resolved HTML path into `## UI Surface` as `prototype-page: pages/{page-id}.html`.
Stamp blackboard front matter `prototype-ref:`.

Missing prototype (or unmatched page) is not an error — leave `prototype-page` off the UI Surface
row; `prototype-ref` may still be the directory.

### Prototype inventory (parity contract)

Right after import, when any `prototype-page:` is bound:

```bash
node {KIT_DIR}/skills/feature-dev/scripts/extract-prototype-inventory.mjs --spec {SPEC_PATH}
```

It writes `.spec/features/<slug>.context/prototype-inventory.md`: one row per heading, text,
button (with the shadcn variant its `btn-*` class maps to), link, breadcrumb, field (label, type,
placeholder, required), select option, validation message, toast, badge, alert, dialog, table
column, enum → label map, `x-text` binding, and skeleton — each tagged with the view state it
lives in (`loading`, `empty`, `error`, `success`, `dialog:<id>`, `when <condition>`). The
dev-panel and `aria-hidden` nodes are skipped.

| Column | Owner |
|--------|-------|
| `#`, Region/state, Kind, Prototype text, Hint | The script. Never hand-edit; re-run it |
| React target | The engineer that renders the row (Station 6, or the slice owner) |
| Status | Same engineer: `done`, `missing`, or `n/a: <reason>` (sample server data, emoji → lucide icon, prototype-only chrome) |

Re-running keeps React target / Status for unchanged rows. `--check` exits 1 on a blank or
`missing` Status, `done` without a target, `n/a` without a reason, or a prototype state with no
`done` row. Prototype text is the English locale value for copy rows — it is translated with `t()`,
never pasted as a literal. The inventory is a context file, not a blackboard section; pass its path.

---

## Blackboard front matter (this kit's output)

```yaml
slug: sign-in
status: draft
upstream-spec: .spec/spec/spec-{tc}_{slug}/spec.md
feature-id: F-001
task-id: T-001,T-002          # comma-separated nested tasks
screen-ref: SCR-001,SCR-002   # comma-separated nested screens
prototype-ref: .spec/prototype/{tc}_{slug}/   # or none
```

`scripts/import-upstream.mjs` is the deterministic mapper. `validate-feature-spec.mjs --require-scoped`
fails an app spec that was imported with no `feature-id`, `task-id`, or `screen-ref`. Each id in
`screen-ref` must appear in `## UI Surface`.

---

## What this kit must never do

- Re-derive the frontend-orchestrator-kit task list.
- Build every screen in the app in one run. Nested screens of **this** feature belong in the same run.
- Pass `SPEC_CONTENT` (the full spec body) to `feature-orchestrator` or back to `orchestrate-frontend`.
- Treat HTML prototype files as production source.
- Edit `task-checklist.md` (`CHECKLIST_PATH` is orchestrator write-back only).
- Write a pasted review packet into the parent chat as the handoff — write
  `.spec/features/{slug}.kit-result.json` instead.
