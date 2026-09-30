import { z } from 'zod'
import { ordersKeys } from '../../locales/keys'

export const placeOrderSchema = z.object({
  quantity: z.number().min(1, ordersKeys.form.errors.quantityMin),
})

export interface PlaceOrderProps {
  onDone: () => void
}
