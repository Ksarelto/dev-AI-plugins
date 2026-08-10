# dev-cursor-plugins

A plugin marketplace with reusable **skills**, **rules**, **commands**, and **agents** for **Claude Code** and **Cursor**.

## Plugins

| Plugin | Components | Description |
|--------|-----------|-------------|
| [base-dev-kit](base-dev-kit/) | Rules + Skills | Honesty + security rules (always applied); clean code, git workflow, TDD, dependencies, documentation skills |

## Claude Code

### Install the marketplace

```bash
# Add this repo as a marketplace source (once per machine)
/plugin marketplace add artsiommurashko/dev-cursor-plugins
```

This makes all plugins available for install in any project.

### Install individual plugins

```bash
# In any Claude Code session
/plugin install base-dev-kit@dev-cursor-plugins
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
/add-plugin https://github.com/Ksarelto/dev-cursor-plugins
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
  cases/<plugin-name>.json  # Prompt -> expected skill/agent per plugin
  runner.mjs
<plugin>/
  .claude-plugin/
    plugin.json             # Claude Code plugin manifest
  .cursor-plugin/
    plugin.json             # Cursor plugin manifest (same paths)
  agents/                   # Subagent definitions
  skills/                   # Skill definitions (SKILL.md per skill)
  commands/                 # Slash command definitions
  rules/                    # Cursor .mdc rule files
  .mcp.json                 # MCP server configs (where applicable)
```

---

## Validation

```bash
npm install
npm run validate
```

Validates both marketplaces, all Claude and Cursor `plugin.json` manifests, matching plugin lists, and that every declared source path exists.

## Evals

```bash
npm run eval
```

Checks that every skill/agent's `description` is actually discoverable — that a realistic user
prompt scores it above its siblings in the same plugin. Runs offline, no API key required. See
[evals/README.md](evals/README.md) for the case format and scoring method.

---

## Adding a plugin

1. Create `<plugin-name>/` at repo root
2. Add matching `<plugin-name>/.claude-plugin/plugin.json` and `<plugin-name>/.cursor-plugin/plugin.json`
3. Add component directories
4. Register in both `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json`
5. Add `evals/cases/<plugin-name>.json` with a case per skill/agent
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
