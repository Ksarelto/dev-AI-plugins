# Streaming examples

Examples 1 to 3 and 5 are from `agent-boilerplate`. Example 4 (client) is an extension, typechecked and run against `openSse`.

## Example 1: `ChatService.stream`

```ts
export type ChatStreamEvent = { type: 'token'; content: string } | ({ type: 'done' } & ChatReply);

/** Streams model tokens as they arrive, then one `done` event with the full reply. */
async *stream(options: SendOptions): AsyncGenerator<ChatStreamEvent> {
  await requireThread(options.userId, options.threadId);
  const graph = requireGraph();
  const before = await previousMessageCount(graph, options.threadId);
  let finalState: AssistantStateType | undefined;
  try {
    const stream = await graph.stream(turnInput(options.content), {
      ...runConfig(options),
      streamMode: ['messages', 'values'],
    });
    for await (const [mode, payload] of stream) {
      if (mode === 'values') {
        finalState = payload;
        continue;
      }
      const [chunk, metadata] = payload as [BaseMessage, { langgraph_node?: string }];
      if (metadata.langgraph_node === 'agent' && chunk instanceof AIMessageChunk) {
        const content = textOf(chunk);
        if (content) yield { type: 'token', content };
      }
    }
  } catch (error) {
    throw toServiceError(error, options.signal);
  }
  if (!finalState)
    throw new ServiceUnavailableError('The assistant returned no answer.', 'LLM_UNAVAILABLE');
  await threads.touch(options.threadId);
  yield { type: 'done', ...toReply(finalState, before) };
},
```

`textOf` joins text parts when `content` is an array of content blocks. Messages produced without streaming (the guard's `BLOCKED_MESSAGE`, the step-limit message) never become `token` events; they arrive in `done`.

## Example 2: the SSE controller

```ts
/**
 * SSE: once headers are sent, errors can no longer change the status code, so this is
 * the one controller that catches — it reports the failure as an `error` event.
 */
const stream: RequestHandler = async (_req, res) => {
  const { params, body } = validated(res, sendMessageRequest);
  const userId = requirePrincipal(res).userId;
  const events = chat.stream({
    userId,
    threadId: params.threadId,
    content: body.content,
    signal: res.locals.signal as AbortSignal | undefined,
  });
  // Pull the first event before opening the stream, so 404/503 still become normal problem responses.
  const first = await events.next();
  const sse = openSse(res);
  try {
    if (!first.done) sse.send(first.value.type, first.value);
    for await (const event of events) sse.send(event.type, event);
  } catch (error) {
    res.req.log.error({ err: error }, 'chat stream failed');
    const problem =
      error instanceof AppError ? error.toProblem() : { code: 'INTERNAL_ERROR', status: 500 };
    sse.send('error', problem);
  } finally {
    sse.close();
  }
};
```

```ts
// routes/threads.routes.ts
router.post('/:threadId/messages/stream', validate(sendMessageRequest), controller.stream);
```

Bad: headers opened first, so a missing thread or a missing model becomes a `200` stream with an error event instead of a 404 or 503.

```ts
const sse = openSse(res);
for await (const event of chat.stream(options)) sse.send(event.type, event);
```

## Example 3: `lib/sse.ts`

```ts
export interface SseChannel {
  send(event: string, data: unknown): void;
  close(): void;
}

/**
 * Server-Sent Events over a plain response. Disables proxy buffering and sends a comment
 * heartbeat so idle connections are not cut by load balancers.
 */
export function openSse(res: Response, heartbeatMs = 15_000): SseChannel {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);
  heartbeat.unref();

  return {
    send(event, data) {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
  };
}
```

## Example 4: a TypeScript client (extension)

```ts
export interface SseEvent {
  event: string;
  data: unknown;
}

const FRAME_SEPARATOR = '\n\n';

function parseFrame(frame: string): SseEvent | undefined {
  if (frame.startsWith(':')) return undefined; // heartbeat comment
  const event = /^event: (.+)$/m.exec(frame)?.[1];
  const data = /^data: (.+)$/m.exec(frame)?.[1];
  return event && data ? { event, data: JSON.parse(data) as unknown } : undefined;
}

export async function* streamChat(options: {
  baseUrl: string;
  token: string;
  threadId: string;
  content: string;
  signal?: AbortSignal;
}): AsyncGenerator<SseEvent> {
  const response = await fetch(`${options.baseUrl}/api/v1/threads/${options.threadId}/messages/stream`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.token}`,
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({ content: options.content }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok || !response.body) {
    throw new Error(`stream rejected with ${response.status}`); // body is problem+json
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let boundary = buffer.indexOf(FRAME_SEPARATOR);
    while (boundary !== -1) {
      const parsed = parseFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + FRAME_SEPARATOR.length);
      boundary = buffer.indexOf(FRAME_SEPARATOR);
      if (parsed) yield parsed;
    }
  }
}
```

Aborting the client's `AbortController` closes the connection; the server's `res.locals.signal` fires and the graph run stops.

## Example 5: tests

```ts
// unit: the generator ends with the full reply
it('streams a final done event with the reply', async () => {
  const { chat } = setup(scriptedModel([answer('Streaming works.')]));
  const events = [];
  for await (const event of chat.stream({ userId: 'user-1', threadId: await newThread(chat), content: 'Hi' })) {
    events.push(event);
  }
  expect(events.at(-1)).toMatchObject({ type: 'done', message: { content: 'Streaming works.' } });
});
```

```ts
// integration: real route, real checkpointer
it('streams the answer as server-sent events', async () => {
  const ada = await testApp.token('ada');
  const threadId = await newThread(ada);
  turns.push(answer('Hello from the stream.'));

  const res = await request(app)
    .post(`/api/v1/threads/${threadId}/messages/stream`)
    .set('authorization', `Bearer ${ada}`)
    .send({ content: 'Say hello' })
    .expect(200);
  expect(res.headers['content-type']).toContain('text/event-stream');
  expect(res.text).toContain('event: done');
  expect(res.text).toContain('Hello from the stream.');
});
```

A scripted model returns whole messages, so offline tests see no `token` events; token streaming is verified by the evals or a manual run against a real model.
