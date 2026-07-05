# dev-cursor-plugins

A Cursor-native multi-plugin marketplace with reusable **skills**, **rules**, **commands**, and **agents** for use across all projects.

## Plugins

| Plugin | Type | Description |
|--------|------|-------------|
| [typescript-rules](typescript-rules/) | Rules | TypeScript coding standards |
| [engineering-skills](engineering-skills/) | Skills | Commit messages, PR descriptions |
| [workflow-commands](workflow-commands/) | Commands | Review changes, summarize diffs |
| [code-review-kit](code-review-kit/) | Agents + Skills | Code reviewer agent and security review skill |
| [dev-kit](dev-kit/) | Rules + Skills + Commands + Agent + MCP | React + TypeScript + antd + vanilla-extract + react-query |

## Local install (cross-project)

Install the entire marketplace so all plugins are available in every workspace:

```bash
ln -s /Users/Artsiom_Murashko/Documents/Own/dev-cusor-plugins ~/.cursor/plugins/local/dev-cursor-plugins
```

Then reload the Cursor window (Command Palette → "Developer: Reload Window").

### Install a single plugin

Symlink an individual plugin directory instead:

```bash
ln -s /Users/Artsiom_Murashko/Documents/Own/dev-cusor-plugins/typescript-rules ~/.cursor/plugins/local/typescript-rules
```

## Component discovery

Cursor auto-discovers components when manifest paths are omitted:

| Component | Default location |
|-----------|------------------|
| Skills | `skills/*/SKILL.md` |
| Rules | `rules/*.{md,mdc,markdown}` |
| Agents | `agents/*.{md,mdc,markdown}` |
| Commands | `commands/*.{md,mdc,markdown,txt}` |
| Hooks | `hooks/hooks.json` |
| MCP | `mcp.json` |

If a manifest field is specified (e.g. `"rules": "./rules/"`), it replaces folder discovery for that component.

## Usage examples

- **Rules** apply automatically when editing matching files (e.g. `**/*.ts`)
- **Skills** trigger in agent chat when relevant to the task
- **Commands** are invoked via slash commands, namespaced by plugin (e.g. `/workflow-commands:review-changes`)
- **Agents** are available from the agent picker for delegation

## Validation

```bash
npm install
npm run validate
```

Validates `marketplace.json`, all `plugin.json` manifests, and that source paths exist.

## Adding a new plugin

1. Create a directory at the repo root (kebab-case name)
2. Add `{plugin}/.cursor-plugin/plugin.json`
3. Add component files (`rules/`, `skills/`, `commands/`, `agents/`)
4. Register the plugin in `.cursor-plugin/marketplace.json`
5. Run `npm run validate`

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## Publish to Cursor Marketplace

1. Push this repo to a public Git repository
2. Ensure all manifests pass `npm run validate`
3. Submit the repository URL at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)

## References

- [Cursor Plugins Reference](https://cursor.com/docs/reference/plugins)
- [Cursor Marketplace](https://cursor.com/marketplace)
- Official schemas: [cursor/plugins/schemas](https://github.com/cursor/plugins/tree/main/schemas)
