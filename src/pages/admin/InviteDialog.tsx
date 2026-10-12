import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Mail } from 'lucide-react'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { useSession } from '@/mock/store'
import { ROLE_FLAG } from '@/permissions/features'
import { inviteUser } from '@/mock/api/users'
import { Link } from 'react-router-dom'
import { CopyField, RoleMatrix, type Assignments } from './userUi'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the person’s full name.'),
  email: z.string().trim().min(1, 'Enter a work email.').pipe(z.email('Enter a valid email address.')),
  title: z.string().trim().max(60, 'Keep the job title under 60 characters.'),
})
type Values = z.infer<typeof schema>

export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Invite a user" description="They get an invitation link to set their password. Roles are set per journal." width={760}>
      <InviteBody onClose={onClose} />
    </Dialog>
  )
}

function InviteBody({ onClose }: { onClose: () => void }) {
  const flags = useSession((s) => s.flags)
  const [assignments, setAssignments] = useState<Assignments>({})
  const [rolesError, setRolesError] = useState<string>()
  const [serverError, setServerError] = useState<string>()
  const [done, setDone] = useState<{ id: string; name: string; email: string; link: string } | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', title: '' } })

  const submit = async (v: Values) => {
    setServerError(undefined)
    const roles = Object.values(assignments)
    if (roles.length === 0) return setRolesError('Choose a role in at least one journal.')
    if (roles.some((r) => r && ROLE_FLAG[r] && !flags[ROLE_FLAG[r]!])) return setRolesError('Review Panel Member is switched off, so it cannot be assigned.')
    setRolesError(undefined)
    try {
      const { user, link } = await inviteUser({ ...v, assignments })
      setDone({ id: user.id, name: user.name, email: user.email, link })
      toast.success(`Invitation created for ${user.name}.`)
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'The invitation could not be created.')
    }
  }

  if (done) {
    return (
      <div className="space-y-4" role="status">
        <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 size={18} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
          <p><strong>{done.name}</strong> can now sign in. An invitation email was queued to {done.email}. Until they open it, their status shows “Invitation pending”.</p>
        </div>
        <CopyField label="Invitation link (valid for 7 days)" value={done.link} />
        <p className="text-xs text-muted">Prototype: sign out and use “{done.name}” in the demo users list on the login page (password “demo”) to see only the journals and modules you assigned.</p>
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Link to={`/users/${done.id}`} className="btn-secondary" onClick={onClose}>Open profile</Link>
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <form id="invite-form" onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      {serverError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Full name" required error={errors.name?.message}>
          {(a) => <input {...a} autoFocus className="input" autoComplete="off" {...register('name')} />}
        </FormField>
        <FormField label="Work email" required error={errors.email?.message}>
          {(a) => <input {...a} type="email" className="input" autoComplete="off" {...register('email')} />}
        </FormField>
        <FormField label="Job title" error={errors.title?.message} hint="Shown on their profile, e.g. Associate Editor." className="sm:col-span-2">
          {(a) => <input {...a} className="input" autoComplete="off" {...register('title')} />}
        </FormField>
      </div>
      <fieldset>
        <legend className="label">Role in each journal <span className="text-red-600" aria-hidden>*</span></legend>
        <RoleMatrix value={assignments} onChange={(a) => { setAssignments(a); setRolesError(undefined) }} />
        {rolesError && <p role="alert" className="mt-1 text-xs text-red-600">{rolesError}</p>}
        <p className="mt-2 text-xs text-muted">
          One person can hold different roles in different journals. Super Admin in any journal also opens Users, Journals &amp; settings and the Audit log.
        </p>
      </fieldset>
      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}><Mail size={15} strokeWidth={1.5} aria-hidden /> {isSubmitting ? 'Creating…' : 'Send invitation'}</button>
      </div>
    </form>
  )
}
