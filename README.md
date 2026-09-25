# dev-AI-plugins

A plugin marketplace with reusable **skills**, **rules**, **commands**, and **agents** for **Claude Code** and **Cursor**.

## Plugins

| Plugin | Components | Description |
|--------|-----------|-------------|
| [base-dev-kit](base-dev-kit/) | Rules + Skills | Honesty + security rules (always applied); clean code, git workflow, TDD, dependencies, documentation skills |
| [frontend-dev-kit](frontend-dev-kit/) | Rules + Skills + MCP | React + TypeScript + shadcn/ui + Tailwind + react-query |
| [pptx-dev-kit](pptx-dev-kit/) | Skills + Agents | Create a 16:9 `.pptx` from a brief via a checked-in layout engine, or edit an existing deck via OOXML |
| [agent-dev-kit](app-dev-kit/agent-dev-kit/) | Rules + Skills + Agents + MCP | TypeScript/Node AI agents and RAG: OpenAI SDK via OpenRouter; `/agent-dev` factory from a spec |
| [backend-dev-kit](app-dev-kit/backend-dev-kit/) | Rules + Skills + Agents + MCP | Node.js APIs: Express 5, TypeScript, Drizzle, Zod, Vitest; `/backend-dev` factory from a spec |
| [spec-dev-kit](app-dev-kit/spec-dev-kit/) | Skills + Agents | Raw `.spec/context/` requirements → approved hybrid YAML+Markdown spec |
| [html-generator-kit](app-dev-kit/html-generator-kit/) | Skills + Agents | Validated spec → CDN-free Alpine.js multi-page HTML prototype |
| [feature-dev-kit](app-dev-kit/feature-dev-kit/) | Skills + Agents + Rules + MCP | One React FSD screen-task from a spec + optional prototype; hub-and-spoke; architecture-audit; never a PR |
| [frontend-orchestrator-kit](app-dev-kit/frontend-orchestrator-kit/) | Skills | Spec → prototype → one `/feature-dev` per UI screen-task, tracked on a persisted checklist |
| [app-orchestrator-kit](app-dev-kit/app-orchestrator-kit/) | Skills | Analyze spec + prototype, then dispatch backend / agent / frontend tracks against a work-plan |

The last seven are separate marketplace plugins under [`app-dev-kit/`](app-dev-kit/). See that README for the pipeline map. Discoverability evals live in `evals/cases/<plugin-name>.json` (plus `<plugin-name>-agents.json` when the kit ships agents).

`pptx-dev-kit` needs `python3`; it installs `python-pptx` on demand when rendering or editing.

## Claude Code

### Install the marketplace

```bash
# Add this repo as a marketplace source (once per machine)
/plugin marketplace add artsiommurashko/dev-AI-plugins
```

This makes all plugins available for install in any project.

### Install individual plugins

```bash
# In any Claude Code session
/plugin install base-dev-kit@dev-AI-plugins
/plugin install frontend-dev-kit@dev-AI-plugins
/plugin install pptx-dev-kit@dev-AI-plugins
/plugin install spec-dev-kit@dev-AI-plugins
/plugin install html-generator-kit@dev-AI-plugins
/plugin install feature-dev-kit@dev-AI-plugins
/plugin install frontend-orchestrator-kit@dev-AI-plugins
/plugin install backend-dev-kit@dev-AI-plugins
/plugin install agent-dev-kit@dev-AI-plugins
/plugin install app-orchestrator-kit@dev-AI-plugins
```

### Load locally during development

```bash
claude --plugin-dir ./frontend-dev-kit
claude --plugin-dir ./pptx-dev-kit
claude --plugin-dir ./app-dev-kit/spec-dev-kit
claude --plugin-dir ./app-dev-kit/html-generator-kit
claude --plugin-dir ./app-dev-kit/feature-dev-kit
claude --plugin-dir ./app-dev-kit/frontend-orchestrator-kit
claude --plugin-dir ./app-dev-kit/backend-dev-kit
claude --plugin-dir ./app-dev-kit/agent-dev-kit
claude --plugin-dir ./app-dev-kit/app-orchestrator-kit
```

Or reload inside a session after changes:

```
/reload-plugins
```

### Component discovery

| Component | Default path | Invocation |
|-----------|-------------|------------|
| Skills | `skills/*/SKILL.md` | `/plugin-name:skill-name` |
| Commands | `commands/*.md` | `/plugin-name:command-name` |
| Agents | `agents/*.md` | Agent picker |
| Rules | `rules/*.mdc` | Injected by Claude automatically |
| MCP | `.mcp.json` | Available to all agents in plugin |

### Submit to the community marketplace

1. Run `npm run validate && npm run eval`
2. Push to a public GitHub repo
3. Submit at [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit)

---

## Cursor

Kits ship side-by-side Cursor manifests (`.cursor-plugin/`) that point at the same `rules/`, `skills/`, `agents/`, `commands/`, and MCP files as Claude Code.

### Install from GitHub

In Agent chat:

```text
/add-plugin https://github.com/Ksarelto/dev-AI-plugins
```

Or browse **Customize → Plugins** after adding the marketplace.

### Install locally (recommended while developing)

```bash
npm run install:cursor-local
```

This symlinks every kit into `~/.cursor/plugins/local/<plugin-name>`. Then:

1. Enable third-party Plugins / Skills in Cursor Settings if prompted
2. Run **Developer: Reload Window** (or restart Cursor)
3. Confirm kits under **Customize → Plugins**

Uninstall local links:

```bash
npm run uninstall:cursor-local
```

Dry-run either command with `node scripts/install-cursor-local.mjs --dry-run` (add `--uninstall` to preview removals).

### MCP environment variables

Plugins that declare MCP servers read secrets from the environment (Claude-compatible `${env:VAR}` placeholders):

| Variable | Used by |
|----------|---------|
| `CONTEXT7_API_KEY` | frontend-dev-kit, agent-dev-kit, backend-dev-kit, feature-dev-kit |
| `GITLAB_PERSONAL_ACCESS_TOKEN`, `GITLAB_API_URL` | frontend-dev-kit, agent-dev-kit, backend-dev-kit |
| `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN` | frontend-dev-kit, agent-dev-kit, backend-dev-kit |
| `CONFLUENCE_URL`, `CONFLUENCE_USERNAME`, `CONFLUENCE_API_TOKEN` | frontend-dev-kit, agent-dev-kit, backend-dev-kit |

### Submit to the Cursor Marketplace

1. Run `npm run validate && npm run eval`
2. Push to a public GitHub repo
3. Submit at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)

See the [Cursor plugins reference](https://cursor.com/docs/reference/plugins) submission checklist.

---

## Repo structure

```
.claude-plugin/
  marketplace.json          # Claude Code marketplace manifest
.cursor-plugin/
  marketplace.json          # Cursor marketplace manifest (mirrors Claude)
CLAUDE.md                   # Claude Code project instructions
AGENTS.md                   # Project-level agents (plugin-validator, plugin-scaffolder)
schemas/
  marketplace.schema.json   # JSON Schema for marketplace.json
  plugin.schema.json        # JSON Schema for plugin.json
scripts/
  validate-marketplace.mjs  # Dual Claude + Cursor validation
  install-cursor-local.mjs  # Symlink kits into ~/.cursor/plugins/local
evals/                      # Skill/agent discoverability evals (see evals/README.md)
  cases/<plugin-name>.json  # Prompt -> expected skill per plugin
  cases/<plugin-name>-agents.json
  runner.mjs
<plugin>/                   # most kits at repo root
  .claude-plugin/plugin.json
  .cursor-plugin/plugin.json
  agents/ skills/ commands/ rules/
  .mcp.json                 # MCP (Claude default filename)
app-dev-kit/                # nested family; marketplace source ./app-dev-kit/<name>
  spec-dev-kit/
  html-generator-kit/
  feature-dev-kit/          # MCP file is mcp.json (Cursor default; declared in plugin.json)
  frontend-orchestrator-kit/
  backend-dev-kit/
  agent-dev-kit/
  app-orchestrator-kit/
```

---

## Validation

```bash
npm install
npm run validate
```

Validates both marketplaces, all Claude and Cursor `plugin.json` manifests, matching plugin lists, that every declared source path exists, and that declared `skills` / `agents` / `rules` / `mcpServers` paths exist (including `SKILL.md` in every skill directory).

## Evals

```bash
npm run eval
```

Checks that every skill/agent's `description` is actually discoverable — that a realistic user
prompt scores it above its siblings in the same plugin — and that every skill/agent on disk has a
case (and that every marketplace plugin that ships skills/agents has a suite). Runs offline, no
API key required. See [evals/README.md](evals/README.md) for the case format and scoring method.

---

## Adding a plugin

1. Create `<plugin-name>/` at repo root, or under `app-dev-kit/` for the spec → prototype → build family. Marketplace `source` must match that directory (e.g. `./app-dev-kit/spec-dev-kit`).
2. Add matching `<plugin-name>/.claude-plugin/plugin.json` and `<plugin-name>/.cursor-plugin/plugin.json`
3. Add component directories
4. Register in both `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json`
5. Add `evals/cases/<plugin-name>.json` with a case per skill (and `evals/cases/<plugin-name>-agents.json` when the kit ships agents)
6. Run `npm run validate && npm run eval`

Adding a skill or agent to an existing plugin, or changing its `description`, requires the same
eval-case step. See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## References

- [Claude Code plugins docs](https://docs.anthropic.com/en/docs/claude-code/plugins)
- [Claude Code community plugins](https://github.com/anthropics/claude-plugins-community)
- [Cursor plugins docs](https://cursor.com/docs/plugins)
- [Cursor plugins reference](https://cursor.com/docs/reference/plugins)
- [Cursor rules docs](https://docs.cursor.com/context/rules)
- [Agent Skills open standard](https://agentskills.io)
