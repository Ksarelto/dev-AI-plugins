import { withTimeout } from './resilience.js';

export interface HealthCheck {
  name: string;
  /** A critical dependency down → not ready (503). A non-critical one down → degraded (200). */
  critical: boolean;
  timeoutMs?: number;
  check: () => Promise<void>;
}

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthCheckResult {
  name: string;
  critical: boolean;
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: HealthStatus;
  checks: HealthCheckResult[];
}

async function runCheck(check: HealthCheck): Promise<HealthCheckResult> {
  const started = performance.now();
  const base = { name: check.name, critical: check.critical };
  try {
    await withTimeout(check.check(), check.timeoutMs ?? 2_000, `${check.name} health check`);
    return { ...base, status: 'up', latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      ...base,
      status: 'down',
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createHealthRegistry(checks: HealthCheck[]) {
  return {
    async run(): Promise<HealthReport> {
      const results = await Promise.all(checks.map(runCheck));
      const criticalDown = results.some((r) => r.critical && r.status === 'down');
      const anyDown = results.some((r) => r.status === 'down');
      return { status: criticalDown ? 'down' : anyDown ? 'degraded' : 'ok', checks: results };
    },
  };
}

export type HealthRegistry = ReturnType<typeof createHealthRegistry>;
