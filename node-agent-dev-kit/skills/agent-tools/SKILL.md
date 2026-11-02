---
name: agent-tools
description: Create LangChain tools for a LangGraph agent — tool() with a bounded Zod schema, a snake_case name and a model-facing description, injected dependencies, withTimeout, graceful failure text, content_and_artifact responses for citations and degraded flags, the tools/index.ts registry, ToolNode, and tool unit tests. Use when adding, changing or debugging a tool or function call the model can make, or when the model picks the wrong tool. Not for tools that write data and need approval (human-in-the-loop) or for retrieval internals (rag-pipeline).
---

# Agent tools

## When to use

- Giving the agent a new capability (look up an order, read a calendar, call an internal API)
- Changing a tool's schema, name or description, or the model calls the wrong tool
- Returning extra data to the service (citations, ids, flags) alongside the model-visible text
- Not for: tools with side effects → `human-in-the-loop` first; search quality → `rag-pipeline`

Hard constraints: `rules/tools.mdc`, `rules/prompt-security.mdc`. Copy the shapes in [examples.md](examples.md).

## Procedure

1. **Decide the kind of tool.**

   | The tool... | Then |
   |---|---|
   | reads data the caller may see | read-only tool; this skill |
   | needs the caller's identity | read `user_id` from `config.configurable` (`graph-state-design` example 3) |
   | creates, updates, sends or pays | `interrupt()` approval before acting (`human-in-the-loop`) |
   | returns text from outside the service | wrap each item with `asUntrustedDocument` |
   | returns data the service must use (citations, ids) | `responseFormat: 'content_and_artifact'` |
   | is pure computation the model does badly (dates, maths) | deterministic tool with an injectable clock or input, like `get_current_time` |

2. **Define the dependency as an interface** next to its owner (`KnowledgeRetriever` in `rag/retriever.ts`, an `OrdersClient` in `lib/` or a client module). The tool imports the type only.
3. **Write the factory** in `agents/<name>/tools/<kebab-name>.ts`: `create<Name>Tool(deps)` returning `tool(async (input, config) => ..., { name, description, schema, responseFormat })`.
   - `name`: `snake_case`, verb first (`get_order_status`, `search_knowledge`).
   - `description`: when to use it and what the input looks like, in one or two sentences. Do not describe internals.
   - `schema`: `z.object` with bounds, formats (`regex`, `uuid`), `.describe()` and `.default()`.
4. **Bound every await** with `withTimeout(promise, deps.timeoutMs ?? N, 'label')`. Catch expected failures, log `{ err }` at `warn`, and return a short message the model can relay plus `degraded: true` in the artifact.
5. **Keep output small**: cap counts (`topK`), cut long fields, return only fields the caller may see.
6. **Register** it in `tools/index.ts`. The container passes the same array to `bindTools` (via `bindModel`) and `buildAssistantGraph` passes it to `new ToolNode(tools)`.
7. **Read the artifact in the service** if the reply needs it: filter `ToolMessage`s by `name` in `toReply` (as `search_knowledge` does for citations and `degraded`).
8. **Mention the tool in the system prompt** only when the model must prefer it for a class of questions; add a golden case for that rule.
9. **Test** the tool directly (`agent-evals` skill): invoke with a tool call (`{ id, name, args, type: 'tool_call' }`) to get a `ToolMessage` with `artifact`; cover success, not found, and timeout. Add a graph test with `callTool('<name>', args)`.

## Gotchas

| Symptom | Cause |
|---|---|
| `tool.invoke(args)` returns a string without the artifact | invoke with a tool call object, not bare args |
| The model sees "Error: ... Please fix your mistakes" | `ToolNode` turns uncaught errors and schema failures into an error `ToolMessage`; never put secrets or SQL in error messages |
| The model never calls the tool | vague `description`, or the system prompt never says when to use it |
| The model invents arguments for the user | identity in the schema; move it to `config.configurable` |
| An approval prompt never appears | `interrupt()` inside a `try/catch` that swallows the interrupt |

## Checklist

- [ ] One file per tool; factory with injected deps; no repository, `db`, `services/` or `Env` import
- [ ] `snake_case` name, two-sentence description, bounded Zod schema
- [ ] Every await has a timeout; failures return text plus `degraded: true`
- [ ] External text wrapped with `asUntrustedDocument`; output capped
- [ ] Caller identity from `config.configurable`, never from arguments
- [ ] Registered in `tools/index.ts`; same array for `bindTools` and `ToolNode`
- [ ] Read-only, or approval via `human-in-the-loop`
- [ ] Unit tests for success, empty and failure paths; graph test with `callTool`
- [ ] `npm run eval` run if the description or prompt changed
