# node-agent-dev-kit

Rules, skills, and MCP. No `agents/` directory, no `commands/`, no hooks.

Inventory, globs, and stack: [README.md](README.md). Nine rules, all `alwaysApply: false`, with globs limited to agent folders (`src/agents`, `src/llm`, `src/rag`, `src/memory`, `src/guardrails`, knowledge schema and repository, agent tests, `evals/`). `rules/stack.mdc` is the canonical stack list for the agent layer.

Cursor auto-attaches `rules/*.mdc`. Claude Code does not load `.mdc` files; [CLAUDE.md](CLAUDE.md) is the same rules as one digest, and every skill names the rules it depends on.

Requires `node-backend-dev-kit` for the HTTP core (layering, validation, errors, auth, Drizzle, logging, resilience, Docker, HTTP tests). Reference implementation: `agent-boilerplate/`.
