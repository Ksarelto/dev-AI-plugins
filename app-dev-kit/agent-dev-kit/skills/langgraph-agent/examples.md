# langgraph-agent examples

Confirm LangGraph.js APIs via Context7 if imports fail. LLM always comes from `createGraphModel()` — never `ChatAnthropic` or a default OpenAI base URL.

## Minimal ReAct graph

```ts
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGraphModel } from "../../llm/langgraph-model.js";

const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  iteration: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
});

const add = tool(
  async ({ a, b }) => String(a + b),
  {
    name: "add",
    description: "Add two integers. Do not use for other arithmetic.",
    schema: z.object({ a: z.number().int(), b: z.number().int() }),
  },
);

const tools = [add];
const llm = createGraphModel("reason").bindTools(tools);
const MAX = 10;

async function agentNode(state: typeof State.State) {
  if (state.iteration >= MAX) {
    return { messages: [], iteration: state.iteration };
  }
  const response = await llm.invoke(state.messages);
  return { messages: [response], iteration: state.iteration + 1 };
}

function route(state: typeof State.State) {
  const last = state.messages.at(-1);
  const calls = (last as { tool_calls?: unknown[] } | undefined)?.tool_calls;
  return calls && calls.length > 0 ? "tools" : END;
}

const graph = new StateGraph(State)
  .addNode("agent", agentNode)
  .addNode("tools", new ToolNode(tools))
  .addEdge(START, "agent")
  .addConditionalEdges("agent", route)
  .addEdge("tools", "agent");

export const app = graph.compile({ checkpointer: new MemorySaver() });

await app.invoke(
  { messages: [new HumanMessage("What is 42 + 58?")], iteration: 0 },
  { configurable: { thread_id: "session-1" } },
);
```

## HITL on write tools

```ts
export const app = graph.compile({
  checkpointer,
  interruptBefore: ["tools"],
});

const paused = await app.invoke(input, config);
// inspect paused state / pending tool calls
const resumed = await app.invoke(null, config);
```
