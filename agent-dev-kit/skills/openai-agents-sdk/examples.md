# openai-agents-sdk examples

Wire OpenRouter once at startup (`scaffold-agent` `tracing.ts` or `embed-agent` `agents-tracing.ts`) before any `run()`. Confirm `@openai/agents` APIs via Context7 — names below match the JS SDK (`tool`, `Agent`, `run`, `handoff`). `Runner.run` is an instance method, not static.

## Minimal tool loop

```ts
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import { models } from "../../llm/models.js";

const add = tool({
  name: "add",
  description: "Add two integers. Do not use for other arithmetic.",
  parameters: z.object({
    a: z.number().int(),
    b: z.number().int(),
  }),
  execute: async ({ a, b }) => ({ sum: a + b, error: null }),
});

const agent = new Agent({
  name: "math_helper",
  instructions: "Use the add tool for addition. Do not guess sums.",
  model: models.reason,
  tools: [add],
});

const result = await run(agent, "What is 42 + 58?", { maxTurns: 8 });
console.log(result.finalOutput);
```

## Structured outputType

```ts
import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { models } from "../../llm/models.js";

const TicketTriage = z.object({
  category: z.enum(["billing", "technical", "account"]),
  priority: z.enum(["low", "medium", "high"]),
  summary: z.string(),
});

const triageAgent = new Agent({
  name: "ticket_triage",
  instructions: "Classify the ticket. One-sentence summary.",
  model: models.extract,
  outputType: TicketTriage,
});

export async function triage(ticketText: string) {
  const result = await run(triageAgent, ticketText, { maxTurns: 4 });
  return TicketTriage.parse(result.finalOutput);
}
```

## Handoffs

```ts
import { Agent, run, handoff } from "@openai/agents";
import { models } from "../../llm/models.js";
import { getInvoice, issueRefund, searchKnowledgeBase } from "../../tools/registry.js";

const billingAgent = new Agent({
  name: "billing_agent",
  instructions: "Handle charges, refunds, invoices. Use billing tools only.",
  model: models.reason,
  tools: [getInvoice, issueRefund],
});

const technicalAgent = new Agent({
  name: "technical_agent",
  instructions: "Handle bugs and how-to questions from the knowledge base.",
  model: models.reason,
  tools: [searchKnowledgeBase],
});

const triageAgent = new Agent({
  name: "triage_agent",
  instructions: "Hand off to billing_agent or technical_agent. Do not answer yourself.",
  model: models.extract,
  handoffs: [
    handoff(billingAgent),
    handoff(technicalAgent),
  ],
});

export async function handleSupport(message: string, session: unknown) {
  const result = await run(triageAgent, message, { maxTurns: 15, session });
  return result.finalOutput;
}
```
