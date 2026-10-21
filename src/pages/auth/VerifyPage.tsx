import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { FormField } from '@/components/Form'
import { verifyMfa } from '@/lib/api/auth'
import { errorMessage, isApiError } from '@/lib/api/errors'
import { startSession } from '@/lib/api/session'
import { useSession } from '@/mock/store'
import { AuthShell, Notice, SessionLoading } from './AuthShell'
import { useLoginFlow } from './loginFlow'

/** Second step of a two-step login: the 6-digit code, or one recovery code instead. */
export function VerifyPage() {
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const authStatus = useSession((s) => s.authStatus)
  const { step, mfaToken } = useLoginFlow()
  const [useRecovery, setUseRecovery] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  if (authStatus === 'loading') return <SessionLoading />
  if (authStatus === 'authenticated') return <Navigate to={from} replace />
  if (step !== 'verify' || !mfaToken) return <Navigate to="/login" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const entered = value.trim()
    if (!useRecovery && !/^\d{6}$/.test(entered)) return setError('Enter the 6-digit code from your authenticator app.')
    if (useRecovery && entered.replace(/[\s-]/g, '').length < 8) return setError('Enter one of your recovery codes, for example ABCD-EFGH-JKLM-NPQR.')
    setBusy(true)
    setError(undefined)
    try {
      const session = await verifyMfa(useRecovery ? { mfaToken, recoveryCode: entered } : { mfaToken, code: entered })
      useLoginFlow.getState().clear()
      startSession(session)
    } catch (err) {
      if (isApiError(err) && err.is('MFA_TOKEN_INVALID')) {
        // Expired, already used or cancelled after 5 wrong codes: the password step has to be repeated.
        useLoginFlow.getState().clear()
        return navigate('/login', { replace: true, state: { mfaExpired: true } })
      }
      if (isApiError(err) && err.is('ACCOUNT_DISABLED')) {
        useLoginFlow.getState().clear()
        return navigate('/account-disabled', { replace: true })
      }
      setError(isApiError(err) && err.is('MFA_CODE_INVALID') ? (useRecovery ? 'That recovery code is not correct or was already used.' : 'That code is not correct. Wait for the next code and try again.') : errorMessage(err))
    } finally { setBusy(false) }
  }

  const toggle = () => { setUseRecovery((v) => !v); setValue(''); setError(undefined) }
  return (
    <AuthShell title="Two-step verification" subtitle={useRecovery ? 'Enter one of your recovery codes. Each works once.' : 'Enter the 6-digit code from your authenticator app.'}
      footer={<Link to="/login" onClick={() => useLoginFlow.getState().clear()} className="hover:underline">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice>{error}</Notice>}
        <FormField label={useRecovery ? 'Recovery code' : 'Verification code'} hint={useRecovery ? 'Capitals, spaces and dashes do not matter.' : 'The code changes every 30 seconds.'}>
          {(a) => useRecovery ? (
            <input {...a} autoComplete="off" autoFocus spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} className="input font-mono uppercase tracking-wider" />
          ) : (
            <input {...a} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} className="input text-center text-lg tracking-[0.5em]" />
          )}
        </FormField>
        <button className="btn-primary w-full" disabled={busy}><ShieldCheck size={15} aria-hidden /> {busy ? 'Verifying…' : 'Verify and continue'}</button>
        <button type="button" className="btn-ghost w-full" onClick={toggle}><KeyRound size={15} aria-hidden /> {useRecovery ? 'Use an authenticator code instead' : 'Lost your phone? Use a recovery code'}</button>
      </form>
    </AuthShell>
  )
}
