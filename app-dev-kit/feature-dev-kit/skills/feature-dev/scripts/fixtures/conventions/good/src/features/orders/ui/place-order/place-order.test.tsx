vi.mock('../../api/fetchers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/fetchers')>()),
  placeOrder: vi.fn(),
}))

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { placeOrder } from '../../api/fetchers'
import { PlaceOrder } from './place-order'

describe('PlaceOrder', () => {
  it('places the order when the button is clicked', async () => {
    render(<PlaceOrder onDone={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Place order' }))

    expect(placeOrder).toHaveBeenCalled()
  })
})
