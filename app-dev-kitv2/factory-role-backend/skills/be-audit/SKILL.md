---
name: be-audit
description: Procedure for the factory backend auditor — compare the OpenAPI document's registered paths with the agreed API contract and re-run the migration check on the change set, reporting each hit as a finding. Preloaded by be-auditor; not for direct use.
user-invocable: false
---

# Backend audit

1. From the backend's package folder (`roles.backend.path` in `.factory/factory.config.yaml`, else the project root; `<role pack>`
   is this plugin's folder, two levels above this skill), with change-set paths made relative to it:

   ```bash
   node <role pack>/scripts/openapi-conformance.mjs --contract <feature>/03-architecture/api-contract.yaml --document src/openapi/document.ts
   node <role pack>/scripts/check-migrations.mjs --project . --files <change-set files…>   # no --task-type: audit only
   ```

   The first prints a JSON array of `{ rule, method, path }`; the second prints one problem per line
   and exits 1 when there are any. Skip the first when the feature has no API contract.
2. Report every hit as a finding with `lens: "audit"`:
   - `missing-in-document` (the contract has an operation the document lacks) → `P1`;
   - `not-in-contract` (the document registers an operation under the contract's paths that the
     contract does not have) → `P2`;
   - a migration problem → `P1`.
3. No hits is a valid result: return an empty `findings` list.
