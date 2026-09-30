# Import Order in Test Files

Organize a test file in this order. `vi.mock()` calls come **before** imports — Vitest hoists them, and placing them first makes the intent explicit.

1. `vi.mock()` calls — boundaries only (`mock-patterns.md`)
2. Testing library (`@testing-library/react`, `@testing-library/user-event`)
3. Aliased app imports (`@/…`), including `render` / `renderHook` from `@/shared/lib/rendererRTL`
4. Relative imports — the unit under test, its types, the mocked fetcher

```ts
vi.mock('@/shared/config/env', () => ({
  env: { reportsEnabled: false },
}))
vi.mock('../../api/fetchers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/fetchers')>()),
  fetchProfiles: vi.fn(),
}))
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => mockNavigate,
}))

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/shared/lib/rendererRTL'
import { fetchProfiles } from '../../api/fetchers'
import { ProfilesList } from './profiles-list'
import type { ProfilesListProps } from './types'
```

The block is written without comments; the numbered list above is the documentation.

## Rules

- Mock external boundaries before slice-local ones
- Use descriptive mock names with `mock` prefix for mock constants and functions
- Define mock data and `vi.fn()` constants **after** imports, before `describe`/tests. A `mock*` variable used inside a `vi.mock` factory must be referenced lazily (inside a function), because the factory is hoisted above it
- If the same mock value is used in most test cases, define it outside test cases and override only where needed with `mockReturnValueOnce` / `mockResolvedValueOnce`
- No `import React from 'react'` — the JSX transform does not need it
