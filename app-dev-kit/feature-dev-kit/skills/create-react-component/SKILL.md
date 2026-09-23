---
name: create-react-component
description: Scaffold a React component in the correct FSD layer — presentational (entities/ui, shared/ui) or smart container (features/ui, widgets/ui) — with matching styles, tests, and index export. Uses real app patterns.
argument-hint: <ComponentName> [presentational|container|hook]
disable-model-invocation: false
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Create React Component

Read one recipe file only when that step needs it. Do not read the matching `rules/*.mdc` — globs already attach them.

| Step | Recipe |
|------|--------|
| Component shape | `references/component-patterns.md` |
| Exported types | `references/typescript.md` |
| Classes and tokens | `references/styling.md` |
| States and layout | `references/ui-quality.md` |
| Labels, focus, live regions | `references/a11y.md` |
| Colocated test | `references/test-patterns.md` |

## Step 0 — Choose the type

| Type | Where | When |
|------|-------|------|
| **Presentational** | `entities/<domain>/ui/`, `shared/ui/`, `features/<slice>/ui/` | No state, no API calls; renders props |
| **Container** | `features/<slice>/ui/`, `widgets/<name>/ui/` | Owns local state, calls mutation or query hooks |
| **Custom hook** | `features/<slice>/model/`, `widgets/<name>/model/`, or co-located `hooks/` | Encapsulates stateful logic reused by ≥2 components |

---

## Template A — Presentational component

Based on `src/components/Tag/Tag.tsx` in the existing codebase.

### `ComponentName.tsx`
```tsx
import type { JSX } from 'react'
// import type { BaseAntdProps } from 'antd/es/...'  ← extend if wrapping antd
import { TEST_ID } from '@/shared/config/testId'
import { StyledWrapper } from './ComponentName.styles'

interface IComponentNameProps {
  // required props first
  label: string
  // optional props with sensible defaults
  loading?: boolean
  disabled?: boolean
}

export const ComponentName = ({
  label,
  loading = false,
  disabled = false,
}: IComponentNameProps): JSX.Element => (
  <StyledWrapper
    $disabled={disabled}
    $loading={loading}
    data-testid={TEST_ID.COMPONENT_NAME}
  >
    {label}
  </StyledWrapper>
)
```

### `ComponentName.styles.ts`
```ts
import styled from 'styled-components'

interface IStyledWrapperProps {
  $disabled?: boolean   // transient props — $ prefix prevents DOM forwarding
  $loading?: boolean
}

export const StyledWrapper = styled.div<IStyledWrapperProps>`
  padding: 0.8rem 1.6rem;   /* 1rem = 10px */
  border-radius: 0.4rem;
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.color.textDisabled : theme.color.textPrimary};
  /* never hardcode hex — always theme.color.* */
`
```

### `ComponentName.test.tsx`
```tsx
import { render, screen } from '@/utils/rendererRTL'
import { TEST_ID } from '@/shared/config/testId'
import { ComponentName } from './ComponentName'

const defaultProps = {
  label: 'Test label',
}

beforeEach(() => vi.clearAllMocks())

test('renders label', () => {
  render(<ComponentName {...defaultProps} />)
  expect(screen.getByTestId(TEST_ID.COMPONENT_NAME)).toBeInTheDocument()
  expect(screen.getByText('Test label')).toBeInTheDocument()
})

test('applies disabled appearance when disabled prop is true', () => {
  render(<ComponentName {...defaultProps} disabled />)
  // assert visual/aria change
})
```

### `index.ts`
```ts
export { ComponentName } from './ComponentName'
export type { IComponentNameProps } from './ComponentName'
```

---

## Template B — Container with local state + mutation

Based on `src/containers/AssignDocumentTypes/AssignDocumentTypes.tsx` in the existing codebase.

### `ContainerName.tsx`
```tsx
import { useState, useCallback } from 'react'
import type { JSX } from 'react'
import { Spin } from '@/shared/ui'
import { TextContent } from '@/shared/config/textContent'
import { useGetEntity, useActionEntity } from '@/entities/entity'
import { Wrapper } from './ContainerName.styles'

interface IContainerNameProps {
  entityId: string
  onClose: () => void
}

export const ContainerName = ({
  entityId,
  onClose,
}: IContainerNameProps): JSX.Element => {
  const [isProcessing, setIsProcessing] = useState(false)

  const { data, isPending } = useGetEntity(entityId)
  const { mutateAsync: doAction } = useActionEntity()

  const handleSubmit = useCallback(async () => {
    try {
      setIsProcessing(true)
      await doAction({ entityId })
      onClose()
    } finally {
      setIsProcessing(false)
    }
  }, [entityId, doAction, onClose])

  // Loading guard — return early before main render
  if (isPending) return <Spin spinning />
  if (!data) return <EmptyState />

  return (
    <Wrapper>
      {/* child components receive data as props */}
    </Wrapper>
  )
}
```

**Key patterns from this template:**
- `isPending` from query for initial skeleton; separate `isProcessing` state for the action button.
- `useCallback` with full dependency array for async handlers.
- Early return guards in order: loading → missing data → main render.
- `onClose` called after `await` succeeds — never in `finally`.

---

## Template C — Custom hook

Based on `src/containers/PIIRedactionModal/hooks/useDownloadPIIRedactedFiles` in the existing codebase.

### `useHookName.ts`
```ts
import { useCallback, useState } from 'react'
import { isErrorResponse } from '@/shared/lib/guards'
import { errorHandler } from '@/shared/lib/errorHandler'
import { notifySuccess } from '@/shared/lib/notification'
import { TextContent } from '@/shared/config/textContent'
import { useActionEntity } from '@/entities/entity'

interface IUseHookNameParams {
  entityId: string
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

interface IUseHookNameReturn {
  trigger: (payload: IActionPayload) => Promise<void>
  isLoading: boolean
}

export const useHookName = ({
  entityId,
  onSuccess,
  onError,
}: IUseHookNameParams): IUseHookNameReturn => {
  const [isLoading, setIsLoading] = useState(false)
  const { mutateAsync } = useActionEntity()

  const trigger = useCallback(async (payload: IActionPayload) => {
    try {
      setIsLoading(true)
      await mutateAsync({ entityId, ...payload })
      notifySuccess(TextContent.ACTION_SUCCESS)
      onSuccess?.()
    } catch (error: unknown) {
      if (isErrorResponse(error)) errorHandler(error)
      onError?.(error)
    } finally {
      setIsLoading(false)
    }
  }, [entityId, mutateAsync, onSuccess, onError])

  return { trigger, isLoading }
}
```

**Key patterns from this template:**
- Typed `params` interface and `return` interface — always define both explicitly.
- `setIsLoading` in `try`/`finally` — never in just `try`.
- `isErrorResponse` guard before `errorHandler`.
- Optional callbacks called with `?.()`.
- `useCallback` with full dependency array.
- Return plain object `{ trigger, isLoading }` — not an array.

---

## Post-creation checklist

- [ ] Named export only — no `export default` (pages are the exception)
- [ ] `: JSX.Element` return type on the component
- [ ] Props typed with `interface`, not `type`
- [ ] Styles in `.styles.ts` — no inline `style={{ }}` objects
- [ ] No hardcoded strings — use `TextContent.KEY`
- [ ] No hardcoded hex colors or `px` values in styles
- [ ] `index.ts` exports only the public API of this slice
- [ ] Test file covers: renders, user interaction, loading state, error/empty state
- [ ] `yarn typecheck` passes before marking the task done
