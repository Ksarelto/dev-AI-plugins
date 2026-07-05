# Contributing

## Adding a plugin

1. Create a new directory at the repo root using **kebab-case** (e.g. `my-new-plugin`)
2. Add `.cursor-plugin/plugin.json` with at least a `name` field
3. Add component files in the appropriate directories
4. Register the plugin in `.cursor-plugin/marketplace.json`
5. Run `npm run validate` before submitting

## Naming conventions

- Plugin names: lowercase, kebab-case (e.g. `typescript-rules`)
- Skill names: lowercase, kebab-case, max 64 characters
- Agent names: lowercase, kebab-case
- Command names: lowercase, kebab-case

## Required frontmatter

### Rules (`rules/*.mdc`)

```yaml
---
description: Brief description of what the rule does
alwaysApply: false
globs: "**/*.ts"
---
```

### Skills (`skills/*/SKILL.md`)

```yaml
---
name: my-skill
description: What the skill does and when to use it
---
```

### Commands (`commands/*.md`)

```yaml
---
description: What the command does
---
```

### Agents (`agents/*.md`)

```yaml
---
name: my-agent
description: When to delegate to this agent
---
```

## Submission checklist

- [ ] Plugin has a valid `.cursor-plugin/plugin.json` manifest
- [ ] `name` is unique, lowercase, kebab-case
- [ ] `description` clearly explains the plugin's purpose
- [ ] All rules, skills, agents, and commands have proper frontmatter
- [ ] `README.md` documents usage for the plugin
- [ ] All paths in manifest are relative and valid
- [ ] Plugin registered in `.cursor-plugin/marketplace.json`
- [ ] `npm run validate` passes

See the [official submission checklist](https://cursor.com/docs/reference/plugins#submission-checklist) for publishing to the Cursor Marketplace.
