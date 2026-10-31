---
name: discovery-scan
description: Procedure for the factory codebase-analyst — map an existing application into an app profile, a capability map of features with paths and routes, and a baseline feature ledger, with a conformance verdict against the stack's reference architecture. Preloaded by the codebase-analyst; not for direct use.
user-invocable: false
---

# Discovery scan (once per app)

Produce three files ([fa-app-profile.yaml](../../templates/fa-app-profile.yaml),
[fa-capability-map.yaml](../../templates/fa-capability-map.yaml),
[fa-feature-ledger.yaml](../../templates/fa-feature-ledger.yaml)). The human confirms them once at
GATE-D; every later feature plans against them.

## Order of work (cheap to expensive)

1. `git ls-files` and the top-level layout: framework, package manager, source root.
2. Route table and entry points (router files, page folders, API routers) — one capability per
   user-visible area.
3. For each capability: the folders that implement it (`paths`, globs allowed but specific — a glob
   that matches most of the app fails the gate), its routes, and a
   one-line summary. Every path must match real files.
4. Conformance: compare the layout with the stack's reference architecture named in your pack
   (layers, import direction, public APIs) — the pack lists it under "Stack". Use `conformant`,
   `partial` or `non-conformant` and explain deviations in the profile's `notes`; do not fix them.
   `conformant` is checked: the gate runs each stack's architecture check and fails the claim if it fails.
5. Feature ledger: one entry per capability, `status: discovered`, `version: 1`.

## Budget

Read structure, not bodies: file lists, route definitions, index files and a few representative
components. Stop when every top-level area has a capability; precision beats coverage of details.
`origin` in the app profile is `discovered`.

Run the exit check from T0 before you return.
