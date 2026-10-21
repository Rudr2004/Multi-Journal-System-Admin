import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom'
import { AppLayout } from '@/layout/AppLayout'
import { ALL_NAV_ITEMS } from '@/navigation/nav'
import { RouteGuard } from '@/permissions/RouteGuard'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { SessionLoading } from '@/pages/auth/AuthShell'
import { LoginPage } from '@/pages/auth/LoginPage'
import { MfaSetupPage } from '@/pages/auth/MfaSetupPage'
import { AccountDisabledPage, ForcedChangePasswordPage, ForgotPasswordPage, SetPasswordPage } from '@/pages/auth/PasswordPages'
import { VerifyPage } from '@/pages/auth/VerifyPage'
import { editorialPages } from '@/pages/editorial/routes'
import { productionPages } from '@/pages/production/routes'
import { publishingPages } from '@/pages/publishing/routes'
import { financePages } from '@/pages/finance/routes'
import { communicationPages } from '@/pages/communication/routes'
import { websitePages } from '@/pages/website/routes'
import { insightsPages } from '@/pages/insights/routes'
import { adminPages } from '@/pages/admin/routes'
import { ProfilePage } from '@/pages/account/ProfilePage'
import { useSession } from '@/mock/store'
import { ComingSoon } from './ComingSoon'
import { NotFoundPage } from './ErrorPages'
import type { PageDef } from './pageDef'
import { ToastViewport } from '@/components/Toasts'
import { useDensityEffect } from './useDensityEffect'

const REGISTERED: PageDef[] = [
  { path: '/', area: 'dashboard', element: <DashboardPage /> },
  { path: '/profile', area: 'dashboard', element: <ProfilePage /> },
  ...editorialPages, ...productionPages, ...publishingPages, ...financePages,
  ...communicationPages, ...websitePages, ...insightsPages, ...adminPages,
]

/** Signed-in area: waits for the session to be restored, sends everyone else to sign in, and holds back a forced password change. */
function AuthGuard() {
  const authStatus = useSession((s) => s.authStatus)
  const me = useSession((s) => s.me)
  const loc = useLocation()
  if (authStatus === 'loading') return <SessionLoading />
  if (authStatus === 'anonymous' || !me) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />
  if (me.mustChangePassword && loc.pathname !== '/change-password') return <Navigate to="/change-password" replace />
  return <Outlet />
}

function Root() {
  useDensityEffect()
  return (
    <>
      <Outlet />
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
        { path: '/mfa-setup', element: <MfaSetupPage /> },
        { path: '/account-disabled', element: <AccountDisabledPage /> },
        {
          element: <AuthGuard />,
          children: [
            { path: '/change-password', element: <ForcedChangePasswordPage /> },
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
