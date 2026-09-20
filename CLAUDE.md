# dev-cursor-plugins

A plugin marketplace with reusable **skills**, **rules**, **commands**, and **agents** for Claude Code and Cursor.

## Repo layout

```
.claude-plugin/marketplace.json   # Claude Code marketplace manifest
.cursor-plugin/marketplace.json   # Cursor marketplace manifest (mirrors Claude)
<plugin>/
  .claude-plugin/plugin.json      # Claude Code plugin manifest
  .cursor-plugin/plugin.json      # Cursor plugin manifest (same paths)
  agents/                         # subagent definitions (.md)
  skills/                         # skill definitions (SKILL.md)
  commands/                       # slash command definitions (.md)
  rules/                          # Cursor-compatible rule files (.mdc)
  .mcp.json                       # MCP server configs (if any)
schemas/                          # JSON schemas for manifests
scripts/                          # validation + Cursor local install
evals/                            # discoverability evals for skills/agents (see evals/README.md)
  cases/<plugin-name>.json        # prompt -> expected skill/agent per plugin
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

1. Create `<plugin-name>/` at repo root
2. Add matching `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`
3. Add component directories (`skills/`, `agents/`, `rules/`, `commands/`)
4. Register in both `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json`
5. Add `evals/cases/<plugin-name>.json` with a case per skill/agent
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

| Plugin | Components |
|--------|-----------|
| `base-dev-kit` | Rules: honesty, security (always applied). Skills: clean code, dependencies, documentation, git workflow, TDD |
| `frontend-dev-kit` | Rules + Skills + MCP: React 19/TS/shadcn/Tailwind stack |
| `pptx-dev-kit` | Skills + Agents: create a 16:9 `.pptx` via design schema → outline → `deck.json` → checked-in layout renderer; or edit an existing deck via OOXML unpack/replace/pack |
