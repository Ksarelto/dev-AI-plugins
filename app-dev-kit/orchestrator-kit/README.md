# App Orchestrator Kit

**Entry point**: `/orchestrate-app [app-name or existing spec/checklist slug]` → `skills/orchestrate-app/SKILL.md`

Runs the other three `app-dev-kit` plugins as one pipeline instead of three manual commands:

```
spec-dev-kit        →   html-generator-kit   →   feature-dev-kit (once per task)
/generate-spec           /generate-html            /feature-dev
   │                        │                         │
   ▼                        ▼                         ▼
.spec/app/spec.md    .spec/prototype/…          .spec/features/<slug>.md
                                                 (repeated, one branch per task)
```

It does not replace any of those kits' inner pipelines or human gates — each still owns its own
approvals. This kit only adds the **glue**: deciding what runs next, deriving the list of
buildable tasks from the approved spec, and persisting a **checklist** so a long multi-feature
build can be paused and resumed without redoing finished work.

Cross-kit handoff is **file paths** (`spec.md`, prototype dir, `task-checklist.md`) plus a small
`kit-result.json` envelope after each delegated skill. The parent never inlines spec or prototype
bodies. See `skills/orchestrate-app/references/context-budget.md` and `result-envelope.md`.

`/orchestrate-app` is human-only (`disable-model-invocation: true`). It may then invoke the three
callee skills.

`KIT_DIR` is the plugin root (the directory that contains `skills/`). The skill resolves it the
same way as spec-dev-kit / html-generator-kit / feature-dev-kit — never hardcode
`.spec/orchestrator-kit/`.

---

## Install

This kit **delegates** to the other three `app-dev-kit` plugins. Install all four.

### Claude Code

```text
/plugin install spec-dev-kit@dev-cursor-plugins
/plugin install html-generator-kit@dev-cursor-plugins
/plugin install feature-dev-kit@dev-cursor-plugins
/plugin install orchestrator-kit@dev-cursor-plugins
```

Local development from this marketplace repo:

```bash
claude --plugin-dir ./app-dev-kit/spec-dev-kit
claude --plugin-dir ./app-dev-kit/html-generator-kit
claude --plugin-dir ./app-dev-kit/feature-dev-kit
claude --plugin-dir ./app-dev-kit/orchestrator-kit
```

### Cursor

From this marketplace repo:

```bash
npm run install:cursor-local
```

Then **Developer: Reload Window** and enable the kits under **Customize → Plugins**.

Or add the marketplace in Agent chat:

```text
/add-plugin https://github.com/Ksarelto/dev-cursor-plugins
```

Also install **frontend-dev-kit** — `feature-dev-kit` requires it.

---

## Quick start

1. Run `/orchestrate-app my-app` (or just `/orchestrate-app` and answer the prompt).
2. Approve the spec at its review gate (owned by spec-dev-kit).
3. Approve the prototype at its review gate (owned by html-generator-kit), or skip it.
4. Approve the derived task checklist (owned by this kit).
5. For each task, `/feature-dev` runs to completion and stops at **its own** human review gate;
   approve or request changes as usual. The orchestrator then checks off the task and moves on.
6. Re-run `/orchestrate-app my-app` any time to resume from the first unfinished task.

---

## What it produces

- `.spec/app/spec-{tc}_{slug}/spec.md` — from spec-dev-kit (unchanged).
- `.spec/prototype/{tc}_{slug}/` — from html-generator-kit (unchanged).
- `.spec/app/spec-{tc}_{slug}/task-checklist.md` — **new**: one row per derived task, its status
  (`pending` / `in-progress` / `done` / `blocked` / `skipped`), and the feature-dev-kit slug/branch
  it produced once built.
- `{RUN_DIR}/kit-result.json`, `{spec dir}/html-kit-result.json`,
  `.spec/features/{slug}.kit-result.json` — path-only outcomes for the parent sequencer.
- One feature branch per completed task, each still requiring a manual `/create-pr`. Next task
  stacks on current `HEAD` unless you pause and PR/merge first.

See `skills/orchestrate-app/references/checklist-format.md` for the exact schema.
