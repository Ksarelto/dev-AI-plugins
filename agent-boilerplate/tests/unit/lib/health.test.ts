import { describe, expect, it } from 'vitest';
import { createHealthRegistry } from '../../../src/lib/health.js';

const up = () => Promise.resolve();
const down = () => Promise.reject(new Error('connection refused'));

describe('createHealthRegistry', () => {
  it('reports ok when every dependency is up', async () => {
    const report = await createHealthRegistry([
      { name: 'postgres', critical: true, check: up },
    ]).run();
    expect(report.status).toBe('ok');
  });

  it('reports degraded when only an optional dependency is down', async () => {
    const report = await createHealthRegistry([
      { name: 'postgres', critical: true, check: up },
      { name: 'upstream', critical: false, check: down },
    ]).run();
    expect(report.status).toBe('degraded');
    expect(report.checks.find((c) => c.name === 'upstream')).toMatchObject({
      status: 'down',
      error: 'connection refused',
    });
  });

  it('reports down when a critical dependency is down', async () => {
    const report = await createHealthRegistry([
      { name: 'postgres', critical: true, check: down },
    ]).run();
    expect(report.status).toBe('down');
  });

  it('treats a hanging check as down after its timeout', async () => {
    const hang = () => new Promise<void>(() => undefined);
    const report = await createHealthRegistry([
      { name: 'postgres', critical: true, timeoutMs: 20, check: hang },
    ]).run();
    expect(report.status).toBe('down');
  });
});
