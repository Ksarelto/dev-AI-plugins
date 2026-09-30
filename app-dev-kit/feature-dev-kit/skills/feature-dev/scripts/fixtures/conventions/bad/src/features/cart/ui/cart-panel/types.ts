import { z } from 'zod'

export const cartSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email({ message: 'Enter a valid email' }),
})

export interface CartPanelProps {
  items: string[]
  isLoading: boolean
  onClose: (open: boolean) => void
}
