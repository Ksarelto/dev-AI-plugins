vi.mock('@/shared/api/base', () => ({
  http: { post: vi.fn(() => ({ json: vi.fn().mockResolvedValue(undefined) })) },
}))

import { http } from '@/shared/api/base'
import { placeOrder } from '../fetchers'

describe('placeOrder', () => {
  it('posts the quantity to the orders endpoint', async () => {
    await placeOrder({ quantity: 2 })

    expect(http.post).toHaveBeenCalledWith('orders', { json: { quantity: 2 } })
  })
})
