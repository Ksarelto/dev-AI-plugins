import type { RequestHandler } from 'express';
import type { HealthRegistry } from '../../../../core/health.js';
import type { Lifecycle } from '../../../../core/lifecycle.js';

export const createHealthController = (health: HealthRegistry, lifecycle: Lifecycle, version?: string) => {
  /** Liveness: the process can serve HTTP. Never checks dependencies (that would restart healthy pods). */
  const live: RequestHandler = (_req, res) => {
    res.json(version ? { status: 'ok', version } : { status: 'ok' });
  };

  /** Readiness: 503 while shutting down or when a critical dependency is down; 200 `degraded` otherwise. */
  const ready: RequestHandler = async (_req, res) => {
    if (lifecycle.isShuttingDown()) {
      res.status(503).json({ status: 'shutting_down', checks: [] });
      return;
    }
    const report = await health.run();
    res.status(report.status === 'down' ? 503 : 200).json(report);
  };

  return { live, ready };
};

export type HealthController = ReturnType<typeof createHealthController>;
