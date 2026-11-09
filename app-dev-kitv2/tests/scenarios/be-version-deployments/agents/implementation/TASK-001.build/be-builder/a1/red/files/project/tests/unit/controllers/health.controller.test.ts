import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createHealthController } from '../../../src/controllers/health.controller.js';
import { createHealthRegistry } from '../../../src/lib/health.js';
import { createLifecycle } from '../../../src/lib/lifecycle.js';

describe('liveness with a service version', () => {
  it('AC-0001 answers status and the configured version', async () => {
    const json = vi.fn();
    const controller = createHealthController(createHealthRegistry([]), createLifecycle(), '1.4.2');
    await controller.live({} as Request, { json } as unknown as Response, vi.fn());
    expect(json).toHaveBeenCalledWith({ status: 'ok', version: '1.4.2' });
  });
});
