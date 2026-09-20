# Template: mock-data-js.md

Structural base for `js/data.js` — Alpine.data blocks with realistic entity mock pools.
`component-library-author` clones this pattern once per entity. **CDN-free** (Alpine is the only
runtime dependency and is loaded per page).

Rules:
- One `Alpine.data('{Entity}Data', ...)` block per entity.
- 6–8 records per pool; realistic values (never "Mock Name 1"); ISO dates spread over ~90 days.
- Include at least one record per status variant.
- Every block exposes the same contract so screen templates stay uniform.

---

```javascript
// Entity mock data pools — one Alpine.data block per entity.
// Each block is registered on alpine:init and consumed via x-data="{Entity}Data()".

document.addEventListener('alpine:init', () => {

  // ── Example entity block — clone & adapt per spec entity ──────────────
  Alpine.data('ExampleData', () => ({
    items: [
      // shape must match the entity's api_contract exactly
      { id: 'a1f3c9e2', name: 'Quarterly Revenue Report', status: 'ACTIVE',  createdAt: '2026-05-02T09:14:00Z' },
      { id: 'b7d2e4a1', name: 'Vendor Onboarding Packet', status: 'PENDING', createdAt: '2026-05-18T13:40:00Z' },
      { id: 'c3a8f012', name: 'Compliance Audit 2026',    status: 'DECLINED',createdAt: '2026-04-27T16:05:00Z' },
      { id: 'd9e1b7c4', name: 'Customer NDA — Acme Corp',  status: 'ACTIVE',  createdAt: '2026-06-11T08:22:00Z' },
      { id: 'e5c6a3d8', name: 'Marketing Brief Q3',        status: 'PENDING', createdAt: '2026-06-30T11:50:00Z' },
      { id: 'f2b4d6e9', name: 'Legacy System Migration',   status: 'ACTIVE',  createdAt: '2026-05-24T14:33:00Z' },
    ],
    defaultItems: [],
    loading: false,
    error: null,
    filter: { search: '', status: '' },

    init() {
      this.defaultItems = JSON.parse(JSON.stringify(this.items));
    },

    get filteredItems() {
      const q = this.filter.search.trim().toLowerCase();
      return this.items.filter((it) => {
        const matchesSearch = !q || Object.values(it).some(
          (v) => typeof v === 'string' && v.toLowerCase().includes(q)
        );
        const matchesStatus = !this.filter.status || it.status === this.filter.status;
        return matchesSearch && matchesStatus;
      });
    },

    reload() {
      this.loading = true;
      this.error = null;
      setTimeout(() => {
        this.items = JSON.parse(JSON.stringify(this.defaultItems));
        this.loading = false;
      }, 800);
    },

    remove(id) {
      this.items = this.items.filter((it) => it.id !== id);
    },
  }));

});
```

---

## Contract every generated block must expose

| Member | Type | Purpose |
|--------|------|---------|
| `items` | array | Full pool, shaped like `api_contract` |
| `defaultItems` | array | Deep-copy reset source (set in `init`) |
| `loading` | boolean | Loading-state flag |
| `error` | string \| null | Error-state message |
| `filter` | object | `{ search, status, ... }` |
| `filteredItems` | getter | `items` filtered by `filter` |
| `init()` | fn | Deep-copies `items` → `defaultItems` |
| `reload()` | fn | Simulated fetch (loading→false after 800ms) |
| `remove(id)` | fn | Removes a record (used by delete actions) |

Use `JSON.parse(JSON.stringify(...))` for `defaultItems` so the dev-panel "reset to success"
restores a pristine pool even after deletes.
