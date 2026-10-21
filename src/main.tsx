import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/routes'
import { restoreSession } from '@/lib/api/session'
import '@/styles/index.css'

// Sign-in survives a reload through the refresh cookie; the screens wait for this to settle.
void restoreSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
