# dev-cursor-plugins

A plugin marketplace with reusable **skills**, **rules**, **commands**, and **agents** for Claude Code and Cursor.

## Repo layout

```
.claude-plugin/marketplace.json   # Claude Code marketplace manifest
.cursor-plugin/marketplace.json   # Cursor marketplace manifest (mirrors Claude)
<plugin>/                         # most kits live at repo root
  .claude-plugin/plugin.json      # Claude Code plugin manifest
  .cursor-plugin/plugin.json      # Cursor plugin manifest (same paths)
  agents/                         # subagent definitions (.md)
  skills/                         # skill definitions (SKILL.md)
  commands/                       # slash command definitions (.md)
  rules/                          # Cursor-compatible rule files (.mdc)
  .mcp.json | mcp.json            # MCP configs (Claude default / Cursor default)
app-dev-kit/                      # nested family — marketplace source is ./app-dev-kit/<name>
  spec-dev-kit/
  html-generator-kit/
  feature-dev-kit/                # MCP file is mcp.json (plugin.json mcpServers points here)
  frontend-orchestrator-kit/
  backend-dev-kit/
  agent-dev-kit/
  app-orchestrator-kit/
schemas/                          # JSON schemas for manifests
scripts/                          # validation + Cursor local install
evals/                            # discoverability evals for skills/agents (see evals/README.md)
  cases/<plugin-name>.json        # prompt -> expected skill per plugin
  cases/<plugin-name>-agents.json # prompt -> expected agent (when the kit ships agents)
  runner.mjs
```

## Plugin manifest format

Each plugin has both `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` at its root.
Key fields (same in both):

- `name` — kebab-case, used as namespace for skills/commands: `/plugin-name:skill`
- `agents` / `skills` / `commands` / `rules` — paths to component directories
- `mcpServers` — path to `.mcp.json` / `mcp.json` file or inline config

## Skill format (SKILL.md)

```markdown
---
name: skill-name
description: When to invoke this skill. Claude uses this to decide auto-invocation.
---

## Instructions

...skill content...
```

## Agent format

```markdown
---
name: agent-name
description: What this agent does. Claude uses this for delegation decisions.
tools: Read, Glob, Grep      # optional allowlist
model: sonnet                 # sonnet | opus | haiku
---

Agent system prompt...
```

## Adding a plugin

1. Create `<plugin-name>/` at repo root, or under `app-dev-kit/` for the spec → prototype → build family. Marketplace `source` must match that directory (e.g. `./app-dev-kit/spec-dev-kit`).
2. Add matching `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`
3. Add component directories (`skills/`, `agents/`, `rules/`, `commands/`)
4. Register in both `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json`
5. Add `evals/cases/<plugin-name>.json` with a case per skill (and `evals/cases/<plugin-name>-agents.json` when the kit ships agents)
6. Run `npm run validate` and `npm run eval`

Adding a skill or agent to an *existing* plugin, or changing one's `description`, requires the same
step 5 — add or update its case in that plugin's eval file. See [evals/README.md](evals/README.md).

## Validation

```bash
npm install
npm run validate   # manifest/schema/structure checks
npm run eval        # skill/agent discoverability checks
```

## Cursor local install

```bash
npm run install:cursor-local
```

## Current plugins

| Plugin | Path | Components | Evals |
|--------|------|-----------|-------|
| `base-dev-kit` | `base-dev-kit/` | Rules: honesty, security (always applied). Skills: clean code, dependencies, documentation, git workflow, TDD | `evals/cases/base-dev-kit.json` |
| `frontend-dev-kit` | `frontend-dev-kit/` | Rules + Skills + MCP: React 19/TS/shadcn/Tailwind stack | `evals/cases/frontend-dev-kit.json` |
| `pptx-dev-kit` | `pptx-dev-kit/` | Skills + Agents: create a 16:9 `.pptx` via design schema → outline → `deck.json` → checked-in layout renderer; or edit an existing deck via OOXML unpack/replace/pack | `evals/cases/pptx-dev-kit.json`, `pptx-dev-kit-agents.json` |
| `backend-dev-kit` | `app-dev-kit/backend-dev-kit/` | Rules + Skills + Agents + MCP: Node 22/TS Express 5 APIs with Drizzle, Zod, and Vitest; `/backend-dev` factory consumes spec + prototype refs | `evals/cases/backend-dev-kit.json`, `backend-dev-kit-agents.json` |
| `agent-dev-kit` | `app-dev-kit/agent-dev-kit/` | Rules + Skills + Agents + MCP: TypeScript/Node agents and RAG with the OpenAI SDK via OpenRouter; `/agent-dev` factory consumes spec + prototype refs | `evals/cases/agent-dev-kit.json`, `agent-dev-kit-agents.json` |
| `spec-dev-kit` | `app-dev-kit/spec-dev-kit/` | Skills + Agents: `.spec/context/` → approved hybrid YAML+Markdown spec for html-generator-kit, feature-dev-kit, backend-dev-kit, and agent-dev-kit | `evals/cases/spec-dev-kit.json`, `spec-dev-kit-agents.json` |
| `html-generator-kit` | `app-dev-kit/html-generator-kit/` | Skills + Agents: approved spec → CDN-free Alpine.js multi-page HTML prototype | `evals/cases/html-generator-kit.json`, `html-generator-kit-agents.json` |
| `feature-dev-kit` | `app-dev-kit/feature-dev-kit/` | Skills + Agents + Rules + MCP: one FSD screen-task from a spec (hub-and-spoke orchestrator, architecture-audit, human review; never a PR) | `evals/cases/feature-dev-kit.json`, `feature-dev-kit-agents.json` |
| `frontend-orchestrator-kit` | `app-dev-kit/frontend-orchestrator-kit/` | Skills: spec → html-generator → feature-dev, one UI screen-task at a time, against a persisted checklist | `evals/cases/frontend-orchestrator-kit.json` (skills only) |
| `app-orchestrator-kit` | `app-dev-kit/app-orchestrator-kit/` | Skills: analyze spec + prototype, then dispatch backend / agent / frontend tracks against a persisted work-plan | `evals/cases/app-orchestrator-kit.json` (skills only) |

The last seven are one pipeline family, but **seven marketplace plugins** — Claude Code and Cursor install them individually (`/plugin install spec-dev-kit@dev-cursor-plugins`, or `claude --plugin-dir ./app-dev-kit/<name>` / `npm run install:cursor-local`). `frontend-orchestrator-kit` and `app-orchestrator-kit` have no agents directory.
