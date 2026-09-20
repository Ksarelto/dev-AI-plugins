# State design (LangGraph.js)

## Reducers

Append-only channels use a concat reducer (`messages`, accumulated results). Overwrite channels use `(_left, right) => right` (`iteration`, `status`, `finalAnswer`).

All values must be JSON-serializable for the checkpointer: `string` ids not `UUID` objects, ISO strings not `Date`.

## Input vs working state

Keep invoke input small (`userQuery`, `userId`). Working fields (`messages`, `iteration`, `finalAnswer`) are graph-internal. Do not require the HTTP handler to pass the full message list on every turn — the checkpointer + `thread_id` owns that.

## Between agents / nodes

Pass the artifact the next node needs (`document`, `orderId`), not the entire `messages` array, when fanning out with `Send` or compiling a subgraph.

## Iteration

Every graph state includes `iteration` (or equivalent) and the agent node refuses to call the model once the cap is hit. That is independent of LangGraph’s recursion limit — set both.
