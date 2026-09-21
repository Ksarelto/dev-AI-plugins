# tool-design examples

Same Zod schemas; wrap with `tool()` from `@openai/agents` or `@langchain/core/tools`.

## Read vs write pair (`@openai/agents`)

```ts
import { tool } from "@openai/agents";
import { z } from "zod";

const OrderData = z.object({
  id: z.string(),
  status: z.string(),
  total: z.number(),
  items: z.array(z.unknown()),
  error: z.string().nullable(),
});

export const getOrder = tool({
  name: "get_order",
  description:
    "Fetch order details by id. Idempotent. Use for status, items, total. Do NOT use for payment status — use get_payment.",
  parameters: z.object({
    orderId: z.string().describe("Order UUID"),
  }),
  execute: async ({ orderId }, run) => {
    try {
      const order = await run!.context.orders.get(orderId);
      if (!order) {
        return { id: orderId, status: "not_found", total: 0, items: [], error: "Order not found" };
      }
      return { id: order.id, status: order.status, total: order.total, items: order.items, error: null };
    } catch (err) {
      return { id: orderId, status: "error", total: 0, items: [], error: String(err) };
    }
  },
});

export const cancelOrder = tool({
  name: "cancel_order",
  description:
    "Cancel an order. IRREVERSIBLE. Call only after the user confirmed. Do NOT call if already shipped — use initiate_return. reason is required for audit.",
  parameters: z.object({
    orderId: z.string(),
    reason: z.string().min(1),
  }),
  execute: async ({ orderId, reason }) => {
    try {
      const result = await orders.cancel(orderId, reason);
      return { success: true, message: "Cancelled", refundAmount: result.refund, error: null };
    } catch (err) {
      return { success: false, message: String(err), refundAmount: null, error: String(err) };
    }
  },
});
```

Graph path: wrap `cancel_order` execution behind `interruptBefore: ["tools"]` (or a dedicated write node). Agents SDK path: confirmation guardrail — see `openai-agents-sdk` guardrails reference.

## Knowledge-base tool (wraps `src/rag`)

```ts
export const searchKnowledgeBase = tool({
  name: "search_knowledge_base",
  description:
    "Search internal docs for policies and how-tos. Do NOT use for real-time stock, order status, or personal account data.",
  parameters: z.object({
    query: z.string(),
    category: z.enum(["policy", "technical", "billing"]).optional(),
    maxResults: z.number().int().min(1).max(20).default(5),
  }),
  execute: async ({ query, category, maxResults }) => {
    try {
      const result = await retrieve({ query, category, limit: maxResults });
      return {
        snippets: result.chunks.map((c) => c.text),
        sources: result.chunks.map((c) => c.source),
        confidence: result.avgScore,
        error: null,
      };
    } catch (err) {
      return { snippets: [], sources: [], confidence: 0, error: String(err) };
    }
  },
});
```

Tools do not call `openai` themselves. Retrieval belongs in `src/rag/retrieve.ts`. Inject host services through `RunContext`; do not import a global `db`. If the catalog is large, add `search({ q, limit })` on the service — do not loop `list()`.
