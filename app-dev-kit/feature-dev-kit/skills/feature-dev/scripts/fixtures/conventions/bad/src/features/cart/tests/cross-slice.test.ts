import { render } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('@/entities/user/api/fetchers')

const readLabel = (): string | null => {
  const { container } = render(null)
  const node = container.querySelector('div')
  return node ? node.textContent : null
}
