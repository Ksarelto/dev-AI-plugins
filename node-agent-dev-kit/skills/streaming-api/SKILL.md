---
name: streaming-api
description: Stream agent answers to clients over Server-Sent Events — graph.stream with streamMode messages and values, filtering AIMessageChunk tokens by langgraph_node, an async generator in ChatService.stream, the SSE controller with openSse, pulling the first event before headers so 404 and 503 stay problem+json, heartbeats, abort on client disconnect, token, done and error events, and a fetch-based client parser. Use when adding or fixing a streaming chat endpoint, a typing effect, or a client that reads text/event-stream. Not for WebSockets.
---

# Streaming API

## When to use

- Adding a streaming variant of a chat or agent endpoint
- Tokens arrive all at once, stop mid-answer, or keep generating after the client left
- Writing the client side that reads the stream
- Not for WebSockets or long polling; not for non-agent HTTP endpoints (`node-backend-dev-kit:express-resource`)

Hard constraints: `rules/agent-architecture.mdc`, `rules/langgraph-state.mdc`, plus `node-backend-dev-kit` `error-handling` (controllers do not catch, except the SSE controller after headers are sent). Copy the shapes in [examples.md](examples.md).

## Wire format

`POST /api/v1/threads/:threadId/messages/stream` with `{ content }` → `200 text/event-stream`:

```
event: token
data: {"type":"token","content":"Annual plans "}

: ping

event: done
data: {"type":"done","message":{"role":"assistant","content":"..."},"citations":[...],"degraded":false,"blocked":false}
```

On failure after headers: `event: error` with `{ code, status, ... }` (problem details), then the stream closes. Failures before the first event (404 `THREAD_NOT_FOUND`, 503 `LLM_NOT_CONFIGURED`, 422) are normal problem+json responses.

## Procedure

1. **Service** (`ChatService.stream`): an `async *` generator. Same ownership check, graph check, run config and turn input as `send`, plus `streamMode: ['messages', 'values']`.
2. **Tokens**: for `mode === 'messages'` the payload is `[chunk, metadata]`. Yield `{ type: 'token', content }` only when `metadata.langgraph_node === 'agent'` (or your user-facing node names) and `chunk instanceof AIMessageChunk` with non-empty text. This drops tool-call argument fragments and tool output.
3. **Final state**: for `mode === 'values'` keep the latest payload; after the loop, `yield { type: 'done', ...toReply(finalState, before) }`. Citations, `degraded` and `blocked` exist only in `done`. If a values payload carries `__interrupt__`, it is a pause, not a final state (`human-in-the-loop`).
4. **Errors**: wrap the loop in the same `toServiceError` mapping as `send`; throw 503 `LLM_UNAVAILABLE` when the graph produced no final state.
5. **Controller**: validate, create the generator, `await events.next()` **before** `openSse(res)`, so errors thrown before the first event go through the error handler with a status. Then open SSE, send the first event, `for await` the rest; in `catch` log with `req.log` and send `error` with `toProblem()` (or `INTERNAL_ERROR` 500); in `finally` `sse.close()`.
6. **Cancellation**: pass `res.locals.signal` (set by the timeout middleware, aborted on client disconnect or `REQUEST_TIMEOUT_MS`) as `signal`. LangGraph stops the run and the model request; nothing keeps spending tokens after the client leaves.
7. **Infrastructure**: `openSse` sets `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, flushes headers, and writes a `: ping` comment every 15 s so proxies do not cut idle streams. Keep `REQUEST_TIMEOUT_MS` (90 s) above the longest expected turn and below `server.requestTimeout` (120 s).
8. **Usage**: the boilerplate's stream does not attach the usage callback. If you need usage for streams, create a handler per request, pass it as `callbacks`, and add `usage` to the `done` event.
9. **Client**: `EventSource` cannot POST or send an `Authorization` header; use `fetch` and parse frames (example 4). Treat a non-2xx status as problem+json, `token` as append, `done` as the authoritative final message (replace the streamed text with it), `error` as failure.
10. **Tests**: unit-test the generator (events end with `done`); integration-test the route with supertest (`content-type` contains `text/event-stream`, body contains `event: done`); test that an unknown thread still answers 404 JSON.

## Checklist

- [ ] Stream reuses `send`'s ownership check, run config, turn input and error mapping
- [ ] Only user-facing node text becomes `token` events
- [ ] `done` carries the full reply (message, citations, degraded, blocked)
- [ ] First event pulled before `openSse`; 404/503/422 stay problem+json
- [ ] The SSE controller is the only controller with `try/catch`; it always closes the stream
- [ ] `res.locals.signal` passed through; disconnect aborts the run
- [ ] Heartbeat and anti-buffering headers in place
- [ ] Client uses `fetch` with the bearer token and treats `done` as final
