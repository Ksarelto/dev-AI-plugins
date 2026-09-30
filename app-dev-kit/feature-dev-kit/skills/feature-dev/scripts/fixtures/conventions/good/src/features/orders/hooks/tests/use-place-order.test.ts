import { renderHook } from '@testing-library/react'
import { usePlaceOrder } from '../use-place-order'

describe('usePlaceOrder', () => {
  it('reports the listing as available', () => {
    const { result } = renderHook(() => usePlaceOrder())

    expect(result.current.isOut).toBe(false)
  })
})
