import { useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldCheck } from 'lucide-react'
import { login, requestPasswordReset, setPassword, verifyTwoStep } from '@/mock/api/auth'
import { useDataStore, useSession } from '@/mock/store'
import { DEMO_PASSWORD, DEMO_USER_LABELS } from '@/mock/data/core'
import { assignedJournals, isSuperAdmin } from '@/permissions/hooks'
import { Logo } from '@/layout/Sidebar'
import { initials } from '@/lib/utils'

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent"><svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden><path d="M7 9h18M7 16h18M7 23h11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></div>
          <div className="leading-tight"><div className="text-sm font-semibold">Journal Admin</div><div className="text-xs text-slate-400">EdTech Publishers Pvt. Ltd.</div></div>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-[34px] font-semibold leading-[1.15] tracking-tight">One workspace for every journal you publish.</h2>
          <p className="mt-4 text-base text-slate-300">Screen submissions, assign reviews, verify payments, publish issues and keep authors informed — across IJMAT, JIMRT, IJCSD, IJECM and IJFRD.</p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {['Role-based access per journal', 'Automated 08:45 author dispatch', 'DOI, Crossref and GST invoicing built in'].map((t) => (
              <li key={t} className="flex items-center gap-3"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/25 text-indigo-300"><ShieldCheck size={12} aria-hidden /></span>{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Staff access only. Authors and readers do not sign in here.</p>
      </aside>
      <main className="flex flex-col items-center justify-center bg-page px-5 py-10">
        <div className="mb-6 lg:hidden"><Logo /></div>
        <div className="w-full max-w-[440px]">
          <div className="card p-7">
            <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function defaultScope(userId: string) {
  const { users } = useDataStore.getState()
  const u = users.find((x) => x.id === userId)
  if (!u) return 'ALL' as const
  return isSuperAdmin(u) ? ('ALL' as const) : (assignedJournals(u, useSession.getState().flags)[0] ?? ('ALL' as const))
}

const loginSchema = z.object({ email: z.string().min(1, 'Enter your email').email('Enter a valid email'), password: z.string().min(1, 'Enter your password') })

export function LoginPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from ?? '/'
  const { userId, setUser, setPending2fa } = useSession()
  const users = useDataStore((s) => s.users)
  const [formError, setFormError] = useState<string>()
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  if (userId) return <Navigate to="/" replace />

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(undefined)
    try {
      const { user, needsTwoStep } = await login(email, password)
      if (needsTwoStep) { setPending2fa(user.id); nav('/verify', { state: { from } }); return }
      setUser(user.id, defaultScope(user.id))
      nav(from, { replace: true })
    } catch (e) { setFormError((e as Error).message) }
  })

  return (
    <AuthShell title="Sign in" subtitle="One staff login for all journals." footer={<Link to="/set-password?token=invite-demo" className="hover:underline">Have an invitation link? Set your password</Link>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {!formError && (loc.state as { suspended?: boolean; deactivated?: boolean } | null)?.suspended && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Your account has been suspended and you were signed out. Resetting your password does not restore access. Contact a Super Admin.</div>}
        {!formError && (loc.state as { deactivated?: boolean } | null)?.deactivated && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Your account has been deactivated. Contact a Super Admin.</div>}
        {!formError && (loc.state as { passwordUpdated?: boolean } | null)?.passwordUpdated && <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">Password updated. Sign in with your new password.</div>}
        {formError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
        <Field label="Work email" htmlFor="email" error={errors.email?.message}>
          <input id="email" type="email" autoComplete="username" className="input" {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <input id="password" type="password" autoComplete="current-password" className="input" {...register('password')} />
        </Field>
        <div className="text-right"><Link to="/forgot-password" className="text-sm text-accent hover:underline">Forgot password?</Link></div>
        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="mt-6 border-t border-line pt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">Demo accounts</p>
          <p className="text-xs text-muted">Password: <span className="kbd">{DEMO_PASSWORD}</span></p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {users.filter((u) => DEMO_USER_LABELS[u.id]).slice(0, 7).map((u) => {
            const [role, scope] = DEMO_USER_LABELS[u.id].split(' — ')
            return (
              <li key={u.id}>
                <button type="button" onClick={() => { setValue('email', u.email); setValue('password', DEMO_PASSWORD); setFormError(undefined) }}
                  className="flex w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:border-accent hover:bg-accent-soft">
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{initials(u.name)}</span>
                  <span className="min-w-0 leading-tight">
                    <span className="block text-sm font-medium">{role}</span>
                    <span className="block text-xs text-muted">{scope ?? u.name}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">Click an account to fill the form, then press Sign in.</p>
      </div>
    </AuthShell>
  )
}

export function VerifyPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from ?? '/'
  const { pending2faUserId, setUser } = useSession()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  if (!pending2faUserId) return <Navigate to="/login" replace />
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(undefined)
    try { await verifyTwoStep(code); setUser(pending2faUserId, defaultScope(pending2faUserId)); nav(from, { replace: true }) }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <AuthShell title="Two-step verification" subtitle="Enter the 6-digit code from your authenticator app." footer={<Link to="/login" className="hover:underline">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent"><ShieldCheck size={16} strokeWidth={1.5} aria-hidden /> Prototype: any 6 digits will work.</div>
        <Field label="Verification code" htmlFor="code" error={error}>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="input text-center text-lg tracking-[0.5em]" />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
      </form>
    </AuthShell>
  )
}

const forgotSchema = z.object({ email: z.string().min(1, 'Enter your email').email('Enter a valid email') })

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [token, setToken] = useState<string | undefined>()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } })
  return (
    <AuthShell title="Reset your password" subtitle="We will email you a link if the address belongs to a staff account." footer={<Link to="/login" className="hover:underline">Back to sign in</Link>}>
      {sent ? (
        <div role="status" className="space-y-3 text-sm">
          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-800">If that address has an account, a reset link is on its way.</p>
          {token && <Link to={`/set-password?token=${token}`} className="text-accent hover:underline">Prototype: open the link from the email</Link>}
        </div>
      ) : (
        <form onSubmit={handleSubmit(async ({ email }) => { const r = await requestPasswordReset(email); setToken(r.token); setSent(true) })} className="space-y-4" noValidate>
          <Field label="Work email" htmlFor="fp-email" error={errors.email?.message}><input id="fp-email" type="email" className="input" {...register('email')} /></Field>
          <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthShell>
  )
}

const pwSchema = z.object({
  password: z.string().min(8, 'Use at least 8 characters').regex(/\d/, 'Include at least one number'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export function SetPasswordPage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const invited = params.get('token')?.startsWith('invite')
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(pwSchema), defaultValues: { password: '', confirm: '' } })
  return (
    <AuthShell title={invited ? 'Welcome — set your password' : 'Choose a new password'} subtitle={invited ? 'You were invited to the editorial dashboard.' : undefined}>
      <form onSubmit={handleSubmit(async ({ password }) => { try { await setPassword(params.get('token') ?? '', password); nav('/login', { state: { passwordUpdated: true } }) } catch (e) { setError('password', { message: (e as Error).message }) } })} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="pw" error={errors.password?.message}><input id="pw" type="password" autoComplete="new-password" className="input" {...register('password')} /></Field>
        <Field label="Confirm password" htmlFor="pw2" error={errors.confirm?.message}><input id="pw2" type="password" autoComplete="new-password" className="input" {...register('confirm')} /></Field>
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save password'}</button>
      </form>
    </AuthShell>
  )
}
