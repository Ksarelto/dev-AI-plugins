# Task Decomposition — from spec to feature-dev-kit UI tasks

`feature-dev-kit` builds **one feature per run**. A `type: app` or `type: domain` spec from
spec-dev-kit describes a whole surface, so this kit groups screens into features before the
feature loop (Station 3) starts. Nested tasks stay screen-level. They are not extra feature-dev
calls, branches, or commits.

`scripts/build-checklist.mjs` performs this deterministically; this file documents the algorithm it
implements, so a human (or a re-run after a spec edit) can predict its output.

API-only and agent-only stories are **not** this kit’s job — `app-orchestrator-kit` routes those
to `/backend-dev` and `/agent-dev`.

---

## Grouping rule

A **feature** is one user story that owns UI, plus every screen whose acceptance criteria belong
to that story. A nested **task** is one screen.

```
for each screen S in ui-surface.screens:
  task = one screen (T-NNN, screen-ref, story/AC/entity refs)   # see the loop below

for each task:
  owner = highest-priority non-wont story on that task          # must before should before could
  if owner: attach the task to that story's feature only        # a screen is never built twice
  else: the screen is its own feature with one task
```

```
for each screen S in ui-surface.screens:
  interactions  = ui-surface.interactions.filter(i => i.screen-ref == S.id)
  acs           = acceptance-criteria.filter(ac =>
                    ac matches an interaction on S (trigger/response text overlap), OR
                    ac.given/when/then mentions S.id, OR
                    ac.given/when/then shares a keyword (>3 chars) with S.title)
  stories       = unique(acs.map(ac => ac.story-ref))
  entities      = entities referenced by S.components[] or by acs (best-effort name match)

  task = {
    id:          "T-{NNN}"                 # sequential, stable across re-derivation (see below)
    title:       S.title
    screen-ref:  S.id
    story-refs:  stories.map(id)
    ac-refs:     acs.map(id)
    entity-refs: entities.map(name)
    status:      pending
  }
```

Feature fields: `F-NNN`, title (the screen title when the feature has one task, otherwise the
story `i-want`), `slug-hint` (kebab of that title, never the app `metadata.slug`), `story-refs`,
`priority`, `status`, empty `slug` / `branch` / `parent-branch`.

A screen that matches several stories is attached only to the highest-priority story, so it is
not built twice. A screen with no story still becomes a feature with one task — Station 2a is
where a human moves a task between features or drops one that is not worth building.

Stories that reference **no** screen (pure API/backend or agent stories) are **omitted**. They
belong on the backend or agent track, not `/feature-dev`.

---

## Ordering

1. `priority: must` features first, then `should`, then `could`. `wont` screens are excluded.
2. Within the same priority, declaration order is kept. Spec-dev-kit lists entities in dependency
   order already; this script does not build a dependency graph.
3. Nested tasks stay in screen declaration order inside their feature.

---

## Stable IDs across re-derivation

If the orchestrator is re-run against a spec that was edited after the checklist already exists,
`build-checklist.mjs` re-derives tasks but **preserves existing `id` → `screen-ref` pairings** and
the feature's `id` / `status` / `slug` / `branch` / `parent-branch` (matched by story-ref, or by an
overlapping screen). New screens append with the next free `T-NNN`; new features use the next
`F-NNN`. A screen that disappeared from the spec has its task marked `blocked` (reason: "source
screen removed from spec") rather than deleted.

---

## Spawn payload (paths and ids — not a pasted spec)

Do **not** synthesize a multi-paragraph REQUEST (stories, ACs, entity dumps). That duplicates
`spec.md` into the parent context. `import-upstream.mjs` reads `UPSTREAM_SPEC` and writes the
blackboard.

Pass:

```
REQUEST:        Feature F-001 (sign-in). Nested tasks in CHECKLIST_PATH. Read UPSTREAM_SPEC.
UPSTREAM_SPEC:  {path to spec.md}
FEATURE_ID:     F-001
TASK_IDS:       T-001,T-002
SCREEN_REFS:    SCR-001,SCR-002
PROTOTYPE_REF:  {prototype dir or empty}
CHECKLIST_PATH: {task-checklist.md}   # orchestrator write-back; feature-dev does not edit it
SLUG_HINT:      kebab feature title
PARENT_BRANCH:  {current HEAD when it is feature/*; empty on the first feature}
RESULT_OUT:     {checklist dir}/results/F-001.json
```

Station 2a shows each feature and its nested task titles. The human can move a task between
features before approve.

A free-text REQUEST alone is not a scoped import — feature-dev-kit will refuse a whole-app dump
when `--require-scoped` applies.

`feature-dev-kit`'s Station 0 must not re-ask questions the YAML already answered. It imports
every screen in `SCREEN_REFS` and no screen outside that feature. Slices inside the run stay on
the same branch and the same commit.
