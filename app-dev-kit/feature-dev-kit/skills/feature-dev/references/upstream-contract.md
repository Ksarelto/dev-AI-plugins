# Upstream Contract — feature-dev-kit

What one `/feature-dev` run is allowed to read. A `type: app` spec from spec-dev-kit describes
a whole surface; **orchestrator-kit** splits it into screen-tasks. This kit builds **one
screen-task per run**. Dumping every `ui-surface.screens[]` entry into one blackboard is invalid.

Canonical YAML schema: spec-dev-kit `references/spec-schema.md` (version 1.1).
Task derivation: orchestrator-kit `references/task-decomposition.md`.

---

## Spawn payload (orchestrator-kit → feature-dev)

The `orchestrate-app` skill (or a human invoking `/feature-dev` with the same fields) must pass:

| Field | Required | Meaning |
|-------|----------|---------|
| `REQUEST` | no, when `UPSTREAM_SPEC` + `TASK_ID` | One line naming the task. **Never** paste spec YAML, stories, or ACs — `import-upstream.mjs` reads `UPSTREAM_SPEC`. Required only for standalone free-text runs |
| `UPSTREAM_SPEC` | preferred | Path to `.spec/app/spec-{tc}_{slug}/spec.md` |
| `TASK_ID` | when from orchestrator-kit | Checklist id, e.g. `T-001` |
| `SCREEN_REF` | when the task is a screen | `ui-surface.screens[].id`, e.g. `SCR-001` |
| `STORY_REFS` | when known | `US-xxx` list for this task only |
| `AC_REFS` | when known | `AC-xxx` list for this task only |
| `ENTITY_REFS` | when known | PascalCase entity names this screen touches |
| `PROTOTYPE_REF` | optional | `.spec/prototype/{proto-tc}_{slug}/` or empty — html-generator's own timecode |
| `CHECKLIST_PATH` | optional | `task-checklist.md`. **Orchestrator-owned write-back** — this kit never edits it |
| `SLUG_HINT` | when `SCREEN_REF` is empty | kebab-case feature slug; never the app `metadata.slug` |
| `RESULT_OUT` | optional | Extra copy of `kit-result.json` (orchestrator `{checklist dir}/results/{task.id}.json`) |
| `KIT_DIR` | — | **Not passed.** This skill resolves the plugin root itself (see skill Step 0) |

Direct `/feature-dev "free text"` with no task fields: glob an approved spec **and** a
`task-checklist.md` row whose title/slug/screen matches. If a row matches, import that row.
If none matches, treat as a **standalone** feature — import identity + `context.*` only,
never every screen.

---

## YAML fields to import (filtered)

`upstream-interpreter` and `scripts/import-upstream.mjs` parse **YAML front matter first**.
Do not look for a `## UI Surface` heading in the app spec — it does not exist there.

| Spec field | Blackboard destination | Filter |
|------------|------------------------|--------|
| `metadata.slug`, `metadata.title`, `spec-version`, `timecode` | identity / Request header | none (identity only) |
| `context.problem`, `context.goal`, `context.constraints` | `## Request` (one-paragraph context) | none — short |
| `ui-surface.screens[]` | `## UI Surface` | **only** `SCREEN_REF` |
| `ui-surface.interactions[]` | `## UI Surface` | `screen-ref == SCREEN_REF` |
| `user-stories[]` | `## Request` / stories list | `STORY_REFS` |
| `acceptance-criteria[]` | `## Acceptance Criteria` | `AC_REFS` (or stories of this screen) |
| `entities[]` | `## API Contract / Data Model` | `ENTITY_REFS` or names in the screen's `components[]` |
| `api-surface.endpoints[]` / `mutations[]` | `## API Contract / Data Model` | path/body mentions a kept entity |

Do **not** copy sibling screens. A Sign-in task must not list Building catalogue as a screen.

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
upstream-spec: .spec/app/spec-{tc}_{slug}/spec.md
task-id: T-001
screen-ref: SCR-001
prototype-ref: .spec/prototype/{tc}_{slug}/   # or none
```

`scripts/import-upstream.mjs` is the deterministic mapper. `validate-feature-spec.mjs --require-scoped`
fails an app spec that was imported with no `task-id` / `screen-ref`.

---

## What this kit must never do

- Re-derive the orchestrator-kit task list.
- Build every screen in one run.
- Pass `SPEC_CONTENT` (the full spec body) to `feature-orchestrator` or back to `orchestrate-app`.
- Treat HTML prototype files as production source.
- Edit `task-checklist.md` (`CHECKLIST_PATH` is orchestrator write-back only).
- Write a pasted review packet into the parent chat as the handoff — write
  `.spec/features/{slug}.kit-result.json` instead.
