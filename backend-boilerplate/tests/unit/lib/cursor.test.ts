import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../../src/lib/cursor.js';
import { BadRequestError } from '../../../src/lib/errors.js';

describe('pagination cursor', () => {
  it('round-trips a keyset', () => {
    const keyset = {
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      id: '6f1c2c1e-6d1b-4c55-9a8b-0d3f7a9c1e22',
    };
    expect(decodeCursor(encodeCursor(keyset))).toEqual(keyset);
  });

  it('rejects a tampered cursor with a 400', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(BadRequestError);
  });
});
