# Frontend Orchestrator Kit

**Entry point**: `/orchestrate-frontend [app-name or existing spec/checklist slug]` → `skills/orchestrate-frontend/SKILL.md`

Runs the **frontend** track of the `app-dev-kit` family:

```
spec-dev-kit        →   html-generator-kit   →   feature-dev-kit (once per UI screen)
/generate-spec           /generate-html            /feature-dev
   │                        │                         │
   ▼                        ▼                         ▼
.spec/app/spec.md    .spec/prototype/…          .spec/features/<slug>.md
```

It does not replace any of those kits' inner pipelines or human gates. It does **not** build
backend APIs or AI agents — use `/orchestrate-app` (app-orchestrator-kit) for the full-stack
dispatcher, or `/backend-dev` / `/agent-dev` directly.

When invoked by `/orchestrate-app` with `SKIP_UPSTREAM` + `SPEC_PATH`, this skill skips spec and
prototype and starts at the UI checklist.

Cross-kit handoff is **file paths** plus a small `kit-result.json` envelope. The parent never
inlines spec or prototype bodies. See `skills/orchestrate-frontend/references/context-budget.md`.

`KIT_DIR` is the plugin root (the directory that contains `skills/`). Never hardcode
`.spec/orchestrator-kit` or `.spec/frontend-orchestrator-kit`.

---

## Install

This kit **delegates** to spec-dev-kit, html-generator-kit, and feature-dev-kit.

### Claude Code

```text
/plugin install spec-dev-kit@dev-cursor-plugins
/plugin install html-generator-kit@dev-cursor-plugins
/plugin install feature-dev-kit@dev-cursor-plugins
/plugin install frontend-orchestrator-kit@dev-cursor-plugins
```

Local development from this marketplace repo:

```bash
claude --plugin-dir ./app-dev-kit/spec-dev-kit
claude --plugin-dir ./app-dev-kit/html-generator-kit
claude --plugin-dir ./app-dev-kit/feature-dev-kit
claude --plugin-dir ./app-dev-kit/frontend-orchestrator-kit
```

### Cursor

```bash
npm run install:cursor-local
```

Then **Developer: Reload Window** and enable the kits under **Customize → Plugins**.

Also install **frontend-dev-kit** — `feature-dev-kit` requires it.

---

## Quick start

1. Run `/orchestrate-frontend my-app` (or just `/orchestrate-frontend` and answer the prompt).
2. Approve the spec at its review gate (owned by spec-dev-kit), unless one is already approved.
3. Approve the prototype at its review gate (owned by html-generator-kit), or skip it.
4. Approve the derived **UI** task checklist (owned by this kit).
5. For each screen-task, `/feature-dev` runs to completion and stops at **its own** human review gate.
6. Re-run `/orchestrate-frontend my-app` any time to resume from the first unfinished task.

---

## What it produces

- `.spec/app/spec-{tc}_{slug}/spec.md` — from spec-dev-kit (unchanged).
- `.spec/prototype/{tc}_{slug}/` — from html-generator-kit (unchanged).
- `.spec/app/spec-{tc}_{slug}/task-checklist.md` — one row per UI screen-task.
- `{RUN_DIR}/frontend-kit-result.json` — path-only outcome for `orchestrate-app`.
- One feature branch per completed task, each still requiring a manual `/create-pr`.

See `skills/orchestrate-frontend/references/checklist-format.md` for the exact schema.
