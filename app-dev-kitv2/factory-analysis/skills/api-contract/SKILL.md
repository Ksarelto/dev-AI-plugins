---
name: api-contract
description: Procedure for the factory contract-steward — define the feature's API operations in OpenAPI 3.1 with schemas, problem+json errors and x-factory acceptance-criteria tracing, so frontend and backend can build in parallel. Preloaded by the contract-steward; not for direct use.
user-invocable: false
---

# API contract

Runs on: contract-steward (sonnet) — turning a component map's API needs into one exact OpenAPI
document every role builds against.

Write `03-architecture/api-contract.yaml` ([fa-api-contract.yaml](../../templates/fa-api-contract.yaml)).
Layout, paths, schemas, errors and what each check reads:
[fa-openapi-rules.md](references/fa-openapi-rules.md). The backend conventions are
`node-backend-dev-kit`'s `api-design` rule and `openapi-docs` skill — load them from T1; never
restate them in the contract.

## Procedure

1. **Read the pack.** T1 lists the stack knowledge for the backend role (`node-backend-dev-kit:
   openapi-docs` and the stack's rules) when that role is enabled; load the skill as reference and
   read `rules/api-design.mdc`. T2 gives the spec, stories, the component map, the capability map.
2. **List the operations**: exactly the `operationId`s in the component map's `contract_ops`. If the
   map lists none and no story calls an API, write no contract and say so in the summary.
3. **Existing or new?** For each operation, look for it in the capability map's routes. An existing,
   unchanged operation gets `x-factory.status: existing` and its real shape, copied from its route
   and schema files. Everything else is new.
4. **Paths and methods**: the full path the backend registers (`/api/v1/<plural-kebab-noun>`), the
   method and success code the `api-design` rule gives, one path per line at 2 spaces, methods at 4.
5. **Trace**: `x-factory: { feature, acs, owner_role }` on every operation; `acs` lists the happy AC
   and every error AC the operation answers; `owner_role` is the role that builds it.
6. **Schemas**: named request and response schemas under `components.schemas`; closed request
   bodies (`additionalProperties: false`, `required`); limits copied from the ACs' numbers.
7. **Errors**: `application/problem+json` with the shared `Problem` schema; one response per error
   status an AC needs (401, 403, 404, 409, 422 as they apply), each naming its AC and `code`.
8. **Security**: a bearer scheme and `security` on protected operations.
9. Run the exit check from T0. Failures in the component map are the architect's: return
   `needs_scope_change` instead of editing it.

## Decision table

| Situation | Do |
|---|---|
| the map's `contract_ops` names an operation no story needs | define it anyway; tell the architect in `deviations` |
| a story needs an API call the map does not list | `needs_scope_change` naming the operation |
| an AC implies an error status the operation cannot return | add the response; cite the AC |
| an existing operation must change its shape | define the change; flag it in `deviations` — an ADR is needed |
| backend role disabled | still `owner_role: backend`; the frontend builds against the contract |
| an agent service exposes the route | `owner_role: ai-agent` |

## Mini example

```yaml
paths:
  /api/v1/orders/{orderId}/reorder:
    post:
      operationId: reorderOrder
      x-factory: { feature: FEAT-002, acs: [AC-0001, AC-0002], owner_role: backend }
      security: [{ bearerAuth: [] }]
      parameters:
        - { name: orderId, in: path, required: true, schema: { type: string, format: uuid } }
      responses:
        "201": { description: Cart with the reordered lines, content: { application/json: { schema: { $ref: "#/components/schemas/ReorderResult" } } } }
        "404": { description: "ORDER_NOT_FOUND — unknown or another customer's order (NFR-3)", content: { application/problem+json: { schema: { $ref: "#/components/schemas/Problem" } } } }
```

`ReorderResult` carries `cartId`, `added` and `skipped` (the part numbers AC-0002 reports).

## What the gates check

| Rule | Failure |
|---|---|
| OpenAPI 3.x | `openapi-version` |
| an `operationId` on every operation, unique | `no-operation-id`, `duplicate-operation` |
| `x-factory.acs` present and each a spec AC | `no-acs`, `unknown-ac` |
| a 2xx response on every operation | `no-success-response` |
| every component-map `contract_ops` entry defined | `unknown-operation` |
| later, gate-plan: a task of the `owner_role` lists each new operation | `contract-op-without-task` |
| at verification, the backend audit: every path + method registered in its document | `missing-in-document` |
