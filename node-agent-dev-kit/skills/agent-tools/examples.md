# Tool examples

Examples 1 to 3 are from `agent-boilerplate/src/agents/assistant/tools/`. Example 4 (a tool that needs the caller and an outside API) is an extension, typechecked and tested against the installed `@langchain/core` 1.3.

## Example 1: a deterministic, read-only tool

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/** A read-only, deterministic tool: the model cannot know the current date on its own. */
export function createCurrentTimeTool(now: () => Date = () => new Date()) {
  return tool(
    ({ timeZone }) => {
      try {
        return new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone,
        }).format(now());
      } catch {
        return `Unknown time zone "${timeZone}". Use an IANA name such as Europe/Warsaw.`;
      }
    },
    {
      name: 'get_current_time',
      description: 'Get the current date and time in an IANA time zone.',
      schema: z.object({ timeZone: z.string().min(1).max(64).default('UTC') }),
    },
  );
}
```

## Example 2: retrieval with an artifact and graceful degradation

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { asUntrustedDocument } from '../../../guardrails/input.js';
import { citationRef, type Citation } from '../../../guardrails/output.js';
import type { Logger } from '../../../lib/logger.js';
import { withTimeout } from '../../../lib/resilience.js';
import type { KnowledgeRetriever } from '../../../rag/retriever.js';

/** Carried on the ToolMessage (not shown to the model) so the service can build citations. */
export interface SearchArtifact {
  citations: Citation[];
  degraded: boolean;
}

export const UNAVAILABLE_MESSAGE =
  'The knowledge base is temporarily unavailable. Tell the user that sources could not be checked.';

export function createSearchKnowledgeTool(deps: {
  retriever: KnowledgeRetriever | undefined;
  topK: number;
  timeoutMs?: number;
  logger: Logger;
}) {
  return tool(
    async ({ query }): Promise<[string, SearchArtifact]> => {
      if (!deps.retriever) return [UNAVAILABLE_MESSAGE, { citations: [], degraded: true }];
      try {
        const results = await withTimeout(
          deps.retriever.search(query, deps.topK),
          deps.timeoutMs ?? 5_000,
          'knowledge search',
        );
        if (results.length === 0)
          return ['No matching documents were found.', { citations: [], degraded: false }];
        const content = results
          .map((chunk) =>
            asUntrustedDocument(
              { ref: citationRef(chunk.chunkId), title: chunk.title, source: chunk.source },
              chunk.content,
            ),
          )
          .join('\n\n');
        const citations = results.map(({ chunkId, documentId, title, source }) => ({
          chunkId,
          documentId,
          title,
          source,
        }));
        return [content, { citations, degraded: false }];
      } catch (error) {
        // Graceful degradation: the turn continues without retrieval and is flagged as degraded.
        deps.logger.warn({ err: error }, 'knowledge search failed');
        return [UNAVAILABLE_MESSAGE, { citations: [], degraded: true }];
      }
    },
    {
      name: 'search_knowledge',
      description:
        'Search the internal knowledge base (product docs, policies, FAQs). Use for any question about the product. Input is a short natural-language search query.',
      schema: z.object({ query: z.string().min(2).max(500).describe('What to search for') }),
      responseFormat: 'content_and_artifact',
    },
  );
}
```

The service reads the artifact back:

```ts
const artifacts = turn
  .filter((m): m is ToolMessage => m instanceof ToolMessage && m.name === 'search_knowledge')
  .map((m) => m.artifact as SearchArtifact | undefined)
  .filter((a): a is SearchArtifact => a !== undefined);
```

## Example 3: the registry

```ts
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { Logger } from '../../../lib/logger.js';
import type { KnowledgeRetriever } from '../../../rag/retriever.js';
import { createCurrentTimeTool } from './current-time.js';
import { createSearchKnowledgeTool } from './search-knowledge.js';

/**
 * The tool registry for this agent. Every tool is read-only; a tool that writes must ask
 * for confirmation (LangGraph `interrupt()`) before acting.
 */
export function createAssistantTools(deps: {
  retriever: KnowledgeRetriever | undefined;
  topK: number;
  logger: Logger;
}): StructuredToolInterface[] {
  return [createSearchKnowledgeTool(deps), createCurrentTimeTool()];
}
```

## Example 4: a caller-scoped lookup against another service

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { Logger } from '../../../lib/logger.js';
import { withTimeout } from '../../../lib/resilience.js';
import { requireUserId } from '../../run-config.js';

export interface OrderSummary {
  id: string;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  updatedAt: string;
}

/** Implemented with createResilientHttpClient (node-backend-dev-kit resilience skill), built in the container. */
export interface OrdersClient {
  findForUser(userId: string, orderId: string): Promise<OrderSummary | undefined>;
}

export interface OrderStatusArtifact {
  orderId: string | null;
  degraded: boolean;
}

export const ORDERS_UNAVAILABLE_MESSAGE =
  'The order system is temporarily unavailable. Tell the user the status could not be checked.';

export function createOrderStatusTool(deps: { orders: OrdersClient; timeoutMs?: number; logger: Logger }) {
  return tool(
    async ({ orderId }, config): Promise<[string, OrderStatusArtifact]> => {
      try {
        const order = await withTimeout(
          deps.orders.findForUser(requireUserId(config), orderId),
          deps.timeoutMs ?? 3_000,
          'order lookup',
        );
        if (!order) {
          return [`No order ${orderId} was found for this user.`, { orderId: null, degraded: false }];
        }
        return [
          `Order ${order.id} is ${order.status} (updated ${order.updatedAt}).`,
          { orderId: order.id, degraded: false },
        ];
      } catch (error) {
        deps.logger.warn({ err: error }, 'order lookup failed');
        return [ORDERS_UNAVAILABLE_MESSAGE, { orderId: null, degraded: true }];
      }
    },
    {
      name: 'get_order_status',
      description:
        "Look up the status of one of the current user's orders. Input is the order id, e.g. ORD-12345.",
      schema: z.object({
        orderId: z.string().regex(/^ORD-\d{5,10}$/).describe('Order id, e.g. ORD-12345'),
      }),
      responseFormat: 'content_and_artifact',
    },
  );
}
```

`requireUserId` is the helper from `graph-state-design` example 3; the service must add `user_id` to `configurable`. `toReply` should OR this artifact's `degraded` into the reply flag too.

Bad: identity from the model, no timeout, raw payload returned, exception escapes to `ToolNode`.

```ts
tool(async ({ userId, orderId }) => JSON.stringify(await fetch(`${ORDERS_URL}/${userId}/${orderId}`).then((r) => r.json())), {
  name: 'orders',
  description: 'orders api',
  schema: z.object({ userId: z.string(), orderId: z.string() }),
});
```

## Example 5: testing a tool directly

```ts
import { ToolMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

const logger = createLogger({ level: 'silent', pretty: false });
const config = { configurable: { user_id: 'user-1' } };
const call = (orderId: string) => ({
  id: 'call_1',
  name: 'get_order_status',
  args: { orderId },
  type: 'tool_call' as const,
});

describe('get_order_status', () => {
  it("returns the status of the caller's order", async () => {
    const tool = createOrderStatusTool({
      orders: {
        findForUser: (userId, orderId) =>
          Promise.resolve(
            userId === 'user-1' ? { id: orderId, status: 'shipped', updatedAt: '2026-10-30' } : undefined,
          ),
      },
      logger,
    });
    const message = await tool.invoke(call('ORD-12345'), config);
    expect(message).toBeInstanceOf(ToolMessage);
    expect(message.content).toContain('shipped');
    expect(message.artifact as OrderStatusArtifact).toEqual({ orderId: 'ORD-12345', degraded: false });
  });

  it('degrades instead of throwing when the order system times out', async () => {
    const tool = createOrderStatusTool({
      orders: { findForUser: () => new Promise(() => undefined) },
      timeoutMs: 10,
      logger,
    });
    const message = await tool.invoke(call('ORD-12345'), config);
    expect(message.content).toBe(ORDERS_UNAVAILABLE_MESSAGE);
    expect((message.artifact as OrderStatusArtifact).degraded).toBe(true);
  });

  it('rejects malformed ids before calling the dependency', async () => {
    const tool = createOrderStatusTool({
      orders: { findForUser: () => Promise.reject(new Error('should not be called')) },
      logger,
    });
    await expect(tool.invoke(call('DROP TABLE'), config)).rejects.toThrow();
  });
});
```
