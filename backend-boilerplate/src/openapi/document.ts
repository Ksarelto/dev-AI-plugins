import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { z } from 'zod';
import {
  authResponseSchema,
  loginBodySchema,
  refreshBodySchema,
  registerBodySchema,
} from '../schemas/auth.schema.js';
import { problemSchema } from '../schemas/common.schema.js';
import {
  listUsersRequest,
  userPageResponseSchema,
  userResponseSchema,
} from '../schemas/user.schema.js';

/**
 * The OpenAPI document is generated from the same Zod schemas that validate requests.
 * Schemas named with `.meta({ id })` become reusable `components.schemas` entries.
 */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const bearer = registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  const json = <T extends z.ZodType>(schema: T) => ({
    content: { 'application/json': { schema } },
  });
  const problem = (description: string) => ({
    description,
    content: { 'application/problem+json': { schema: problemSchema } },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/register',
    tags: ['auth'],
    request: { body: json(registerBodySchema) },
    responses: {
      201: { description: 'Account created', ...json(authResponseSchema) },
      409: problem('Email already registered'),
      422: problem('Validation failed'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/login',
    tags: ['auth'],
    request: { body: json(loginBodySchema) },
    responses: {
      200: { description: 'Signed in', ...json(authResponseSchema) },
      401: problem('Invalid credentials'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/refresh',
    tags: ['auth'],
    request: { body: json(refreshBodySchema) },
    responses: {
      200: { description: 'Rotated tokens', ...json(authResponseSchema) },
      401: problem('Invalid or reused token'),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/logout',
    tags: ['auth'],
    request: { body: json(refreshBodySchema) },
    responses: { 204: { description: 'Session revoked' } },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/me',
    tags: ['users'],
    security: [{ [bearer.name]: [] }],
    responses: {
      200: { description: 'Current user', ...json(userResponseSchema) },
      401: problem('Not authenticated'),
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/users',
    tags: ['users'],
    security: [{ [bearer.name]: [] }],
    request: { query: listUsersRequest.query },
    responses: {
      200: { description: 'Users, newest first', ...json(userPageResponseSchema) },
      403: problem('Admin role required'),
    },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'backend-boilerplate API', version: '0.1.0' },
  });
}
