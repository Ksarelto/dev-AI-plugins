# dev-cursor-plugins

A plugin marketplace of reusable **rules**, **skills**, **commands**, and **agents** that work in both
**Claude Code** and **Cursor**. One set of content, two manifests — install the same kit in either tool.

## Plugins

| Plugin | Contents |
|--------|----------|
| [base-dev-kit](base-dev-kit/) | Rules: `honesty` (always applied), `security` (OWASP Top 10:2025). Skills: `clean-code`, `dependencies`, `documentation`, `git-workflow`, `tdd`. Language- and stack-agnostic. |

Each plugin's own README lists its rules and skills in detail.

## Install — Claude Code

Add the marketplace once per machine:

```bash
/plugin marketplace add Ksarelto/dev-cusor-plugins
```

Then install a plugin in any session:

```bash
/plugin install base-dev-kit@dev-cursor-plugins
```

Rules load automatically; skills are invoked by name (`/base-dev-kit:tdd`) or picked up by the model
when the task matches the skill's description.

## Install — Cursor

From Agent chat:

```text
/add-plugin https://github.com/Ksarelto/dev-cusor-plugins
```

Or browse **Customize → Plugins** after adding the marketplace.

### Local install (for developing this repo)

```bash
npm install
npm run install:cursor-local     # symlinks each plugin into ~/.cursor/plugins/local/<plugin-name>
```

Then run **Developer: Reload Window** in Cursor and confirm the plugins under **Customize → Plugins**.
Enable third-party Plugins / Skills in Cursor Settings if prompted.

```bash
npm run uninstall:cursor-local   # remove the symlinks
node scripts/install-cursor-local.mjs --dry-run   # preview (add --uninstall to preview removals)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the authoring reference — component formats, frontmatter
fields, the rule-vs-skill split, naming conventions, validation, and the marketplace submission
checklists. AI coding agents working in this repo should start at [AGENTS.md](AGENTS.md).

## License

MIT.

## References

- [Claude Code plugins](https://docs.anthropic.com/en/docs/claude-code/plugins) · [community marketplace](https://github.com/anthropics/claude-plugins-community)
- [Cursor plugins](https://cursor.com/docs/plugins) · [plugins reference](https://cursor.com/docs/reference/plugins) · [rules](https://docs.cursor.com/context/rules)
- [Agent Skills open standard](https://agentskills.io)
