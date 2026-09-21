# scaffold-agent examples

Copy these as ESM TypeScript. Confirm OpenRouter header names and model slugs via Context7 before shipping.

## package.json (minimum)

```json
{
  "name": "agent-service",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "eval": "vitest run tests/eval"
  },
  "dependencies": {
    "openai": "^5",
    "zod": "^3"
  },
  "devDependencies": {
    "@types/node": "^22",
    "tsx": "^4",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

Add `@openai/agents` for the default runtime, LangGraph packages for the graph path, `@qdrant/js-client-rest` for RAG. Pin versions at scaffold time from current npm, not from this example.

## .env.example

```
OPENROUTER_API_KEY=
APP_URL=http://localhost:3000
APP_NAME=agent-service
MODEL_REASON=
MODEL_GENERATE=
MODEL_EXTRACT=
MODEL_EMBED=
```

## src/config/env.ts

```ts
import { z } from "zod";

const Env = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  APP_URL: z.string().default(""),
  APP_NAME: z.string().default(""),
  MODEL_REASON: z.string().optional(),
  MODEL_GENERATE: z.string().optional(),
  MODEL_EXTRACT: z.string().optional(),
  MODEL_EMBED: z.string().optional(),
});

export const env = Env.parse(process.env);
```

## src/llm/client.ts

```ts
import OpenAI from "openai";
import { env } from "../config/env.js";

export const openai = new OpenAI({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  timeout: 30_000,
  maxRetries: 3,
  defaultHeaders: {
    "HTTP-Referer": env.APP_URL,
    "X-OpenRouter-Title": env.APP_NAME,
  },
});
```

## src/llm/models.ts

Slugs below are illustrative. Confirm on OpenRouter, then pin.

```ts
import { env } from "../config/env.js";

export const models = {
  reason: env.MODEL_REASON ?? "openai/gpt-4.1",
  generate: env.MODEL_GENERATE ?? "openai/gpt-4.1",
  extract: env.MODEL_EXTRACT ?? "openai/gpt-4.1-mini",
  embed: env.MODEL_EMBED ?? "openai/text-embedding-3-small",
} as const;
```

## src/observability/tracing.ts (Agents SDK)

```ts
import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import { openai } from "../llm/client.js";

setDefaultOpenAIClient(openai);
setOpenAIAPI("chat_completions");
setTracingDisabled(true); // OpenRouter key ≠ OpenAI dashboard
```

## src/llm/langgraph-model.ts (graph path only)

```ts
import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config/env.js";
import { models } from "./models.js";

export function createGraphModel(role: keyof typeof models = "reason") {
  return new ChatOpenAI({
    model: models[role],
    apiKey: env.OPENROUTER_API_KEY,
    temperature: 0,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": env.APP_URL,
        "X-OpenRouter-Title": env.APP_NAME,
      },
    },
  });
}
```

## src/tools/registry.ts

```ts
import type { FunctionTool } from "@openai/agents";

const tools = new Map<string, FunctionTool>();

export function registerTool(t: FunctionTool) {
  tools.set(t.name, t);
}

export function getTools(names: string[]): FunctionTool[] {
  return names.map((n) => {
    const t = tools.get(n);
    if (!t) throw new Error(`unknown_tool:${n}`);
    return t;
  });
}
```
