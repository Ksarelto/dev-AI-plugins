import { http } from '@/shared/api/base'

export const placeOrder = (input: { quantity: number }): Promise<void> => http.post('orders', { json: input }).json()
