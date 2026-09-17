# embed-agent examples

Worked from embedding a campus librarian into an existing Express 5 app (`compose.ts` composition root). Copy the shapes, not the domain names.

## Optional OpenRouter client

```ts
import OpenAI from "openai";
import { env } from "../config/env.js";

let client: OpenAI | null | undefined;

export function getOpenAI(): OpenAI | null {
  if (client !== undefined) return client;
  if (!env.OPENROUTER_API_KEY) {
    client = null;
    return null;
  }
  client = new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 30_000,
    maxRetries: 3,
    defaultHeaders: {
      "HTTP-Referer": env.APP_URL,
      "X-OpenRouter-Title": env.APP_NAME,
    },
  });
  return client;
}
```

## Agents SDK wiring (new file — do not replace host tracing)

```ts
import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import { getOpenAI } from "../llm/client.js";

let wired = false;

export function wireAgentsSdk(): boolean {
  if (wired) return true;
  const openai = getOpenAI();
  if (!openai) return false;
  setDefaultOpenAIClient(openai);
  setOpenAIAPI("chat_completions");
  setTracingDisabled(true);
  wired = true;
  return true;
}
```

## Express POST + 503 + mocked run

Do not import `@openai/agents` from the router. Catch guardrail trips by `error.name`. Lazy-import the runner so the rest of the API boots on Zod 3.

```ts
import { Router, type RequestHandler } from "express";
import { validate } from "../middleware/validate.js";
import { AssistantChatBody } from "../../schemas/assistant.js";
import { BadRequestError, ServiceUnavailableError } from "../../errors/app-error.js";
import type { LibrarianContext } from "../../agents/campus-librarian/context.js";

type RunChat = (message: string, context: LibrarianContext) => Promise<string>;

function isInputGuardrailTrip(err: unknown): boolean {
  return Boolean(err) && typeof err === "object" && (err as { name?: string }).name === "InputGuardrailTripwireTriggered";
}

async function defaultRunChat(message: string, context: LibrarianContext) {
  const { runCampusLibrarian } = await import("../../agents/campus-librarian/agent.js");
  return runCampusLibrarian(message, context);
}

export function createAssistantRouter(opts: {
  books: unknown;
  loans: unknown;
  authed: RequestHandler;
  enabled: boolean;
  runChat?: RunChat;
}) {
  const runChat = opts.runChat ?? defaultRunChat;
  const router = Router();
  router.post("/chat", opts.authed, validate({ body: AssistantChatBody }), async (req, res, next) => {
    try {
      if (!opts.enabled) {
        throw new ServiceUnavailableError("Assistant is not configured (OPENROUTER_API_KEY)");
      }
      const reply = await runChat(req.body.message, {
        user: req.user!,
        books: opts.books,
        loans: opts.loans,
      } as LibrarianContext);
      res.json({ reply });
    } catch (err) {
      if (isInputGuardrailTrip(err)) {
        next(new BadRequestError("Message rejected by assistant guardrail"));
        return;
      }
      next(err);
    }
  });
  return router;
}
```

Mount in the composition root:

```ts
router.use(
  "/assistant",
  createAssistantRouter({
    books,
    loans,
    authed,
    enabled: Boolean(env.OPENROUTER_API_KEY),
  }),
);
```

## Zod body + OpenAPI

```ts
export const AssistantChatBody = z.object({ message: z.string().min(1).max(4000) }).strict();
export const AssistantChatResponse = z.object({ reply: z.string() }).strict();
```

Register `POST /api/v1/assistant/chat` with 200 / 401 / 400 (guardrail) / 503.

## Hermetic tests (no live OpenRouter)

```ts
it("returns 401 without a token", async () => { /* POST /assistant/chat */ });
it("returns 422 on an empty body", async () => { /* {} */ });
it("returns 503 when OpenRouter is not configured", async () => {
  /* enabled: false */
});
it("returns the mocked runner reply when enabled", async () => {
  const runChat = vi.fn(async () => "Dune is on the shelf.");
  /* enabled: true, runChat */
});
```

Inject `runChat` so CI never calls OpenRouter. A live smoke against a seeded row is manual when `OPENROUTER_API_KEY` is present.
