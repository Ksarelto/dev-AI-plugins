import { httpClient } from '@/shared/api/base'

export const toCart = (body: unknown): unknown => {
  return httpClient.post('cart', { json: body })
}
