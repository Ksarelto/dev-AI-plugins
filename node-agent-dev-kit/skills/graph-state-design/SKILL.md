---
name: graph-state-design
description: Design LangGraph.js state schemas — Annotation.Root with MessagesAnnotation.spec, reducers and defaults, per-turn counters and flags reset by the service, accumulating fields, RemoveMessage and trimMessages for long histories, rolling summaries, and what belongs in state versus config.configurable. Use when adding a state field, reducer, counter or flag, passing user identity to nodes, or when conversation history grows too large for the context window. Not for checkpointer persistence (checkpointing-memory).
---

# Graph state design

## When to use

- Adding a field to an agent's state (`state.ts`) or changing a reducer
- Adding a per-turn counter or flag, or something that must survive between turns
- A thread's history is getting too long, too slow or too expensive
- Passing the caller's identity to a node or tool
- Not for where checkpoints are stored or how to read history → `checkpointing-memory`

Hard constraints: `rules/langgraph-state.mdc`. Copy the shapes in [examples.md](examples.md).

## Procedure

1. **Classify the field** before writing it:

   | Lifetime | Example | Reducer | Reset |
   |---|---|---|---|
   | Per turn, overwritten | `iterations`, `blocked`, `intent` | `(_current, update) => update` | in the service's turn input |
   | Per turn, accumulated | `retrievedChunkIds` | concat (dedupe if needed) | turn input sets `[]` |
   | Whole thread | `summary`, user-chosen language | overwrite | never; document it in `state.ts` |
   | Conversation | `messages` | LangGraph messages reducer (from `MessagesAnnotation.spec`) | never; trim or summarize instead |
   | Not state | model, retriever, logger, limits | n/a | factory `deps` |
   | Not state | `thread_id`, `user_id` | n/a | `config.configurable` |

2. **Declare** it in `state.ts` with `Annotation<T>({ reducer, default })` and a one-line comment on its lifetime. Keep `<Name>StateType` / `<Name>StateUpdate` exports.
3. **Reset per-turn fields** in the service's `turnInput` (`{ messages: [new HumanMessage(content)], iterations: 0, blocked: false, ... }`). A field missing from the turn input keeps the value from the previous turn.
4. **Return partial updates** from nodes: `{ messages: [response], iterations: state.iterations + 1 }`. Return only the new messages.
5. **Identity in config**: the service adds `user_id` next to `thread_id` in `configurable`; nodes and tools read it with a `requireUserId(config)` helper. The boilerplate passes only `thread_id` today; add `user_id` in `runConfig` when the first node or tool needs it.
6. **Long histories**, cheapest first:

   | Option | Effect on the checkpoint | Use when |
   |---|---|---|
   | `trimMessages` before the model call | none; the model sees the last N tokens | default; most chats |
   | Rolling `summary` + `RemoveMessage` | older messages deleted, summary kept | long-lived threads where early facts matter |
   | `RemoveMessage({ id: REMOVE_ALL_MESSAGES })` | history wiped | a "reset conversation" action |

   Trim with `startOn: 'human'` so a tool result is never sent without the AI message that requested it. When removing messages, cut at a `HumanMessage` boundary for the same reason.
7. **Check the reply builder** after any removal: `toReply(state, previousCount)` slices by count. If a node removes messages during the turn, slice from the turn's own `HumanMessage` (give it an `id` in the turn input) instead.
8. **Test**: a unit test per field that proves the reset (two turns on one thread) or the persistence.

## Checklist

- [ ] Every non-message field has `reducer`, `default` and a lifetime comment
- [ ] Per-turn fields are in the service's turn input
- [ ] No model, client, logger, `Env` value or closure in state
- [ ] `user_id` / `thread_id` come from `config.configurable`, never from state or tool arguments
- [ ] Nodes return only new messages; removal uses `RemoveMessage`
- [ ] Trimming keeps tool calls and tool results together (`startOn: 'human'`)
- [ ] `toReply` still reads exactly this turn's messages
- [ ] A test proves the field's lifetime across two turns
