# frontend-dev-kit

Rules, skills, and MCP. No `agents/` directory and no `commands/`.

Inventory, globs, and stack: [README.md](README.md). Nine rules; `honesty` is the only `alwaysApply: true` rule. There is no `stack.mdc` here — the stack is the README's stack assumptions.

Cursor auto-attaches `rules/*.mdc`. Claude Code does not load `.mdc` files; `skills/code-review` reads the matching rule files itself.

`feature-dev-kit` requires this plugin (conventions, `architecture-audit`, `testing`).
