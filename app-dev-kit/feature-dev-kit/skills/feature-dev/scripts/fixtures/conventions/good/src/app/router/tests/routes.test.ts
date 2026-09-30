import { router } from '../routes'

describe('router', () => {
  it('registers the orders route', () => {
    const paths = router.routes.map((route) => route.path)

    expect(paths).toContain('/orders')
  })
})
