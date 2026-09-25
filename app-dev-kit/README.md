# app-dev-kit

Seven **separate marketplace plugins** (not one plugin) that Claude Code and Cursor can install
individually. Together they run:

```
.spec/context/  →  /generate-spec  →  /generate-html  →  /orchestrate-app
                                        (optional)           │
                     ┌───────────────────────────────────────┤
                     ▼                    ▼                   ▼
               /backend-dev         /agent-dev     /orchestrate-frontend
               (one resource)     (one agent)           │
                                                        ▼
                                                 /feature-dev
                                              (one UI screen-task)
```

| Plugin | Path | Entry | What it ships |
|--------|------|-------|----------------|
| [spec-dev-kit](spec-dev-kit/) | `app-dev-kit/spec-dev-kit/` | `/generate-spec` | Skills + 8 agents |
| [html-generator-kit](html-generator-kit/) | `app-dev-kit/html-generator-kit/` | `/generate-html` | Skills + 9 agents |
| [feature-dev-kit](feature-dev-kit/) | `app-dev-kit/feature-dev-kit/` | `/feature-dev` | Skills + 15 agents + rules + `mcp.json` |
| [frontend-orchestrator-kit](frontend-orchestrator-kit/) | `app-dev-kit/frontend-orchestrator-kit/` | `/orchestrate-frontend` | Skills only (no agents) |
| [backend-dev-kit](backend-dev-kit/) | `app-dev-kit/backend-dev-kit/` | `/backend-dev` | Skills + agents + rules + `.mcp.json` |
| [agent-dev-kit](agent-dev-kit/) | `app-dev-kit/agent-dev-kit/` | `/agent-dev` | Skills + agents + rules + `.mcp.json` |
| [app-orchestrator-kit](app-orchestrator-kit/) | `app-dev-kit/app-orchestrator-kit/` | `/orchestrate-app` | Skills only (no agents) |

Each kit has matching `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`. Both
marketplaces register them with `source: ./app-dev-kit/<name>`.

`frontend-dev-kit` stays at the repo root and is a dependency of `feature-dev-kit`.

## Install

Claude Code:

```text
/plugin install spec-dev-kit@dev-AI-plugins
/plugin install html-generator-kit@dev-AI-plugins
/plugin install feature-dev-kit@dev-AI-plugins
/plugin install frontend-orchestrator-kit@dev-AI-plugins
/plugin install backend-dev-kit@dev-AI-plugins
/plugin install agent-dev-kit@dev-AI-plugins
/plugin install app-orchestrator-kit@dev-AI-plugins
```

From this repo:

```bash
claude --plugin-dir ./app-dev-kit/spec-dev-kit
claude --plugin-dir ./app-dev-kit/html-generator-kit
claude --plugin-dir ./app-dev-kit/feature-dev-kit
claude --plugin-dir ./app-dev-kit/frontend-orchestrator-kit
claude --plugin-dir ./app-dev-kit/backend-dev-kit
claude --plugin-dir ./app-dev-kit/agent-dev-kit
claude --plugin-dir ./app-dev-kit/app-orchestrator-kit

npm run install:cursor-local   # Cursor: symlink every marketplace kit
```

`feature-dev-kit` also needs `frontend-dev-kit` and `CONTEXT7_API_KEY`.

Cross-kit handoff is **paths + `kit-result.json`**. Canonical envelope:
`app-orchestrator-kit/skills/orchestrate-app/references/result-envelope.md`.

## Evals

Discoverability cases (required whenever a skill/agent or its `description` changes):

| Plugin | Skills | Agents |
|--------|--------|--------|
| spec-dev-kit | `evals/cases/spec-dev-kit.json` | `evals/cases/spec-dev-kit-agents.json` |
| html-generator-kit | `evals/cases/html-generator-kit.json` | `evals/cases/html-generator-kit-agents.json` |
| feature-dev-kit | `evals/cases/feature-dev-kit.json` | `evals/cases/feature-dev-kit-agents.json` |
| frontend-orchestrator-kit | `evals/cases/frontend-orchestrator-kit.json` | — |
| backend-dev-kit | `evals/cases/backend-dev-kit.json` | `evals/cases/backend-dev-kit-agents.json` |
| agent-dev-kit | `evals/cases/agent-dev-kit.json` | `evals/cases/agent-dev-kit-agents.json` |
| app-orchestrator-kit | `evals/cases/app-orchestrator-kit.json` | — |

```bash
npm run validate
npm run eval
```
