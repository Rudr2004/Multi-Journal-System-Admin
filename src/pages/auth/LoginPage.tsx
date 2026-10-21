import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FormField } from '@/components/Form'
import { login } from '@/lib/api/auth'
import { errorMessage, isApiError } from '@/lib/api/errors'
import { applyServerFieldErrors } from '@/lib/api/forms'
import { startSession } from '@/lib/api/session'
import { useSession, type SessionNotice } from '@/mock/store'
import { MOCK_DATA } from '@/mock/mode'
import { DEMO_PASSWORD, demoUsers, startDemoSession } from '@/mock/demoLogin'
import { AuthShell, Notice, SessionLoading } from './AuthShell'
import { CaptchaField } from './CaptchaField'
import { useLoginFlow } from './loginFlow'
import { formatCountdown, useCountdown } from './useCountdown'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').email('Enter a valid email.'),
  password: z.string().min(1, 'Enter your password.'),
  captchaToken: z.string().optional(),
})

const NOTICES: Record<SessionNotice, string> = {
  revoked: 'You were signed out because your session ended: you signed out on another device, your password or access changed, or an administrator ended it. Sign in again.',
  expired: 'Your session expired. Sign in again.',
  unreachable: 'The server could not be reached, so your session could not be restored. Check your connection and sign in again.',
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { from?: string; passwordUpdated?: boolean; mfaExpired?: boolean } | null
  const from = state?.from ?? '/'
  const authStatus = useSession((s) => s.authStatus)
  const notice = useSession((s) => s.notice)
  const [formError, setFormError] = useState<string>()
  const [captchaRequired, setCaptchaRequired] = useState(false)
  const lock = useCountdown()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', captchaToken: '' },
  })

  if (authStatus === 'loading') return <SessionLoading />
  if (authStatus === 'authenticated') return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async (v) => {
    setFormError(undefined)
    if (captchaRequired && !v.captchaToken?.trim()) {
      setError('captchaToken', { message: 'Complete the verification to continue.' })
      return
    }
    try {
      const outcome = await login({ email: v.email, password: v.password, captchaToken: captchaRequired ? v.captchaToken?.trim() : undefined })
      if (outcome.kind === 'session') {
        startSession(outcome.session)
        return
      }
      useLoginFlow.getState().begin(outcome.kind === 'mfa' ? 'verify' : 'setup', outcome.mfaToken)
      navigate(outcome.kind === 'mfa' ? '/verify' : '/mfa-setup', { state: { from }, replace: true })
    } catch (e) {
      if (!isApiError(e)) return setFormError(errorMessage(e))
      switch (e.code) {
        case 'ACCOUNT_DISABLED':
          return navigate('/account-disabled', { replace: true })
        case 'ACCOUNT_LOCKED':
          lock.start(e.retryAfterSeconds ?? 900)
          return setFormError('Too many failed sign-ins. This account is locked for a while.')
        case 'CAPTCHA_REQUIRED':
          setCaptchaRequired(true)
          return setFormError('After several failed attempts, complete the verification below to continue.')
        case 'CAPTCHA_INVALID':
          setCaptchaRequired(true)
          return setError('captchaToken', { message: 'The verification was not accepted. Try again.' })
        case 'RATE_LIMITED':
          return setFormError('Too many sign-in attempts from this network. Wait a few minutes and try again.')
        case 'VALIDATION_ERROR':
          if (applyServerFieldErrors(e, setError, { email: 'email', password: 'password' })) return
          return setFormError(e.message)
        default:
          return setFormError(e.message)
      }
    }
  })

  const locked = lock.remaining > 0
  return (
    <AuthShell title="Sign in" subtitle="One staff login for all journals.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {notice && !formError && <Notice tone="warning">{NOTICES[notice]}</Notice>}
        {state?.passwordUpdated && !formError && <Notice tone="success">Password updated. Sign in with your new password.</Notice>}
        {state?.mfaExpired && !formError && <Notice tone="warning">The verification step expired. Sign in again.</Notice>}
        {formError && <Notice>{formError}</Notice>}
        {locked && <Notice tone="warning">Try again in <span className="font-semibold tabular-nums">{formatCountdown(lock.remaining)}</span>.</Notice>}
        <FormField label="Work email" error={errors.email?.message}>
          {(a) => <input {...a} type="email" autoComplete="username" autoFocus className="input" {...register('email')} />}
        </FormField>
        <FormField label="Password" error={errors.password?.message}>
          {(a) => <input {...a} type="password" autoComplete="current-password" className="input" {...register('password')} />}
        </FormField>
        {captchaRequired && <CaptchaField error={errors.captchaToken?.message} registration={register('captchaToken')} />}
        <div className="text-right"><Link to="/forgot-password" className="text-sm text-accent hover:underline">Forgot password?</Link></div>
        <button type="submit" className="btn-primary w-full" disabled={isSubmitting || locked}>
          {isSubmitting ? 'Signing in…' : locked ? `Locked · ${formatCountdown(lock.remaining)}` : 'Sign in'}
        </button>
      </form>
      {MOCK_DATA && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">Demo accounts</p>
          <p className="text-xs text-muted">Local mode only: no backend needed. Password: <span className="kbd">{DEMO_PASSWORD}</span></p>
          <ul className="mt-2 space-y-1.5">
            {demoUsers().slice(0, 9).map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => { if (startDemoSession(u.id)) navigate(from, { replace: true }) }} className="flex w-full items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-subtle">
                  <span className="min-w-0"><span className="block truncate font-medium">{u.name}</span><span className="block truncate text-xs text-muted">{u.title}</span></span>
                  <span className="shrink-0 text-xs text-muted">{Object.keys(u.assignments).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AuthShell>
  )
}
