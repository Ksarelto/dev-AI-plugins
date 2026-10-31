# Logging and observability — examples

`logger.ts` and `request-logger.ts` are verbatim from `backend-boilerplate/`.

## `src/lib/logger.ts`

```ts
import { pino, type Logger } from 'pino';

export type { Logger };

export interface LoggerOptions {
  level: string;
  pretty: boolean;
  name?: string;
}

/** Secrets and tokens never reach the log stream. */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
];

export function createLogger(options: LoggerOptions): Logger {
  return pino({
    name: options.name ?? 'backend-boilerplate',
    level: options.level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(options.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
          },
        }
      : {}),
  });
}
```

## `src/middleware/request-logger.ts`

```ts
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from '../lib/logger.js';

const SAFE_REQUEST_ID = /^[\w.-]{1,128}$/;

/**
 * One child logger per request (`req.log`) carrying the request id. An incoming
 * `X-Request-Id` is reused when it is safe, so ids follow a call across services.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const id =
        typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    autoLogging: { ignore: (req) => req.url.startsWith('/health') },
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
```

## Logging inside a request

```ts
// middleware/error-handler.ts — the request's child logger carries the request id
if (problem.status >= 500) req.log.error({ err: error }, 'request failed');
else req.log.warn({ code: problem.code, status: problem.status }, problem.detail);
```

Controllers rarely log: pino-http already writes one access line per request with id, method, url,
status and duration. Log in a handler only for an event worth its own line.

## Logging from a service or background job

```ts
import type { Logger } from '../lib/logger.js';

export interface ImportServiceDeps {
  projects: ProjectsRepository;
  logger: Logger;
}

export function createImportService({ projects, logger }: ImportServiceDeps) {
  const log = logger.child({ component: 'import' });

  return {
    async run(batchId: string): Promise<void> {
      log.info({ batchId }, 'import started');
      try {
        // ...
        log.info({ batchId, imported: 42 }, 'import finished');
      } catch (error) {
        log.error({ err: error, batchId }, 'import failed');
        throw error;
      }
    },
  };
}
```

`container.ts` receives the root logger (add it to `createContainer`'s parameters, as `createApp` does) and
passes it into the deps. Never import a module-level logger instance.

## Bad / good

```ts
// Bad
console.log('created project ' + project.id + ' for ' + JSON.stringify(req.body));
logger.error(`sync failed: ${error}`);

// Good
req.log.info({ projectId: project.id }, 'project created');
log.error({ err: error, upstream: 'geo' }, 'sync failed');
```

## Redaction

`REDACT_PATHS` in `lib/logger.ts` censors `req.headers.authorization`, cookies, `set-cookie`, and any
`password`, `passwordHash`, `accessToken`, `refreshToken`, `token` one level below the logged object.
A `*.field` wildcard matches exactly one level: `{ body: { password } }` is redacted,
`{ input: { user: { password } } }` is not, and neither is a top-level `{ password }` (verified with pino 10). Add explicit paths for deeper or new sensitive fields
(`'*.apiKey'`, `'*.user.password'`) instead of trusting call sites.

## Request ids across services

`requestLogger` reuses an incoming `X-Request-Id` when it matches `^[\w.-]{1,128}$` and echoes it on the
response. To follow a call into another service, forward `req.id` as `X-Request-Id` on the outbound
request. `createResilientHttpClient(...).get(path)` takes no headers today; extend it with an optional
headers argument rather than calling `fetch` directly.

## Metrics and tracing

Not part of the boilerplate. If required, add OpenTelemetry (`@opentelemetry/sdk-node` with the HTTP,
Express, pg and pino instrumentations) loaded before the app via `node --import`, and keep logs as the
JSON stream on stdout. Check current package names and setup with the `context7` MCP server first.
