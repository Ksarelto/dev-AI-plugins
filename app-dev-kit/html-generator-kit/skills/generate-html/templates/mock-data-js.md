# Template: mock-data-js.md

Structural base for `js/data.js` — **seed data only**, no behavior. `component-library-author`
clones this pattern once per entity. **CDN-free** (Alpine is the only runtime dependency and is
loaded per page).

As of Phase 3, `js/data.js` holds one array per entity under `window.PROTOTYPE_SEED` plus
`window.PROTOTYPE_ROLES`, and nothing else. All behavior — loading state, filtering, persistence,
the `entityList`/`entityDetail`/`entityForm` Alpine data factories, and `window.ProtoStore` — lives
in `js/store.js` (see `store-js.md`), shared across every entity instead of hand-written per entity.
This keeps the per-entity output purely declarative, so it can never drift from the shared
behavioral contract the way the old per-entity `Alpine.data(...)` blocks did.

Rules:
- One array per entity under `window.PROTOTYPE_SEED[entity]`.
- 6–8 records per pool; realistic values (never "Mock Name 1"); ISO dates spread over ~90 days.
- Include at least one record per status variant.
- Record shape matches the entity's `api_contract` exactly.
- `window.PROTOTYPE_ROLES` is the spec's top-level `roles[]` (an array of role name strings),
  or `[]` if the spec declares none.

---

```javascript
// Entity seed data — one array per entity under PROTOTYPE_SEED, read by js/store.js.
// No behavior here: loading/filtering/persistence/Alpine registration all live in js/store.js.

window.PROTOTYPE_SEED = {
  // ── Example entity — clone & adapt per spec entity ──────────────
  ExampleEntity: [
    // shape must match the entity's api_contract exactly
    { id: 'a1f3c9e2', name: 'Quarterly Revenue Report', status: 'ACTIVE',   createdAt: '2026-05-02T09:14:00Z' },
    { id: 'b7d2e4a1', name: 'Vendor Onboarding Packet', status: 'PENDING',  createdAt: '2026-05-18T13:40:00Z' },
    { id: 'c3a8f012', name: 'Compliance Audit 2026',    status: 'DECLINED', createdAt: '2026-04-27T16:05:00Z' },
    { id: 'd9e1b7c4', name: 'Customer NDA — Acme Corp', status: 'ACTIVE',   createdAt: '2026-06-11T08:22:00Z' },
    { id: 'e5c6a3d8', name: 'Marketing Brief Q3',       status: 'PENDING',  createdAt: '2026-06-30T11:50:00Z' },
    { id: 'f2b4d6e9', name: 'Legacy System Migration',  status: 'ACTIVE',   createdAt: '2026-05-24T14:33:00Z' },
  ],
}

window.PROTOTYPE_ROLES = []
```

---

## What's no longer here

The old per-entity `Alpine.data('{Entity}Data', ...)` blocks (with `items`, `defaultItems`,
`loading`, `filter`, `filteredItems`, `init`, `reload`, `remove`) are gone — that contract now lives
once, shared, in `store-js.md`'s `entityList`/`entityDetail`/`entityForm` factories and
`window.ProtoStore`. Pages consume an entity via `x-data="entityList('ExampleEntity')"` (etc.), not
`x-data="ExampleEntityData()"`.
