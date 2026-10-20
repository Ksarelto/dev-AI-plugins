import { http } from '@/shared/api/base'

export const placeOrder = (input: { quantity: number }): Promise<void> => http.post('orders', { json: input }).json()

const orderLabel = (quantity: number): string => {
  let label = 'order'

  if (quantity > 1) {
    label = 'orders'
  }

  const summary: string = (
    `${quantity} ${label}`
  )

  return summary
}
