import { describe, expect, it, vi } from 'vitest';
import {
  CircuitOpenError,
  TimeoutError,
  createCircuitBreaker,
  retry,
  withTimeout,
} from '../../../src/lib/resilience.js';

describe('withTimeout', () => {
  it('resolves when the operation finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('rejects with TimeoutError when the operation is too slow', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 200));
    await expect(withTimeout(slow, 10, 'slow call')).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('retry', () => {
  it('retries until the operation succeeds', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue('done');
    await expect(retry(operation, { retries: 2, baseDelayMs: 1 })).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry errors that shouldRetry rejects', async () => {
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(new Error('permanent'));
    await expect(
      retry(operation, { retries: 3, baseDelayMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow('permanent');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('createCircuitBreaker', () => {
  it('opens after the failure threshold, fails fast, then recovers through half-open', async () => {
    let clock = 0;
    const breaker = createCircuitBreaker({
      name: 'upstream',
      failureThreshold: 2,
      resetTimeoutMs: 1_000,
      now: () => clock,
    });
    const failing = () => Promise.reject(new Error('down'));

    await expect(breaker.execute(failing)).rejects.toThrow('down');
    await expect(breaker.execute(failing)).rejects.toThrow('down');
    expect(breaker.state()).toBe('open');

    const operation = vi.fn(() => Promise.resolve('ok'));
    await expect(breaker.execute(operation)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(operation).not.toHaveBeenCalled();

    clock = 1_000;
    expect(breaker.state()).toBe('half-open');
    await expect(breaker.execute(operation)).resolves.toBe('ok');
    expect(breaker.state()).toBe('closed');
  });

  it('re-opens when the half-open trial fails', async () => {
    let clock = 0;
    const breaker = createCircuitBreaker({
      name: 'upstream',
      failureThreshold: 1,
      resetTimeoutMs: 100,
      now: () => clock,
    });
    await expect(breaker.execute(() => Promise.reject(new Error('down')))).rejects.toThrow();
    clock = 100;
    await expect(breaker.execute(() => Promise.reject(new Error('still down')))).rejects.toThrow(
      'still down',
    );
    expect(breaker.state()).toBe('open');
  });
});
