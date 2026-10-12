import { useMutation } from '@tanstack/react-query'
import { placeOrder } from '../api/fetchers'

export const usePlaceOrder = () => {
  const mutation = useMutation({ mutationFn: placeOrder })

  return { ...mutation, isOut: false }
}
