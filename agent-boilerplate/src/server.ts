import { createServer, type Server } from 'node:http';
import type { Express } from 'express';

export interface ServerOptions {
  host: string;
  port: number;
}

/** The only place that listens. Keep-alive is longer than typical LB idle timeouts to avoid 502s. */
export function startServer(app: Express, options: ServerOptions): Promise<Server> {
  const server = createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 120_000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
