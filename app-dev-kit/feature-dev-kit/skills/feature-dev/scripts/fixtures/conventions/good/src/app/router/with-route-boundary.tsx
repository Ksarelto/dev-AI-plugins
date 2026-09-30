import type { ReactNode } from 'react'
import { ErrorBoundary } from '@/shared/ui/error-boundary'

export const withRouteBoundary = (page: ReactNode): JSX.Element => (
  <ErrorBoundary>
    {page}
  </ErrorBoundary>
)
