# Task Decomposition — from spec to feature-dev-kit tasks

`feature-dev-kit` builds **one feature per run**. A `type: app` or `type: domain` spec from
spec-dev-kit describes a whole surface, so this kit must split it into a small number of
independently buildable tasks before the task loop (Station 3) starts.

`scripts/build-checklist.mjs` performs this deterministically; this file documents the algorithm it
implements, so a human (or a re-run after a spec edit) can predict its output.

---

## Grouping rule

One task = **one primary screen** (`ui-surface.screens[].id`) plus every `user-stories[]` entry
whose acceptance criteria reference an interaction on that screen, plus the entities that screen's
components touch. Screens are the unit because they are the smallest thing a human can review a
diff for and approve — a single "feature" in `feature-dev-kit`'s sense.

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
    story-refs:  stories.map(id)           # US-xxx list
    ac-refs:     acs.map(id)               # AC-xxx list
    entity-refs: entities.map(name)
    priority:    max(stories.map(priority))  # must > should > could > wont
    slug-hint:   kebab(S.title) or kebab(S.id)   # feature-dev slug; never the app metadata.slug
  }
```

Stories that reference **no** screen (pure API/backend stories) become their own task named after
the story rather than a screen, with `slug-hint` = kebab(`{as} {i-want}`) or kebab(story id) —
never the app `metadata.slug`. Screens with **no** matching story (e.g. a shared shell/settings
page nobody wrote a story for) still become a task — the checklist confirmation gate (Station 2a) is
where a human drops ones that aren't worth building.

---

## Ordering

1. `priority: must` tasks first, in screen declaration order.
2. Then `should`, then `could`. `wont` tasks are excluded entirely (not even added to the checklist).
3. Within the same priority, a task whose `entity-refs` were already built by an earlier task in this
   run sorts earlier — reusing entities lowers each subsequent task's cost. `build-checklist.mjs`
   approximates this by keeping declaration order, since spec-dev-kit specs are expected to list
   entities in dependency order already; it does not attempt real dependency-graph sorting.

---

## Stable IDs across re-derivation

If the orchestrator is re-run against a spec that was edited after the checklist already exists,
`build-checklist.mjs` re-derives tasks but **preserves existing `id` → `screen-ref` pairings** for any
screen that still exists, so a `done` task never gets renumbered out from under its recorded
progress. New screens append with the next free `T-NNN`. A screen that disappeared from the spec has
its task marked `blocked` (reason: "source screen removed from spec") rather than deleted, so a human
notices and can drop it manually from `task-checklist.md`.

---

## Spawn payload (paths and ids — not a pasted spec)

Do **not** synthesize a multi-paragraph REQUEST (stories, ACs, entity dumps). That duplicates
`spec.md` into the parent context. `import-upstream.mjs` reads `UPSTREAM_SPEC` and writes the
blackboard.

Pass:

```
REQUEST:        Screen-task {id} ({slug-hint or screen-ref}). Read UPSTREAM_SPEC / CHECKLIST_PATH.
UPSTREAM_SPEC:  {path to spec.md}
TASK_ID:        T-00N
SCREEN_REF:     SCR-00N          # empty for screen-less story tasks
STORY_REFS / AC_REFS / ENTITY_REFS
PROTOTYPE_REF:  {prototype dir or empty}
CHECKLIST_PATH: {task-checklist.md}   # orchestrator write-back; feature-dev does not edit it
SLUG_HINT:      kebab screen title (or story title / T-00N for screen-less tasks)
RESULT_OUT:     {checklist dir}/results/{id}.json
```

A free-text REQUEST alone is not a scoped import — feature-dev-kit will refuse a whole-app dump
when `--require-scoped` applies.

`feature-dev-kit`'s Station 0 must not re-ask questions the YAML already answered. It must not
import screens outside `SCREEN_REF`.
