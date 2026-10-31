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
    name: options.name ?? 'agent-boilerplate',
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
