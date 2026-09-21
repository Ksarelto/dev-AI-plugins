---
name: embed-agent
description: Embed an @openai/agents chat route into an existing Express HTTP app. Merge optional OPENROUTER_API_KEY (503 if unset), Zod request body, OpenAPI path, auth, inject host services through RunContext, mount the router in compose.ts. Use when compose.ts already exists. Do not overwrite host env, tracing, or index.ts.
---

# Embed an agent in a host app

## When to use

- The process already has HTTP (`compose.ts`, Express, Fastify) and a composition root
- You need a chat route that calls host services, not a new `package.json`

Use `scaffold-agent` for a greenfield agent service (no host `env.ts` / entry). Use `openai-agents-sdk` after the route and client exist to fill in `Agent` / `run()` / guardrails. Use `tool-design` for each tool.

Defer libraries to `rules/stack.mdc`.

## Procedure

1. Confirm a composition root (`compose.ts` or equivalent). Do **not** replace host `config/env.ts`, `observability/tracing.ts`, or `index.ts`.
2. Merge **optional** `OPENROUTER_API_KEY`, `APP_URL`, `APP_NAME`, `MODEL_REASON` into the host schema. Treat `""` as unset. If the host uses `.strict()`, pick known keys — do not `parse(process.env)` (PATH/VITEST will fail).
3. Add `src/llm/client.ts` that returns `null` when the key is missing. Add `src/llm/models.ts` if absent. Wire Agents SDK in a **new** file (`observability/agents-tracing.ts`), not by overwriting host tracing.
4. Add deps: `openai`, `@openai/agents`. Pin at implement time. Host Zod 3 + SDK Zod 4 is a dual — see [references/host-app.md](./references/host-app.md).
5. Tools take host **services** via `RunContext`, never a global `db`. Add a **search** method on the host service instead of paging `list()`.
6. Mount `POST .../chat` behind the host auth middleware. Return **503** when the key is unset so existing tests still boot. Lazy-import the agent module so `@openai/agents` is not loaded on every request path.
7. OpenAPI path + Zod body. Tests: 401 / 422 / 503 / mocked `runChat` 200. No live OpenRouter in CI.

## Checklist

- [ ] Host `env.ts` / tracing / entry not overwritten
- [ ] Key optional; empty string = unset; 503 without key
- [ ] Tools inject services + actor through `RunContext`
- [ ] Search/list methods exist on the host service (no catalog dump)
- [ ] Router lazy-imports the agent; HTTP layer does not import `@openai/agents`
- [ ] Hermetic tests (mocked run); live smoke is manual

## References

- [examples.md](./examples.md) — Express router, OpenAPI, mocked tests, optional client
- [references/host-app.md](./references/host-app.md) — env pick, Zod dual, `run()` vs `Runner.run`
