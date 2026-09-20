# Import Order in Test Files

Organize imports in this exact order. All `vi.mock()` calls must come **before** imports — Vitest hoists them.

```ts
// 1. vi.mock() calls — MUST be first (hoisted by Vitest)
vi.mock('@/utils/env')
vi.mock('@/api/profiles/profiles.hooks')
vi.mock('./ChildComponent')
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return { ...actual, useNavigate: vi.fn() }
})

// 2. Testing library
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// 3. React
import React from 'react'

// 4. Custom render utility
import { render, renderHook } from '@/utils/rendererRTL'

// 5. Component-specific (constants, types, component under test)
import { TextContent } from '@/constants/textContent'
import { MyComponent } from './MyComponent'
import type { MyComponentProps } from './MyComponent'
```

## Rules

- `vi.mock()` declarations always come first — they are hoisted regardless of position, but placing them first makes the intent explicit
- Mock external dependencies before component-specific mocks
- Use descriptive mock names with `mock` prefix for mock constants and functions
- Define all mock data and `vi.fn()` constants **after** imports, before `describe`/tests
- If the same mock value is used in most test cases, define it outside test cases and override only where needed with `mockReturnValueOnce` / `mockImplementationOnce`
