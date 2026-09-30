import { render, screen } from '@testing-library/react'
import { withRouteBoundary } from '../with-route-boundary'

describe('withRouteBoundary', () => {
  it('renders the page inside the boundary', () => {
    render(withRouteBoundary(<h1>Orders</h1>))

    const heading = screen.getByRole('heading', { name: 'Orders' })

    expect(heading).toBeInTheDocument()
  })
})
