import type { Response } from 'express';

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
