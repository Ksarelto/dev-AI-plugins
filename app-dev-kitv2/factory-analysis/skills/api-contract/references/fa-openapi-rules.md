# OpenAPI rules for `api-contract.yaml`

Used by `api-contract` (contract-steward, S3). The contract is the seam between roles: the frontend's
api-client task builds against it, the backend's endpoint tasks implement it, and verification
compares the backend's OpenAPI document with it. The backend conventions come from
`node-backend-dev-kit` — its `api-design` rule (paths, status codes, fields, pagination, errors) and
its `openapi-docs` skill (how the backend registers each path). Read them through T1; this file only
says what the contract itself must hold.

## What is checked, and by whom

| Check | Where | Failure |
|---|---|---|
| `openapi` starts with `3.` | gate-arch | `openapi-version` |
| every operation has an `operationId`, unique in the file | gate-arch | `no-operation-id`, `duplicate-operation` |
| every operation has `x-factory.acs`, each a spec AC | gate-arch | `no-acs`, `unknown-ac` |
| every operation declares a 2xx response | gate-arch | `no-success-response` |
| every `contract_ops` entry of the component map is defined here | gate-arch | `unknown-operation` |
| every new operation of an enabled `owner_role` is built by a task of that role | gate-plan | `contract-op-without-task` |
| every contract path + method is registered in the backend's OpenAPI document | backend audit at verification | `missing-in-document` (P1) |
| no extra documented operation under the contract's path prefixes | backend audit at verification | `not-in-contract` (P2) |

## File layout (the audit reads it by indentation)

The backend's conformance audit parses `paths` line by line, without a YAML library:

- `paths:` at column 0;
- each path on its own line at **2 spaces**, ending with `:` and nothing after it —
  `  /api/v1/carts/{cartId}/coupon:`. Never a flow-style path item (`  /x: { get: … }`);
- each method at **4 spaces** — `    put:`.

Inside an operation, flow style is fine. Keep `openapi: 3.1.0` and an `info` block with `title`
and `version`.

## Paths and operations

- **Full path as the backend registers it.** With the backend role enabled, every business route sits
  under `/api/v1/<plural-kebab-noun>` (the `api-design` rule); the audit compares the string exactly.
  Path parameters use braces: `/api/v1/orders/{orderId}`.
- **No verbs in paths** except auth actions; the caller's own data is `/me`, never a user id in the
  path.
- **Methods and success codes**: `GET` 200, `POST` that creates 201 with the created object,
  `PATCH` / `PUT` 200 with the updated object, `DELETE` 204 without a body, an idempotent action 204.
- **`operationId`**: camelCase verb + noun (`applyCoupon`, `listOrders`); unique; the same string the
  component map lists in `contract_ops` and the tasks list in theirs.
- **`x-factory`**: `{ feature, acs, owner_role, status? }`.
  - `acs`: the ACs this operation serves — the happy one and every error AC that produces one of its
    error responses.
  - `owner_role`: the role whose tasks implement the operation (`backend`, or `ai-agent` for an
    agent service's route). Consumers do not own it.
  - `status: existing`: the app already serves this operation unchanged. It is listed because the
    feature calls it; no task needs to build it. Copy its real shape from the route and schema files
    (capability map paths); never redesign an existing operation here.

## Schemas

- Request and response bodies are named schemas under `components.schemas`, referenced with `$ref`.
  One schema per shape; reuse it across operations.
- **Request bodies are closed**: `additionalProperties: false` and a `required` list — the backend's
  strict validation answers unknown fields with 422.
- **Limits come from the ACs**: `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, `enum`,
  `format` (`uuid`, `date-time`, `email`). A number in an AC ("at most 3 coupons") is a constraint here.
- JSON fields are camelCase; ids are UUID strings; timestamps are ISO-8601 strings with offset.
- Never expose storage internals: no database row shapes, password or token hashes, internal flags.
- Collections return `{ items, nextCursor }` and take `limit` and `cursor` query parameters, with the
  limits the `api-design` rule states.
- Partial updates are `PATCH` with every field optional; the body never carries id, owner, role or
  timestamps.

## Errors

- Every error response uses `application/problem+json` with one shared `Problem` schema:
  `{ type, title, status, detail, code, instance, errors? }`. Clients branch on `code`.
- Declare each error status an AC requires, with a description naming the AC and the `code`:
  `"422": { description: "VALIDATION_FAILED or COUPON_EXPIRED (AC-0002)" }`.
- Typical set per operation, only where it applies:

| Status | When |
|---|---|
| 401 | the operation needs a signed-in caller |
| 403 | the caller is signed in but lacks the role |
| 404 | the resource does not exist **or the caller may not see it** (never leak existence) |
| 409 | a conflict with the current state (duplicate, version clash) |
| 422 | input fails validation or a business rule |
| 429 / 503 | only when a spec AC or NFR mentions rate limits or degraded service |

- Protected operations declare `security` with the bearer scheme under
  `components.securitySchemes`.

## Frontend-only and partial setups

- Backend disabled: still write the contract with `owner_role: backend`. The plan gate does not
  demand a backend task for a disabled role; the frontend's api-client task lists the operation in
  its `contract_ops` and builds against the contract.
- No API at all (a pure UI change, a local calculation): write no contract file. The component map
  then lists no `contract_ops`; say so in the envelope summary.

## Changing a contract later

After GATE-B the contract is agreed. A change needs an ADR and an impact note for every role that
consumes the operation; removing an operation other clients use is a human-owned decision
(`public_api_removal`). Additive changes (a new optional field, a new operation) need no new version
prefix; a removed field, a renamed `code` or a changed type does.
