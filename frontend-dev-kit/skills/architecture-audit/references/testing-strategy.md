# Testing strategy

Segment tests live in a `tests/` folder next to the code. A component's tests live in `{component}/tests/`, not beside `{name}.tsx`. No MSW in unit/RTL. No cross-slice fixtures.

## Evaluate

**Hard**

- Test dirs: `features/{f}/{api,hooks,models,lib}/tests/`, `entities/{e}/model/tests/`, `entities/{e}/api/tests/`, `widgets/{w}/{hooks,model}/tests/`, `shared/lib/tests/` (**one** folder for every `shared/lib/*` unit — not `shared/lib/auth/tests/`), `shared/api/tests/`.
- Folder name is exactly `tests/` — not `__tests__`, not `spec/`, not a slice-level `features/{f}/tests/`, not `src/tests/`.
- Component tests: `{component}/tests/{name}.test.tsx` only. A sibling `{name}.test.tsx` is hard. Non-component tests live in the segment `tests/` folder, not beside the source file.
- No `__fixtures__/` shared across features. Mocks live in the test file.
- HTTP mock: inside the slice that owns the fetcher, `vi.mock('../api/fetchers')`; any other test, `vi.mock('@/shared/api/base')` (`httpClient`). Mocking another slice's `api/fetchers` path or its public `index.ts` is a finding. No MSW/interceptor in unit or RTL.
- No test in feature A that asserts feature B's cache invalidation — that is e2e.
- `models/tests/`: plain unit. No `vi.useFakeTimers()` (pass clock as input).
- `hooks/tests/`: assert call order, invalidation, retry of the same payload, no follow-up write on failure. Keep thin — extra branches belong in `models/tests/`.
- SSE hook tests: fake realtime; assert own keys only + version guard; spy `notify` for event effects. Connection (`init`, visibility) is tested once in `shared/api/tests/`.
- Auth: a fake session provider taking a `Session` literal, not a mocked `useSession()` per file. `RequireAuth` covers all three statuses.
- `e2e/` lives outside `src/`: real HTTP, no mocked ky/fetch.

**Judgment**

- Widget behavior tests are RTL in the component folder. A widget story is not required.
- A uniqueness test that every `query-keys/` factory root is unique.

## How

```bash
find src -type d \( -name __tests__ -o -name spec -o -name __fixtures__ \)
find src/features -mindepth 2 -maxdepth 2 -type d -name tests
find src -name '*.test.ts' -o -name '*.test.tsx'
rg -n "from ['\"]msw|setupServer|http\.get" src --glob '**/*.{test,spec}.{ts,tsx}'
rg -n "from ['\"]@/features/" src/features --glob '**/*.{test,spec}.{ts,tsx}'
rg -n "useFakeTimers" src/**/models/**/*.test.ts
```

A `*.test.ts` sitting next to `api/fetchers.ts` (not in `api/tests/`) is hard. A component test beside `{name}.tsx`, or in a slice-level `ui/tests/`, is hard — it belongs in `{component}/tests/`. Cross-feature imports in tests are hard — same rule as production.
