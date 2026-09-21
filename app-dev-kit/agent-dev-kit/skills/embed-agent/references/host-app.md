# Host-app overlay

Greenfield layout is `scaffold-agent`. This overlay is what you add when `compose.ts` (or another HTTP composition root) already exists.

```
src/
  config/env.ts                 # MERGE optional OpenRouter keys; do not replace
  llm/client.ts                 # getOpenAI(): OpenAI | null
  llm/models.ts                 # add if missing
  observability/tracing.ts      # leave host OTel alone
  observability/agents-tracing.ts
  agents/<name>/{agent,instructions,guardrails,context}.ts
  tools/{registry.ts,<tool>.ts}
  http/routers/<assistant>.ts   # lazy-import the agent
  schemas/<assistant>.ts
  index.ts                      # unchanged
```

## Env: optional key + `.strict()`

Agent-only processes require `OPENROUTER_API_KEY` at parse time (`scaffold-agent`).

Embedded agents must **not** fail process start when the key is missing — the rest of the API has to boot (Testcontainers, `/healthz`). Treat `""` as unset. Return **503** from the chat route.

If the host schema is `.strict()`, do not `Env.parse(process.env)` — OS and Vitest keys (`PATH`, `VITEST`, …) are unknown. Pick the schema keys:

```ts
const optionalKey = z
  .string()
  .optional()
  .transform((s) => (s && s.length > 0 ? s : undefined));

export const env = Env.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  APP_URL: process.env.APP_URL,
  APP_NAME: process.env.APP_NAME,
  MODEL_REASON: process.env.MODEL_REASON,
  // …other host keys
});
```

## `run()` is not `Runner.run`

In `@openai/agents` (JS 0.18), `Runner.run` is an **instance** method. The Python SDK’s static `Runner.run` is not on the class. Use the exported `run()` helper (or `new Runner().run()`):

```ts
import { Agent, run } from "@openai/agents";

const result = await run(agent, message, { maxTurns: 10, context });
```

Always pass `maxTurns`.

`defineInputGuardrail` exists in `agents-core` but is **not** re-exported from `@openai/agents`. Use an `InputGuardrail` object (`{ name, execute }`). Catch trips by `error.name === "InputGuardrailTripwireTriggered"` in the HTTP layer so the router does not import the SDK.

## Zod 3 host + Zod 4 SDK

`@openai/agents` ≥0.18 peers `zod@^4`. A Zod 3 host (`zod-to-openapi@7`, existing HTTP schemas) cannot hoist that peer — the SDK crashes at import (`z.enum` discriminator) and `tool({ parameters })` types expect Zod 4 objects.

Do **not** rely on npm `overrides` for a peer; they will not nest. Dual:

1. Keep host `zod@^3`.
2. Add `zod-4` as `npm:zod@^4`.
3. `postinstall` copy it to `node_modules/@openai/agents-core/node_modules/zod`.
4. Cast host Zod 3 schemas when passing `parameters` into `tool()`.
5. Lazy-import the agent from the router so other HTTP tests never load the SDK.

Alternatively bump the **whole host** to Zod 4 and a Zod-4 OpenAPI helper. Do not mix Completions/Responses; still `setOpenAIAPI("chat_completions")`.

## Tools

Inject host services and the authenticated user through `RunContext`. Tools must not import Drizzle or a global `db`. Add `search({ q, limit })` on the host service — do not loop `list()` over the catalog.

Write tools use `req.user` as actor; catch `AppError` into `{ error }`.
