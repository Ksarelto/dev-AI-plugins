# Tools and handoffs

## `tool()` + Zod

Parameter schemas must be Zod objects. Return a structured object with `error: string | null`. Do not throw for “not found”.

```ts
import { tool } from "@openai/agents";
import { z } from "zod";

const OrderData = z.object({
  id: z.string(),
  status: z.string(),
  total: z.number(),
  error: z.string().nullable(),
});

export const getOrder = tool({
  name: "get_order",
  description:
    "Fetch order details by id. Idempotent. Do NOT use for payment status — use get_payment.",
  parameters: z.object({
    orderId: z.string().describe("Order UUID"),
  }),
  execute: async ({ orderId }, run) => {
    const order = await run!.context.orders.get(orderId);
    if (!order) {
      return { id: orderId, status: "not_found", total: 0, error: "Order not found" };
    }
    return { id: order.id, status: order.status, total: order.total, error: null };
  },
});
```

## Max turns

Always pass `maxTurns` into `run()` (e.g. 10–15). Relying on the SDK default is the same bug as omitting `iteration` on a graph.

## Handoff vs tool

A **handoff** transfers the rest of the run to another agent (its instructions and tools). A **tool** returns data to the current agent. Use handoffs for specialists; tools for a piece of data or a side effect.

```ts
import { handoff } from "@openai/agents";
import { z } from "zod";

handoff(billingAgent, {
  toolNameOverride: "transfer_to_billing",
  toolDescriptionOverride: "Use when the user asks about charges, invoices, or refunds.",
  inputType: z.object({
    orderId: z.string().optional(),
    question: z.string(),
  }),
});
```

Pass artifacts in `inputType`, not the full transcript.

## Run context

Use typed `context` for `userId`, **host services**, feature flags — not as LLM-visible state. Tools must not import a global `db`.

```ts
type AppContext = { userId: string; orders: OrderService };

execute: async ({ orderId }, run) => {
  const orders = run!.context.orders;
  const order = await orders.get(orderId);
  // …
}

const result = await run(agent, "What are my orders?", {
  maxTurns: 10,
  context: { userId: "u_123", orders } satisfies AppContext,
});
```

Do not page a whole catalog with `list()`. Add `search({ q, limit })` on the host service.
