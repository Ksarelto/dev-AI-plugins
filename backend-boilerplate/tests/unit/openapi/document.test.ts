import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../../../src/openapi/document.js';

describe('buildOpenApiDocument', () => {
  it('documents every route with shared components', () => {
    const document = buildOpenApiDocument();
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths ?? {})).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/users/me',
        '/api/v1/users',
      ]),
    );
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(
      expect.arrayContaining(['Problem', 'User', 'AuthResponse']),
    );
  });
});
