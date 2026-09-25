# App Orchestrator Kit

**Entry point**: `/orchestrate-app [app-name or existing spec/work-plan slug]` → `skills/orchestrate-app/SKILL.md`

Full-stack dispatcher for the `app-dev-kit` family:

```
.spec/context/ → /generate-spec → /generate-html (optional) → analyze
                                      │
                    backend-dev  agent-dev  orchestrate-frontend
                    (B-* loop)   (A-* loop) (T-* UI loop)
```

It does not replace inner factories or their human gates. Cross-kit handoff is **paths +
`kit-result.json`**. See `skills/orchestrate-app/references/context-budget.md`.

`/orchestrate-app` is human-only (`disable-model-invocation: true`). It may then invoke callees.

Frontend-only builds can use `/orchestrate-frontend` directly.

---

## Install

```text
/plugin install spec-dev-kit@dev-AI-plugins
/plugin install html-generator-kit@dev-AI-plugins
/plugin install feature-dev-kit@dev-AI-plugins
/plugin install frontend-orchestrator-kit@dev-AI-plugins
/plugin install backend-dev-kit@dev-AI-plugins
/plugin install agent-dev-kit@dev-AI-plugins
/plugin install app-orchestrator-kit@dev-AI-plugins
```

```bash
claude --plugin-dir ./app-dev-kit/app-orchestrator-kit
npm run install:cursor-local
```

---

## What it produces

- `.spec/app/work-plan.md` — tracks + `B-*` / `A-*` tasks. Runs that still keep `spec.md` under `.spec/app/spec-{tc}_{slug}/` keep the plan beside that spec.
- `{RUN_DIR}/app-kit-result.json` — path-only outcome
- Increment blackboards and branches from delegated kits
