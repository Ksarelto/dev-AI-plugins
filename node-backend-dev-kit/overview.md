# node-backend-dev-kit

Rules, skills, and MCP. No `agents/`, no `commands/`, no hooks.

Inventory, globs, and stack: [README.md](README.md). Eleven rules, all `alwaysApply: false`, with globs on
backend layer folders (`src/controllers/`, `src/repositories/`, `src/db/`, `tests/integration/`, …) so they
do not attach to frontend files. `rules/stack.mdc` is the canonical stack list.

Cursor auto-attaches `rules/*.mdc`. Claude Code does not load `.mdc` files; [CLAUDE.md](CLAUDE.md) is the
condensed digest, and `skills/code-review` reads the matching rule files itself.

Source of truth for every example: `backend-boilerplate/` at the marketplace root. `scaffold-service` copies
it; `express-resource` extends it with a verified `projects` slice. `node-agent-dev-kit` builds on this kit.
