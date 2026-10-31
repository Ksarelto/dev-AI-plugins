# Tests for the `projects` slice

Unit tests drive the service with an in-memory repository; integration tests drive the real app
against Testcontainers Postgres. Patterns and helpers: the `api-testing` skill.

## 11a. In-memory repository — `tests/helpers/in-memory-projects.ts`

```ts
import { randomUUID } from 'node:crypto';
import type { ProjectRow } from '../../src/db/schema/index.js';
import type { ProjectsRepository } from '../../src/repositories/projects.repository.js';

/** Honours the repository contract, including the (owner_id, name) unique index. */
export function createInMemoryProjectsRepository() {
  const rows = new Map<string, ProjectRow>();
  const duplicate = () => Object.assign(new Error('duplicate key'), { code: '23505' });
  const nameTaken = (ownerId: string, name: string, exceptId?: string) =>
    [...rows.values()].some((r) => r.ownerId === ownerId && r.name === name && r.id !== exceptId);

  const projects: ProjectsRepository = {
    findById: (id) => Promise.resolve(rows.get(id)),
    create: (values) => {
      if (nameTaken(values.ownerId, values.name)) return Promise.reject(duplicate());
      const now = new Date();
      const row: ProjectRow = {
        id: randomUUID(),
        description: null,
        createdAt: now,
        updatedAt: now,
        ...values,
      };
      rows.set(row.id, row);
      return Promise.resolve(row);
    },
    update: (id, changes) => {
      const row = rows.get(id);
      if (!row) return Promise.resolve(undefined);
      if (changes.name && nameTaken(row.ownerId, changes.name, id)) {
        return Promise.reject(duplicate());
      }
      const updated = { ...row, ...changes, updatedAt: new Date() };
      rows.set(id, updated);
      return Promise.resolve(updated);
    },
    delete: (id) => Promise.resolve(rows.delete(id)),
    listPageByOwner: ({ ownerId, limit }) =>
      Promise.resolve(
        [...rows.values()]
          .filter((r) => r.ownerId === ownerId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit + 1),
      ),
  };

  return { projects, rows };
}
```

## 11b. Service unit test — `tests/unit/services/projects.service.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../../../src/lib/errors.js';
import type { Principal } from '../../../src/lib/jwt.js';
import {
  createProjectsService,
  type ProjectsService,
} from '../../../src/services/projects.service.js';
import { createInMemoryProjectsRepository } from '../../helpers/in-memory-projects.js';

const owner: Principal = { userId: 'owner-1', email: 'owner@example.com', roles: ['user'] };
const stranger: Principal = { userId: 'other-1', email: 'other@example.com', roles: ['user'] };
const admin: Principal = { userId: 'admin-1', email: 'admin@example.com', roles: ['admin'] };

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(() => {
    service = createProjectsService(createInMemoryProjectsRepository());
  });

  it('creates a project owned by the caller', async () => {
    const project = await service.create(owner, { name: 'Apollo' });
    expect(project).toMatchObject({ ownerId: owner.userId, name: 'Apollo', description: null });
  });

  it('refuses a duplicate name for the same owner with PROJECT_NAME_TAKEN', async () => {
    await service.create(owner, { name: 'Apollo' });
    const duplicate = service.create(owner, { name: 'Apollo' });
    await expect(duplicate).rejects.toBeInstanceOf(ConflictError);
    await expect(service.create(owner, { name: 'Apollo' })).rejects.toMatchObject({
      code: 'PROJECT_NAME_TAKEN',
    });
  });

  it('allows the same name for different owners', async () => {
    await service.create(owner, { name: 'Apollo' });
    await expect(service.create(stranger, { name: 'Apollo' })).resolves.toMatchObject({
      ownerId: stranger.userId,
    });
  });

  it("hides another user's project as 404, but shows it to an admin", async () => {
    const project = await service.create(owner, { name: 'Apollo' });
    await expect(service.get(stranger, project.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.get(admin, project.id)).resolves.toMatchObject({ id: project.id });
  });

  it('pages only the caller projects with a cursor', async () => {
    for (const name of ['a', 'b', 'c']) await service.create(owner, { name });
    await service.create(stranger, { name: 'x' });
    const page = await service.listMine(owner, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.items.every((p) => p.ownerId === owner.userId)).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it('does not let a stranger update or delete', async () => {
    const project = await service.create(owner, { name: 'Apollo' });
    await expect(service.update(stranger, project.id, { name: 'Hijack' })).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
    await expect(service.remove(stranger, project.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
```

## 11c. Integration test — `tests/integration/projects.test.ts`

In `tests/helpers/test-app.ts`, add the table to `reset()`: `truncate table projects, refresh_tokens, users restart identity cascade`.

```ts
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app.js';

const testApp = createTestApp();
const { app } = testApp;
const password = 'correct-horse-battery';

async function registerAndGetToken(name: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: `${name}@example.com`, password, displayName: name })
    .expect(201);
  return res.body.accessToken as string;
}

beforeEach(testApp.reset);
afterAll(testApp.close);

describe('/api/v1/projects', () => {
  it('requires a bearer token', async () => {
    const res = await request(app).get('/api/v1/projects').expect(401);
    expect(res.body.code).toBe('MISSING_TOKEN');
  });

  it('creates, reads, updates, lists and deletes a project', async () => {
    const token = await registerAndGetToken('ada');
    const auth = { authorization: `Bearer ${token}` };

    const created = await request(app)
      .post('/api/v1/projects')
      .set(auth)
      .send({ name: 'Apollo', description: 'Moon' })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Apollo', description: 'Moon' });
    const id = created.body.id as string;

    await request(app).get(`/api/v1/projects/${id}`).set(auth).expect(200);

    const updated = await request(app)
      .patch(`/api/v1/projects/${id}`)
      .set(auth)
      .send({ name: 'Artemis' })
      .expect(200);
    expect(updated.body.name).toBe('Artemis');

    const list = await request(app).get('/api/v1/projects').set(auth).expect(200);
    expect(list.body).toMatchObject({ items: [{ id }], nextCursor: null });

    await request(app).delete(`/api/v1/projects/${id}`).set(auth).expect(204);
    await request(app).get(`/api/v1/projects/${id}`).set(auth).expect(404);
  });

  it("answers 404 for another user's project", async () => {
    const owner = await registerAndGetToken('ada');
    const stranger = await registerAndGetToken('bob');
    const created = await request(app)
      .post('/api/v1/projects')
      .set('authorization', `Bearer ${owner}`)
      .send({ name: 'Apollo' })
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/projects/${created.body.id as string}`)
      .set('authorization', `Bearer ${stranger}`)
      .expect(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('answers a duplicate name with 409 and a bad body with 422', async () => {
    const token = await registerAndGetToken('ada');
    const auth = { authorization: `Bearer ${token}` };
    await request(app).post('/api/v1/projects').set(auth).send({ name: 'Apollo' }).expect(201);

    const duplicate = await request(app)
      .post('/api/v1/projects')
      .set(auth)
      .send({ name: 'Apollo' })
      .expect(409);
    expect(duplicate.body.code).toBe('PROJECT_NAME_TAKEN');

    const invalid = await request(app)
      .post('/api/v1/projects')
      .set(auth)
      .send({ name: '', ownerId: 'someone-else' })
      .expect(422);
    const paths = (invalid.body.errors as { path: string }[]).map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['body.name', 'body']));
  });

  it('rejects a non-uuid id and an empty PATCH with 422', async () => {
    const token = await registerAndGetToken('ada');
    const auth = { authorization: `Bearer ${token}` };
    await request(app).get('/api/v1/projects/not-a-uuid').set(auth).expect(422);
    const created = await request(app)
      .post('/api/v1/projects')
      .set(auth)
      .send({ name: 'Apollo' })
      .expect(201);
    await request(app)
      .patch(`/api/v1/projects/${created.body.id as string}`)
      .set(auth)
      .send({})
      .expect(422);
  });
});
```
