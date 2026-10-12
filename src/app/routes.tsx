import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom'
import { AppLayout } from '@/layout/AppLayout'
import { ALL_NAV_ITEMS } from '@/navigation/nav'
import { RouteGuard } from '@/permissions/RouteGuard'
import { useCurrentUser } from '@/permissions/hooks'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { ForgotPasswordPage, LoginPage, SetPasswordPage, VerifyPage } from '@/pages/auth/AuthPages'
import { editorialPages } from '@/pages/editorial/routes'
import { productionPages } from '@/pages/production/routes'
import { publishingPages } from '@/pages/publishing/routes'
import { financePages } from '@/pages/finance/routes'
import { communicationPages } from '@/pages/communication/routes'
import { websitePages } from '@/pages/website/routes'
import { insightsPages } from '@/pages/insights/routes'
import { adminPages } from '@/pages/admin/routes'
import { ComingSoon } from './ComingSoon'
import { NotFoundPage } from './ErrorPages'
import type { PageDef } from './pageDef'
import { PrototypeControls } from '@/layout/PrototypeControls'
import { ToastViewport } from '@/components/Toasts'
import { useDensityEffect } from './useDensityEffect'

const REGISTERED: PageDef[] = [
  { path: '/', area: 'dashboard', element: <DashboardPage /> },
  ...editorialPages, ...productionPages, ...publishingPages, ...financePages,
  ...communicationPages, ...websitePages, ...insightsPages, ...adminPages,
]

function AuthGuard() {
  const user = useCurrentUser()
  const loc = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  return <Outlet />
}

function Root() {
  useDensityEffect()
  return (
    <>
      <Outlet />
      <PrototypeControls />
      <ToastViewport />
    </>
  )
}

// Vite's BASE_URL keeps routing relative to wherever the admin is deployed.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

// Nav entries without a registered screen fall back to the placeholder.
const placeholders: PageDef[] = ALL_NAV_ITEMS.filter((n) => !REGISTERED.some((r) => r.path === n.path)).map((n) => ({
  path: n.path, area: n.area, element: <ComingSoon item={n} />,
}))

export const router = createBrowserRouter(
  [
    {
      element: <Root />,
      children: [
        { path: '/login', element: <LoginPage /> },
        { path: '/forgot-password', element: <ForgotPasswordPage /> },
        { path: '/set-password', element: <SetPasswordPage /> },
        { path: '/verify', element: <VerifyPage /> },
        {
          element: <AuthGuard />,
          children: [
            {
              element: <AppLayout />,
              children: [
                ...[...REGISTERED, ...placeholders].map((p) => ({
                  path: p.path,
                  element: <RouteGuard area={p.area} min={p.min}>{p.element}</RouteGuard>,
                })),
                { path: '*', element: <NotFoundPage /> },
              ],
            },
          ],
        },
      ],
    },
  ],
  { basename },
)
