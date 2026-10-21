import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Ban, MailCheck } from 'lucide-react'
import { FormField } from '@/components/Form'
import { acceptInvite, changePassword, requestPasswordReset, resetPassword } from '@/lib/api/auth'
import { errorMessage, isApiError } from '@/lib/api/errors'
import { applyServerFieldErrors } from '@/lib/api/forms'
import { reloadMe, signOut } from '@/lib/api/session'
import { PASSWORD_HINT, newPasswordSchema, passwordPairSchema } from '@/lib/password'
import { useSession } from '@/mock/store'
import { AuthShell, Notice } from './AuthShell'

const forgotSchema = z.object({ email: z.string().trim().min(1, 'Enter your email.').email('Enter a valid email.') })

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string>()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } })
  const submit = handleSubmit(async ({ email }) => {
    setFormError(undefined)
    try { await requestPasswordReset(email); setSent(true) } catch (e) { setFormError(isApiError(e) && e.is('RATE_LIMITED') ? 'Too many requests. Wait a minute and try again.' : errorMessage(e)) }
  })
  return (
    <AuthShell title="Reset your password" subtitle="We will email you a link if the address belongs to an active staff account." footer={<Link to="/login" className="hover:underline">Back to sign in</Link>}>
      {sent ? (
        <div className="space-y-3 text-sm">
          <Notice tone="success"><MailCheck size={15} className="mr-1.5 inline align-text-bottom" aria-hidden />If that address has an active account, a reset link is on its way. It works once and expires soon.</Notice>
          <p className="text-muted">Nothing arrived? Check spam, or ask a Super Admin to send a new link.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && <Notice>{formError}</Notice>}
          <FormField label="Work email" error={errors.email?.message}>{(a) => <input {...a} type="email" autoComplete="username" autoFocus className="input" {...register('email')} />}</FormField>
          <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthShell>
  )
}

/**
 * Landing page of the emailed link `/set-password?token=`, used for invitations and for password resets. The two tokens look
 * alike and the server keeps them apart, so the page cannot tell them apart in advance: it accepts the invitation first and,
 * when the server says that token is not an invitation, tries it as a reset. A weak password is refused before either token
 * is used, so no attempt burns a link.
 */
export function SetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')?.trim() ?? ''
  const [formError, setFormError] = useState<string>()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(passwordPairSchema), defaultValues: { password: '', confirm: '' } })

  if (!token) {
    return (
      <AuthShell title="This link is not complete" footer={<Link to="/login" className="hover:underline">Back to sign in</Link>}>
        <Notice>The link is missing its token. Open the link from your email again, or ask a Super Admin to send a new one.</Notice>
        <p className="mt-3 text-sm text-muted">Forgot your password? <Link to="/forgot-password" className="text-accent hover:underline">Request a reset link</Link>.</p>
      </AuthShell>
    )
  }

  const submit = handleSubmit(async ({ password }) => {
    setFormError(undefined)
    try {
      try {
        await acceptInvite({ token, password })
        navigate('/login', { replace: true, state: { passwordUpdated: true } })
      } catch (e) {
        if (!(isApiError(e) && e.is('INVALID_TOKEN'))) throw e
        await resetPassword({ token, newPassword: password })
        navigate('/login', { replace: true, state: { passwordUpdated: true } })
      }
    } catch (e) {
      if (applyServerFieldErrors(e, setError, { password: 'password', newPassword: 'password' })) return
      setFormError(isApiError(e) && e.is('INVALID_TOKEN') ? 'This link has expired or was already used. Request a new reset link, or ask a Super Admin to resend your invitation.' : errorMessage(e))
    }
  })

  return (
    <AuthShell title="Set your password" subtitle="Choose the password you will use to sign in." footer={<Link to="/forgot-password" className="hover:underline">Link expired? Request a new one</Link>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Notice>{formError}</Notice>}
        <FormField label="New password" required error={errors.password?.message} hint={PASSWORD_HINT}>{(a) => <input {...a} type="password" autoComplete="new-password" autoFocus className="input" {...register('password')} />}</FormField>
        <FormField label="Confirm password" required error={errors.confirm?.message}>{(a) => <input {...a} type="password" autoComplete="new-password" className="input" {...register('confirm')} />}</FormField>
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save password'}</button>
      </form>
    </AuthShell>
  )
}

const changeSchema = z.object({ current: z.string().min(1, 'Enter your current password.'), next: newPasswordSchema, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'The passwords do not match.' })

export type ChangePasswordValues = z.infer<typeof changeSchema>

/** Current + new password form shared by the forced page and the profile. Server field errors appear inline. */
export function ChangePasswordForm({ onChanged, submitLabel = 'Change password' }: { onChanged: () => void; submitLabel?: string }) {
  const [formError, setFormError] = useState<string>()
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<ChangePasswordValues>({ resolver: zodResolver(changeSchema), defaultValues: { current: '', next: '', confirm: '' } })
  const submit = handleSubmit(async (v) => {
    setFormError(undefined)
    try {
      await changePassword({ currentPassword: v.current, newPassword: v.next })
      reset()
      onChanged()
    } catch (e) {
      if (isApiError(e) && e.is('CURRENT_PASSWORD_INVALID')) return setError('current', { message: 'The current password is not correct.' })
      if (applyServerFieldErrors(e, setError, { newPassword: 'next' })) return
      setFormError(errorMessage(e))
    }
  })
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError && <Notice>{formError}</Notice>}
      <FormField label="Current password" required error={errors.current?.message}>{(a) => <input {...a} type="password" autoComplete="current-password" className="input" {...register('current')} />}</FormField>
      <FormField label="New password" required error={errors.next?.message} hint={PASSWORD_HINT}>{(a) => <input {...a} type="password" autoComplete="new-password" className="input" {...register('next')} />}</FormField>
      <FormField label="Confirm new password" required error={errors.confirm?.message}>{(a) => <input {...a} type="password" autoComplete="new-password" className="input" {...register('confirm')} />}</FormField>
      <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Changing…' : submitLabel}</button></div>
    </form>
  )
}

/** `mustChangePassword`: nothing else is reachable until the temporary password is replaced. */
export function ForcedChangePasswordPage() {
  const navigate = useNavigate()
  const me = useSession((s) => s.me)
  if (!me?.mustChangePassword) return <Navigate to="/" replace />
  return (
    <AuthShell title="Choose a new password" subtitle="Your password was set by an administrator. Replace it before you continue."
      footer={<button className="hover:underline" onClick={() => void signOut().then(() => navigate('/login'))}>Sign out</button>}>
      <ChangePasswordForm submitLabel="Save and continue" onChanged={() => void reloadMe().then(() => navigate('/', { replace: true }))} />
    </AuthShell>
  )
}

export function AccountDisabledPage() {
  return (
    <AuthShell title="Account disabled" footer={<Link to="/login" className="hover:underline">Back to sign in</Link>}>
      <div className="space-y-3 text-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600"><Ban size={20} aria-hidden /></div>
        <p>A Super Admin has disabled this account, so you cannot sign in.</p>
        <p className="text-muted">Contact a Super Admin if you think this is a mistake. Resetting your password does not restore access.</p>
      </div>
    </AuthShell>
  )
}
