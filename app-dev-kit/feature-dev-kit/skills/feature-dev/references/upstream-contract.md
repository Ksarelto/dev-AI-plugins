# Upstream Contract — feature-dev-kit

What one `/feature-dev` run is allowed to read. A `type: app` spec from spec-dev-kit describes
a whole surface; **frontend-orchestrator-kit** groups it into features. This kit builds **one
feature per run** — every nested screen of that feature, and no other screen. Dumping every
`ui-surface.screens[]` entry into one blackboard is invalid.

Canonical YAML schema: spec-dev-kit `references/spec-schema.md` (version 1.2).
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
| `PROTOTYPE_REF` | optional | `.spec/prototype/{proto-tc}_{slug}/` or empty — html-generator's own timecode |
| `CHECKLIST_PATH` | optional | `task-checklist.md`. **Orchestrator-owned write-back** — this kit never edits it |
| `SLUG_HINT` | yes for a checklist feature | kebab-case feature slug; never the app `metadata.slug` |
| `PARENT_BRANCH` | when HEAD is already `feature/*` | Branch to `git checkout` before `checkout -b`. Empty on the first feature |
| `RESULT_OUT` | optional | Extra copy of `kit-result.json` (orchestrator `{checklist dir}/results/{feature.id}.json`) |
| `KIT_DIR` | — | **Not passed.** This skill resolves the plugin root itself (see skill Step 0) |

Direct `/feature-dev "free text"` with no feature fields: glob an approved spec **and** a
`task-checklist.md` feature whose title, slug-hint, or nested screen matches. If a feature
matches, import that feature's screens. If none matches, treat as a **standalone** feature —
import identity + `context.*` only, never every screen.

`--task-id` and `--screen-ref` still select a single screen. They are the one-screen form of
`--task-ids` and `--screen-refs`.

---

## YAML fields to import (filtered)

`upstream-interpreter` and `scripts/import-upstream.mjs` parse **YAML front matter first**.
Do not look for a `## UI Surface` heading in the app spec — it does not exist there.

| Spec field | Blackboard destination | Filter |
|------------|------------------------|--------|
| `metadata.slug`, `metadata.title`, `spec-version`, `timecode` | identity / Request header | none (identity only) |
| `context.problem`, `context.goal`, `context.constraints` | `## Request` (one-paragraph context) | none — short |
| `ui-surface.screens[]` | `## UI Surface` | **only** `SCREEN_REFS` (every nested screen of this feature) |
| `ui-surface.interactions[]` | `## UI Surface` | `screen-ref` is in `SCREEN_REFS` |
| `user-stories[]` | `## Request` / stories list | stories of those screens |
| `acceptance-criteria[]` | `## Acceptance Criteria` | ACs of those screens |
| `entities[]` | `## API Contract / Data Model` | names in those screens' `components[]` |
| `api-surface.endpoints[]` / `mutations[]` | `## API Contract / Data Model` | path/body mentions a kept entity |

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
