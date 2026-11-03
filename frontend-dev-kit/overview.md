# frontend-dev-kit

Rules, skills, one command (`/frontend-dev-kit:review`), and MCP. No `agents/` directory.

Inventory, globs, and stack: [README.md](README.md). Nine rules; `honesty` is the only `alwaysApply: true` rule. There is no `stack.mdc` here — the stack is the README's stack assumptions.

Cursor auto-attaches `rules/*.mdc`. Claude Code does not load `.mdc` files; `skills/code-review` reads the matching rule files itself.
