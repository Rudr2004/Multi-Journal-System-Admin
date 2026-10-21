import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFieldArray, useForm, type Path } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { isApiError } from '@/lib/api/errors'
import { applyServerFieldErrors } from '@/lib/api/forms'
import { inviteStaff, resendInvite } from '@/lib/api/staff'
import type { GrantableRole } from '@/lib/api/types'
import { Notice } from '@/pages/auth/AuthShell'
import { describeStaffError, useGrantableRoles, useJournalOptions } from './staffUi'

const PHONE = /^\+[1-9][0-9]{6,14}$/

const schema = z.object({
  fullName: z.string().trim().min(1, 'Enter the person’s full name.').max(200, 'Keep the name under 200 characters.'),
  email: z.string().trim().min(1, 'Enter a work email.').max(254, 'The email is too long.').pipe(z.email('Enter a valid email address.')),
  phone: z.string().trim().refine((v) => v === '' || PHONE.test(v), 'Use international format without spaces, for example +919876543210.'),
  roles: z.array(z.object({ journalCode: z.string().min(1, 'Choose a journal.'), role: z.string().min(1, 'Choose a role.') }))
    .min(1, 'Add at least one role.').max(25, 'At most 25 roles.')
    .refine((rs) => new Set(rs.map((r) => `${r.journalCode}:${r.role}`)).size === rs.length, 'The same role is listed twice for a journal.'),
})
type Values = z.infer<typeof schema>

interface Existing { staffId: string; resendInvite: boolean; status: string }

export function InviteDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (id: string) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Invite a user" description="They get an email with a link to set their password. The link is not shown here." width={640}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" form="invite-form" className="btn-primary">Send invitation</button></>}>
      <InviteForm onClose={onClose} onInvited={onInvited} />
    </Dialog>
  )
}

function InviteForm({ onClose, onInvited }: { onClose: () => void; onInvited: (id: string) => void }) {
  const journals = useJournalOptions()
  const roles = useGrantableRoles()
  const [serverError, setServerError] = useState<string>()
  const [existing, setExisting] = useState<Existing>()
  const [resending, setResending] = useState(false)
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', phone: '', roles: [{ journalCode: journals.length === 1 ? journals[0].value : '', role: '' }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'roles' })

  const submit = handleSubmit(async (v) => {
    setServerError(undefined)
    setExisting(undefined)
    try {
      const person = await inviteStaff({
        email: v.email, fullName: v.fullName, phone: v.phone || undefined,
        roles: v.roles.map((r) => ({ journalCode: r.journalCode, role: r.role as GrantableRole })),
      })
      toast.success(`Invitation emailed to ${person.email}.`)
      onClose()
      onInvited(person.id)
    } catch (e) {
      if (isApiError(e) && e.is('STAFF_EXISTS')) {
        return setExisting({ staffId: e.detail<string>('staffId') ?? '', resendInvite: e.detail<boolean>('resendInvite') === true, status: e.detail<string>('status') ?? '' })
      }
      const map: Partial<Record<string, Path<Values>>> = { email: 'email', fullName: 'fullName', phone: 'phone', roles: 'roles' }
      v.roles.forEach((_, i) => { map[`roles.${i}.journalCode`] = `roles.${i}.journalCode`; map[`roles.${i}.role`] = `roles.${i}.role` })
      if (!applyServerFieldErrors(e, setError, map)) setServerError(describeStaffError(e).message)
    }
  })

  const resend = async () => {
    if (!existing) return
    setResending(true)
    try {
      await resendInvite(existing.staffId)
      toast.success('A new invitation was emailed. The old link no longer works.')
      onClose()
      onInvited(existing.staffId)
    } catch (e) { setServerError(describeStaffError(e).message) } finally { setResending(false) }
  }

  return (
    <form id="invite-form" onSubmit={submit} noValidate className="space-y-4">
      {serverError && <Notice>{serverError}</Notice>}
      {existing && (
        <Notice tone="warning">
          <p>{existing.resendInvite ? 'This person was already invited and has not accepted yet.' : 'A staff member with this email already exists.'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {existing.resendInvite && <button type="button" className="btn-secondary" disabled={resending} onClick={resend}>{resending ? 'Sending…' : 'Resend the invitation'}</button>}
            {existing.staffId && <Link to={`/users/${existing.staffId}`} className="btn-secondary" onClick={onClose}>Open their profile</Link>}
          </div>
        </Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Full name" required error={errors.fullName?.message}>{(a) => <input {...a} autoFocus autoComplete="off" className="input" {...register('fullName')} />}</FormField>
        <FormField label="Work email" required error={errors.email?.message}>{(a) => <input {...a} type="email" autoComplete="off" className="input" {...register('email')} />}</FormField>
        <FormField label="Phone" error={errors.phone?.message} hint="Optional. International format, for example +919876543210." className="sm:col-span-2">{(a) => <input {...a} type="tel" autoComplete="off" className="input" {...register('phone')} />}</FormField>
      </div>

      <fieldset>
        <legend className="label">Roles <span className="text-red-600" aria-hidden>*</span></legend>
        <p className="mb-2 text-xs text-muted">One row per journal and role. A person can hold several roles in a journal. Super Admin is set on the person’s page after they join.</p>
        <ul className="space-y-2">
          {fields.map((field, i) => (
            <li key={field.id} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-start">
              <FormField label={`Journal ${i + 1}`} error={errors.roles?.[i]?.journalCode?.message}>
                {(a) => (
                  <select {...a} className="input" {...register(`roles.${i}.journalCode`)}>
                    <option value="">Choose…</option>
                    {journals.map((j) => <option key={j.value} value={j.value} title={j.name}>{j.label}</option>)}
                  </select>
                )}
              </FormField>
              <FormField label={`Role ${i + 1}`} error={errors.roles?.[i]?.role?.message}>
                {(a) => (
                  <select {...a} className="input" {...register(`roles.${i}.role`)}>
                    <option value="">Choose…</option>
                    {roles.map((r) => <option key={r.value} value={r.value} disabled={r.disabled}>{r.label}</option>)}
                  </select>
                )}
              </FormField>
              <button type="button" className="btn-ghost sm:mt-6" aria-label={`Remove role row ${i + 1}`} disabled={fields.length === 1} onClick={() => remove(i)}><Trash2 size={15} strokeWidth={1.5} aria-hidden /></button>
            </li>
          ))}
        </ul>
        {(errors.roles?.root?.message ?? errors.roles?.message) && <p role="alert" className="mt-1 text-xs text-red-600">{errors.roles?.root?.message ?? errors.roles?.message}</p>}
        <button type="button" className="btn-secondary mt-2" onClick={() => append({ journalCode: journals.length === 1 ? journals[0].value : '', role: '' })}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add another role</button>
      </fieldset>
      {isSubmitting && <p role="status" className="text-sm text-muted">Sending the invitation…</p>}
    </form>
  )
}
