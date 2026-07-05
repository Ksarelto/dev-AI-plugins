# React Dev Kit

Cursor plugin for building React applications with **TypeScript**, **antd**, **vanilla-extract**, and **react-query**.

## Install

Install the full marketplace or this plugin alone:

```bash
# Full marketplace
ln -s /path/to/dev-cusor-plugins ~/.cursor/plugins/local/dev-cursor-plugins

# This plugin only
ln -s /path/to/dev-cusor-plugins/dev-kit ~/.cursor/plugins/local/dev-kit
```

Reload Cursor (Command Palette → "Developer: Reload Window").

## Components

### Rules

Auto-apply when editing matching files. Each rule links to few-shot examples in `examples/rules/`.

| Rule | Globs | Topic |
|------|-------|-------|
| `project-structure` | `src/**/*` | Feature folders, naming, barrels |
| `react-components` | `**/*.{tsx}` | Component patterns, composition |
| `typescript-react` | `**/*.{ts,tsx}` | Strict typing, events, generics |
| `antd-usage` | `**/*.{tsx}` | antd components, forms, a11y |
| `vanilla-extract` | `**/*.css.ts` | Tokens, recipes, styling |
| `react-query` | `**/api/**`, `**/hooks/use*.ts` | Query keys, hooks, mutations |

### Skills

Workflow guides with few-shot templates in each skill's `examples.md`.

| Skill | Use when |
|-------|----------|
| `react-feature` | Building a new page or feature slice |
| `react-query-hook` | Creating query or mutation hooks |
| `vanilla-extract-styles` | Styling a component |
| `antd-form` | Building forms with validation |
| `stack-docs` | Fetching current library docs via Context7 |
| `browser-debug` | UI verification and debugging via Chrome |

### Commands

Slash commands (namespaced by plugin):

| Command | Purpose |
|---------|---------|
| `/dev-kit:scaffold-component` | Create component folder with styles and types |
| `/dev-kit:create-query-hook` | Create query key + hook + types |
| `/dev-kit:scaffold-feature` | Scaffold full feature folder structure |

### Agent

**react-implementer** — delegates feature implementation following all dev-kit rules and skills.

### MCP Servers

Bundled in `mcp.json` and loaded when the plugin is installed:

| Server | Purpose |
|--------|---------|
| `context7` | Fetch current docs for React, antd, vanilla-extract, react-query |
| `chrome-devtools` | Connect to Chrome for UI debugging and verification |

**Context7 setup:** set `CONTEXT7_API_KEY` in your environment, or add the key in Cursor Settings → Tools & MCP after install. Get a key at [context7.com](https://context7.com).

**Chrome DevTools setup:**
1. Use Chrome 144+ and enable remote debugging at `chrome://inspect/#remote-debugging`
2. Keep Chrome open with your dev app; approve the debugging permission when prompted
3. Requires Node.js/npx for the local MCP process

### MCP Skills

| Skill | MCP server | Use when |
|-------|------------|----------|
| `stack-docs` | context7 | Library API questions, setup, verifying current syntax |
| `browser-debug` | chrome-devtools | UI verification, console/network debugging |

## Few-shot examples

Rules and skills keep guidance concise. Templates live in companion files:

- **Rules** → `examples/rules/{rule-name}.md` (bad/good pairs)
- **Skills** → `skills/{skill-name}/examples.md` (full scenario templates)

The agent and commands instruct Cursor to read these files when generating code.

## Stack assumptions

- React 18+
- TypeScript (strict)
- antd 5+
- `@vanilla-extract/css` (+ `recipes`, `sprinkles` as needed)
- `@tanstack/react-query` v5
