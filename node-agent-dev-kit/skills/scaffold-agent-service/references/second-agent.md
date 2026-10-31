# Adding a second agent

`agent-boilerplate` ships one agent (`assistant`). This file is the procedure for a sibling, using `research` as the example name. It is not implemented in the boilerplate; the shapes follow `src/agents/assistant/` exactly.

## 1. Folder

```
src/agents/research/
  state.ts        ResearchState, ResearchStateType, ResearchStateUpdate
  prompts.ts      SYSTEM_PROMPT and user-facing fixed messages
  nodes/          createGuardNode / createAgentNode equivalents typed on ResearchState
  tools/index.ts  createResearchTools(deps) registry
  graph.ts        buildResearchGraph(deps), ResearchGraph type
```

Never import from `src/agents/assistant/`. When both agents need the same node factory, move it to `src/agents/shared/` (typed on a state that both extend) in the same change, and point both agents at it.

## 2. State and graph

```ts
// src/agents/research/state.ts
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

export const ResearchState = Annotation.Root({
  ...MessagesAnnotation.spec,
  iterations: Annotation<number>({ reducer: (_current, update) => update, default: () => 0 }),
  blocked: Annotation<boolean>({ reducer: (_current, update) => update, default: () => false }),
});

export type ResearchStateType = typeof ResearchState.State;
export type ResearchStateUpdate = typeof ResearchState.Update;
```

```ts
// src/agents/research/graph.ts
import { AIMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { END, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { Logger } from '../../lib/logger.js';
import type { CircuitBreaker } from '../../lib/resilience.js';
import { createAgentNode, type ToolCallingModel } from './nodes/agent.js';
import { createGuardNode } from './nodes/guard.js';
import { ResearchState, type ResearchStateType } from './state.js';

export interface ResearchGraphDeps {
  model: ToolCallingModel;
  tools: StructuredToolInterface[];
  checkpointer: BaseCheckpointSaver;
  breaker: CircuitBreaker;
  maxIterations: number;
  guardrailMode: 'block' | 'log';
  logger: Logger;
}

function routeAfterAgent(state: ResearchStateType): 'tools' | typeof END {
  const last = state.messages.at(-1);
  return last instanceof AIMessage && (last.tool_calls?.length ?? 0) > 0 ? 'tools' : END;
}

export function buildResearchGraph(deps: ResearchGraphDeps) {
  return new StateGraph(ResearchState)
    .addNode('guard', createGuardNode({ mode: deps.guardrailMode, logger: deps.logger }))
    .addNode('agent', createAgentNode(deps))
    .addNode('tools', new ToolNode(deps.tools))
    .addEdge(START, 'guard')
    .addConditionalEdges('guard', (state) => (state.blocked ? END : 'agent'), ['agent', END])
    .addConditionalEdges('agent', routeAfterAgent, ['tools', END])
    .addEdge('tools', 'agent')
    .compile({ checkpointer: deps.checkpointer });
}

export type ResearchGraph = ReturnType<typeof buildResearchGraph>;
```

## 3. Threads per agent

Checkpoints are keyed by `thread_id` only. Two agents must never run on the same id, and a user must not continue an `assistant` thread through the `research` routes. Add an owner-and-agent check:

```ts
// src/db/schema/threads.ts — new column
agent: varchar('agent', { length: 32 }).notNull().default('assistant'),
```

```ts
// src/repositories/threads.repository.ts
async findOwned(id: string, userId: string, agent: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select()
    .from(threads)
    .where(and(eq(threads.id, id), eq(threads.userId, userId), eq(threads.agent, agent)))
    .limit(1);
  return row;
},
```

Then `npm run db:generate`, review the SQL, commit it (`node-backend-dev-kit:drizzle-database`).

## 4. Service

Copy the shape of `src/services/chat.service.ts` into `src/services/research.service.ts`, typed on `ResearchGraph` / `ResearchStateType`: `requireThread` (with the agent name), `requireGraph` (503 `LLM_NOT_CONFIGURED`), `runConfig` with `recursionLimit: maxIterations * 2 + 4`, a turn input that resets `iterations` and `blocked`, `toReply`, and `toServiceError` (503 `LLM_UNAVAILABLE`). Keep the error codes identical so clients handle both agents the same way.

## 5. Container

```ts
// src/container.ts — one checkpointer and one llm breaker shared by every graph
const checkpointer = options.checkpointer ?? createPostgresCheckpointer(database.pool);

const researchTools = createResearchTools({ retriever, topK: env.RETRIEVAL_TOP_K, logger });
const researchModel =
  options.researchModel === null ? undefined : (options.researchModel ?? bindModel(env, researchTools));
const researchGraph = researchModel
  ? buildResearchGraph({
      model: researchModel,
      tools: researchTools,
      checkpointer,
      breaker: llmBreaker,
      maxIterations: env.AGENT_MAX_ITERATIONS,
      guardrailMode: env.GUARDRAIL_MODE,
      logger,
    })
  : undefined;
const research = createResearchService({ graph: researchGraph, threads, maxIterations: env.AGENT_MAX_ITERATIONS });
```

Add `researchModel?: ToolCallingModel | null` to `ContainerOptions` so tests can script it. Use a separate breaker only when the second agent runs on a different model slug.

## 6. HTTP

New router `src/routes/research.routes.ts` mounted at `/api/v1/research` behind `authenticate`, with its own controller and request schemas (reuse `MAX_MESSAGE_CHARS`). Follow `node-backend-dev-kit:express-resource`. For streaming copy the `stream` handler from the threads controller (`streaming-api` skill).

## 7. Tests and evals

- `tests/unit/agents/research.test.ts`: the same behaviour list as `assistant.test.ts` (`agent-evals` skill).
- `evals/golden/research.json` and `evals/research.eval.ts` with `describe.skipIf(!hasKey)`.
- `npm run lint` must pass: dependency-cruiser already applies `agents-no-http-no-db` to `src/agents/research/`.
