import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import { withRouteBoundary } from './with-route-boundary'

const OrdersPage = lazy(() => import('@/pages/orders-page'))

export const router = createBrowserRouter([
  { path: '/orders', element: withRouteBoundary(<OrdersPage />) },
])
