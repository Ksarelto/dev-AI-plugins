/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './app/router/routes'

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
