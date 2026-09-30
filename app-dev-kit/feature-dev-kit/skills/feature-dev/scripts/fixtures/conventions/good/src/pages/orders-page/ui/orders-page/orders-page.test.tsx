import { render, screen } from '@testing-library/react'
import OrdersPage from './orders-page'

describe('OrdersPage', () => {
  it('shows the place-order action', () => {
    render(<OrdersPage />)

    const button = screen.getByRole('button', { name: 'Place order' })

    expect(button).toBeInTheDocument()
  })
})
