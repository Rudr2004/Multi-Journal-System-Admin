import { Link, Navigate, useLocation } from 'react-router-dom'
import { startSession } from '@/lib/api/session'
import { useSession } from '@/mock/store'
import { AuthShell, SessionLoading } from './AuthShell'
import { MfaSetupPanel } from './MfaSetupPanel'
import { useLoginFlow } from './loginFlow'

/** A Super Admin without two-step sign-in: no session exists yet, so setup runs on the `mfaToken` from the login answer. */
export function MfaSetupPage() {
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const authStatus = useSession((s) => s.authStatus)
  const { step, mfaToken } = useLoginFlow()

  if (authStatus === 'loading') return <SessionLoading />
  // The panel keeps the page until the recovery codes are acknowledged, so a session created by the setup must not redirect early.
  if (step !== 'setup' || !mfaToken) return authStatus === 'authenticated' ? <Navigate to={from} replace /> : <Navigate to="/login" replace />

  return (
    <AuthShell title="Set up two-step sign-in" subtitle="Super Admins must use an authenticator app. You will be signed in when this is done."
      footer={<Link to="/login" onClick={() => useLoginFlow.getState().clear()} className="hover:underline">Cancel and back to sign in</Link>}>
      <MfaSetupPanel mfaToken={mfaToken} onDone={(session) => {
        useLoginFlow.getState().clear()
        if (session) startSession(session)
      }} />
    </AuthShell>
  )
}
