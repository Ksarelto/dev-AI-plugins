# app-dev-kit

Four **separate marketplace plugins** (not one plugin) that Claude Code and Cursor can install
individually. Together they run:

```
.spec/context/  →  /generate-spec  →  /generate-html  →  /orchestrate-app
                                        (optional)           │
                                                             ▼
                                              /feature-dev  (one screen-task at a time)
```

| Plugin | Path | Entry | What it ships |
|--------|------|-------|----------------|
| [spec-dev-kit](spec-dev-kit/) | `app-dev-kit/spec-dev-kit/` | `/generate-spec` | Skills + 8 agents |
| [html-generator-kit](html-generator-kit/) | `app-dev-kit/html-generator-kit/` | `/generate-html` | Skills + 9 agents |
| [feature-dev-kit](feature-dev-kit/) | `app-dev-kit/feature-dev-kit/` | `/feature-dev` | Skills + 15 agents + rules + `mcp.json` |
| [orchestrator-kit](orchestrator-kit/) | `app-dev-kit/orchestrator-kit/` | `/orchestrate-app` | Skills only (no agents) |

Each kit has matching `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`. Both
marketplaces register them with `source: ./app-dev-kit/<name>`.

## Install

Claude Code:

```text
/plugin install spec-dev-kit@dev-cursor-plugins
/plugin install html-generator-kit@dev-cursor-plugins
/plugin install feature-dev-kit@dev-cursor-plugins
/plugin install orchestrator-kit@dev-cursor-plugins
```

From this repo:

```bash
claude --plugin-dir ./app-dev-kit/spec-dev-kit
claude --plugin-dir ./app-dev-kit/html-generator-kit
claude --plugin-dir ./app-dev-kit/feature-dev-kit
claude --plugin-dir ./app-dev-kit/orchestrator-kit

npm run install:cursor-local   # Cursor: symlink every marketplace kit
```

`feature-dev-kit` also needs `frontend-dev-kit` and `CONTEXT7_API_KEY`.

## Evals

Discoverability cases (required whenever a skill/agent or its `description` changes):

| Plugin | Skills | Agents |
|--------|--------|--------|
| spec-dev-kit | `evals/cases/spec-dev-kit.json` | `evals/cases/spec-dev-kit-agents.json` |
| html-generator-kit | `evals/cases/html-generator-kit.json` | `evals/cases/html-generator-kit-agents.json` |
| feature-dev-kit | `evals/cases/feature-dev-kit.json` | `evals/cases/feature-dev-kit-agents.json` |
| orchestrator-kit | `evals/cases/orchestrator-kit.json` | — |

```bash
npm run validate
npm run eval
```
