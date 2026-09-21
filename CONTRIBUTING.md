# Contributing

## Adding a plugin

1. Create a new directory using **kebab-case** (e.g. `my-new-plugin`) at the repo root, or under `app-dev-kit/` for the spec → prototype → build family. Marketplace `source` must match that directory.
2. Add **both** harness manifests with the same fields and component paths:
   - `.claude-plugin/plugin.json`
   - `.cursor-plugin/plugin.json`
3. Add component files in the appropriate directories (`rules/`, `skills/`, `agents/`, `commands/`, optional `.mcp.json`)
4. Register the plugin in **both** marketplaces:
   - `.claude-plugin/marketplace.json`
   - `.cursor-plugin/marketplace.json`
5. Add an eval suite in `evals/cases/<plugin-name>.json` — one case per skill. Multi-agent kits also add `evals/cases/<plugin-name>-agents.json` with one case per agent (see [evals/README.md](evals/README.md))
6. Run `npm run validate` and `npm run eval` before submitting

## Adding a skill or agent to an existing plugin

Whenever you add a new skill or agent (or change one's `description`), add or update its case in
`evals/cases/<plugin-name>.json` (skills) or `evals/cases/<plugin-name>-agents.json` (agents) in the
same change. An undiscoverable skill — one whose description doesn't match how a user would actually
ask for it — is a bug even if `npm run validate` passes.
See [evals/README.md](evals/README.md) for the case format.

Content is shared; only the manifest directories differ. Keep the two `plugin.json` files in sync when you change metadata or paths.

## Naming conventions

- Plugin names: lowercase, kebab-case (e.g. `typescript-rules`)
- Skill names: lowercase, kebab-case, max 64 characters
- Agent names: lowercase, kebab-case
- Command names: lowercase, kebab-case

## Required frontmatter

See [AGENTS.md](AGENTS.md) for the full frontmatter reference (fields, requiredness, examples) for
rules, skills, commands, and agents, plus the creation flow and orchestration patterns.

## Claude Code submission checklist and marketplace publishing

- [ ] Plugin has valid `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` manifests
- [ ] Both manifests use the same `name` and component paths
- [ ] `name` is unique, lowercase, kebab-case
- [ ] `description` clearly explains the plugin's purpose
- [ ] All rules, skills, agents, and commands have proper frontmatter
- [ ] `README.md` documents usage for the plugin
- [ ] All paths in manifests are relative and valid
- [ ] Plugin registered in both `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json`
- [ ] Eval suite added at `evals/cases/<plugin-name>.json` (and `<plugin-name>-agents.json` when the kit ships agents) with a case per skill/agent
- [ ] `npm run validate` passes
- [ ] `npm run eval` passes

Submit at [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit).

### Cursor submission checklist and marketplace publishing

See the [official submission checklist](https://cursor.com/docs/reference/plugins#submission-checklist) and submit at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).

## Local Cursor testing

```bash
npm run install:cursor-local
# Developer: Reload Window in Cursor
```
