---
name: api-contract
description: Procedure for the factory contract-steward — define the feature's API operations in OpenAPI 3.1 with schemas, problem+json errors and x-factory acceptance-criteria tracing, so frontend and backend can build in parallel. Preloaded by the contract-steward; not for direct use.
user-invocable: false
---

# API contract

Write `03-architecture/api-contract.yaml` ([fa-api-contract.yaml](../../templates/fa-api-contract.yaml)).

1. Define exactly the operations in the component map's `contract_ops`, no more. Reuse existing
   endpoints from the capability map when they already serve the need.
2. Every operation has a unique `operationId` and `x-factory: { feature, acs, owner_role }`; `acs`
   lists the acceptance criteria it serves (they must exist in the spec).
3. Request and response bodies are named schemas under `components.schemas`; validation limits
   (`minLength`, `format`, `enum`) come from the ACs.
4. Errors use `application/problem+json` with a `Problem` schema; give each error status the AC that
   requires it (e.g. 422 for an expired coupon).
5. Path and field naming follows the existing API when one exists; otherwise plural nouns and
   camelCase fields.

The frontend builds against mocks generated from this file, so an incomplete schema blocks it. After
GATE-B a change needs an ADR and an impact note for every role that consumes the operation.

Run the exit check from T0 before you return.
