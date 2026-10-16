import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ImagePlus, Lock, LogOut, Mail, ShieldCheck, Trash2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { SectionCard } from '@/components/Card'
import { Badge } from '@/components/Badges'
import { FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { UserAvatar } from '@/components/UserAvatar'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { useCurrentUser } from '@/permissions/hooks'
import { ROLE_META } from '@/permissions/roles'
import { journalByCode } from '@/mock/data/core'
import { useSession } from '@/mock/store'
import { PASSWORD_HINT, PASSWORD_RULE, changeOwnPassword, sendVerificationCode, setProfilePhoto, updateProfile } from '@/mock/api/account'
import type { JournalCode } from '@/shared/types'

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.')

const detailsSchema = z.object({
  name: z.string().trim().min(3, 'Enter your full name.').max(80, 'Keep the name under 80 characters.'),
  title: z.string().trim().min(2, 'Enter your designation.').max(80, 'Keep it under 80 characters.'),
  phone: z.string().trim().refine((v) => v === '' || /^\+?[\d\s()-]{8,16}$/.test(v), 'Enter a valid phone number, e.g. +91 98765 43210.'),
})

function PhotoCard() {
  const user = useCurrentUser()!
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const save = async (photo: string | null, ok: string) => {
    setBusy(true)
    try { await setProfilePhoto(photo); toast.success(ok) } catch (e) { toast.error(messageOf(e)) } finally { setBusy(false) }
  }
  const pick = (f?: File) => {
    if (!f) return
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return toast.error('Choose a PNG, JPG or WebP image.')
    if (f.size > 2 * 1024 * 1024) return toast.error('The photo must be smaller than 2 MB.')
    const r = new FileReader()
    r.onload = () => void save(String(r.result), 'Profile photo updated')
    r.readAsDataURL(f)
  }
  return (
    <SectionCard title="Profile photo">
      <div className="flex items-center gap-4">
        <UserAvatar name={user.name} photo={user.photo} size={88} />
        <div>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload profile photo" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={15} strokeWidth={1.5} aria-hidden /> {user.photo ? 'Change photo' : 'Upload photo'}</button>
            {user.photo && <button type="button" className="btn-ghost" disabled={busy} onClick={() => void save(null, 'Profile photo removed')}><Trash2 size={15} strokeWidth={1.5} aria-hidden /> Remove</button>}
          </div>
          <p className="mt-2 text-xs text-muted">Square PNG, JPG or WebP, up to 2 MB. Your initials are shown if there is no photo.</p>
        </div>
      </div>
    </SectionCard>
  )
}

function DetailsCard() {
  const user = useCurrentUser()!
  const { register, handleSubmit, reset, formState: { errors, isDirty, isSubmitting } } = useForm({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: user.name, title: user.title, phone: user.phone ?? '' },
  })
  useUnsavedChanges(isDirty)
  const submit = handleSubmit(async (v) => {
    try { await updateProfile(v); reset(v); toast.success('Profile updated') } catch (e) { toast.error(messageOf(e)) }
  })
  return (
    <SectionCard title="Personal details">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label="Full name" required error={errors.name?.message}>{(a) => <input {...a} className="input" autoComplete="name" {...register('name')} />}</FormField>
        <FormField label="Designation" required error={errors.title?.message}>{(a) => <input {...a} className="input" {...register('title')} />}</FormField>
        <FormField label="Phone number" error={errors.phone?.message}>{(a) => <input {...a} type="tel" className="input" autoComplete="tel" placeholder="+91 98765 43210" {...register('phone')} />}</FormField>
        <FormField label="Registered email" hint="Used for sign-in and verification. Ask a Super Admin to change it.">
          {(a) => <div className="relative"><input id={a.id} className="input pr-9" value={user.email} readOnly aria-readonly /><Lock size={14} aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-faint" /></div>}
        </FormField>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secondary" disabled={!isDirty || isSubmitting} onClick={() => reset()}>Discard</button>
          <button type="submit" className="btn-primary" disabled={!isDirty || isSubmitting}>{isSubmitting ? 'Saving…' : 'Save details'}</button>
        </div>
      </form>
      <div className="mt-5 border-t border-line pt-4">
        <p className="label">Your roles</p>
        <ul className="flex flex-wrap gap-2">
          {(Object.entries(user.assignments) as [JournalCode, keyof typeof ROLE_META][]).map(([j, r]) => (
            <li key={j}><Badge tone="neutral">{j} · {ROLE_META[r].label}</Badge></li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Roles are assigned by a Super Admin.</p>
      </div>
    </SectionCard>
  )
}

const pwSchema = z.object({
  current: z.string().min(1, 'Enter your current password.'),
  next: z.string().refine((v) => PASSWORD_RULE.test(v), PASSWORD_HINT),
  confirm: z.string(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code we emailed you.'),
}).refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'The passwords do not match.' })

function PasswordCard() {
  const user = useCurrentUser()!
  const [show, setShow] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(pwSchema), defaultValues: { current: '', next: '', confirm: '', code: '' },
  })
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const send = async () => {
    setSending(true)
    try {
      const { code, maskedEmail } = await sendVerificationCode()
      setSentTo(maskedEmail)
      setCooldown(30)
      toast.success(`Verification code sent to ${maskedEmail}. Prototype: the code is ${code}.`)
    } catch (e) { toast.error(messageOf(e)) } finally { setSending(false) }
  }
  const submit = handleSubmit(async (v) => {
    try {
      await changeOwnPassword({ current: v.current, next: v.next, code: v.code })
      toast.success('Password changed. Use it the next time you sign in.')
      reset(); setSentTo(null)
    } catch (e) {
      const m = messageOf(e)
      if (/current password/i.test(m)) setError('current', { message: m })
      else if (/code/i.test(m)) setError('code', { message: m })
      else toast.error(m)
    }
  })
  const type = show ? 'text' : 'password'
  return (
    <SectionCard title="Password and security"
      action={<button type="button" className="btn-ghost" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />} {show ? 'Hide' : 'Show'} passwords</button>}>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label="Current password" required error={errors.current?.message} className="sm:col-span-2">{(a) => <input {...a} type={type} autoComplete="current-password" className="input" {...register('current')} />}</FormField>
        <FormField label="New password" required error={errors.next?.message} hint={PASSWORD_HINT}>{(a) => <input {...a} type={type} autoComplete="new-password" className="input" {...register('next')} />}</FormField>
        <FormField label="Confirm new password" required error={errors.confirm?.message}>{(a) => <input {...a} type={type} autoComplete="new-password" className="input" {...register('confirm')} />}</FormField>
        <div className="rounded-lg border border-line p-3 sm:col-span-2">
          <p className="flex items-start gap-2 text-sm"><Mail size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span>We verify password changes with a code sent to your registered email, <span className="font-medium">{user.email}</span>.</span></p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
            <FormField label="Verification code" required error={errors.code?.message} hint={sentTo ? `Code sent to ${sentTo}. It expires in 10 minutes.` : 'Press “Send code” first.'}>
              {(a) => <input {...a} inputMode="numeric" maxLength={6} autoComplete="one-time-code" className="input font-mono tracking-[0.3em]" {...register('code')} />}
            </FormField>
            <button type="button" className="btn-secondary sm:mt-5" disabled={sending || cooldown > 0} onClick={send}>{sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : sentTo ? 'Resend code' : 'Send code'}</button>
          </div>
        </div>
        <div className="flex justify-end sm:col-span-2"><button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Changing…' : 'Change password'}</button></div>
      </form>
    </SectionCard>
  )
}

export function ProfilePage() {
  const navigate = useNavigate()
  const setUser = useSession((s) => s.setUser)
  const user = useCurrentUser()
  if (!user) return null
  return (
    <>
      <PageHeader title="My profile" description="Your photo, personal details and password."
        actions={<button className="btn-secondary" onClick={() => { setUser(null, 'ALL'); navigate('/login') }}><LogOut size={15} strokeWidth={1.5} aria-hidden /> Sign out</button>} />
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <DetailsCard />
          <PasswordCard />
        </div>
        <div className="space-y-5">
          <PhotoCard />
          <SectionCard title="Account status">
            <div className="flex items-center gap-2 text-sm"><ShieldCheck size={16} strokeWidth={1.5} className="text-green-600" aria-hidden /> <Badge tone="success">Active</Badge></div>
            <p className="mt-2 text-xs text-muted">Your status is checked every time you sign in. If a Super Admin suspends your account you are signed out, and changing or resetting your password does not restore access.</p>
            <p className="mt-2 text-xs text-muted">Journal: {Object.keys(user.assignments).map((j) => journalByCode(j as JournalCode).code).join(', ')}</p>
          </SectionCard>
        </div>
      </div>
    </>
  )
}
