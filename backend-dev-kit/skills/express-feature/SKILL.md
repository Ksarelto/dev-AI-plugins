---
name: express-feature
description: Scaffold and implement a complete Express feature slice — Zod schemas, Drizzle table, repository, service, router, and tests — following the three-layer architecture.
argument-hint: <resource>
---

# Express feature

## When to use

Building a new domain resource (e.g. `users`, `orders`, `products`) or adding an endpoint to an existing resource. The service tree must already exist — if `src/http/create-app.ts` is missing, load `scaffold-service` first. Login/refresh/guards are `auth-jwt`. OpenAPI path registration is `openapi-docs` after the schemas exist. List pagination is `database-patterns`.

## Procedure

1. Plan scope: singular resource name, CRUD subset, relations, public vs `requireAuth`.
2. Add one file per layer (no feature folder, no barrel):
   - `src/db/tables/{resource}.ts`
   - `src/schemas/{resource}.ts`
   - `src/repositories/{resource}.ts`
   - `src/services/{resource}.ts` and `{resource}.errors.ts`
   - `src/http/routers/{resource}.ts`
3. Zod: `{Resource}Create`, `{Resource}Update` (partial + strict), `{Resource}Read` in `src/schemas/`.
4. Drizzle `pgTable` in `src/db/tables/`. Re-export from `src/db/tables/index.ts` (sibling only).
5. Repository: `findById`, `list` (keyset pagination — `database-patterns`), `insert`, `update`, `remove`. Methods take `db | tx`. Never `db.transaction`. Do not import Zod schemas — define insert/patch types in the repository.
6. Service: inject repo via factory, `db.transaction` on writes, throw `{Resource}NotFoundError`, return `Read.parse(row)` (or a mapper in `src/schemas/`). Cache-aside / invalidation here if Redis is in play (`redis-backplane`).
7. Router: `validate` middleware, call service, `201` / `204` / `200`. No `db` in the handler. Protected routes receive already-bound `requireAuth` / `requireRole` from `compose.ts` (`auth-jwt`) — never an `if` on `req.user.role`, never import `UserService`.
8. Register in `src/http/compose.ts`: `router.use("/{resources}", create{Resource}Router(service, …guards))`. Register Create/Update/Read + paths in `src/http/openapi.ts` (`openapi-docs`) — not in the router.
9. `drizzle-kit generate` for the new table.
10. Integration tests — load `http-testing`. Cover create → read, list, 404, 422, auth.

## Checklist

- [ ] Separate Create / Update / Read — no reuse
- [ ] Repository only queries; service owns `db.transaction`
- [ ] Router never imports Drizzle, repositories, or tables
- [ ] Domain errors extend `AppError`; error middleware maps them
- [ ] Router registered in `src/http/compose.ts`
- [ ] List uses keyset pagination (opaque cursor); `pageSize` capped at 100
- [ ] Protected routes use middleware bound in `compose.ts`
- [ ] Zod schemas registered on the OpenAPI registry in `openapi.ts`
- [ ] Integration tests for happy path and error cases

## References

- [examples.md](./examples.md) — products CRUD templates
