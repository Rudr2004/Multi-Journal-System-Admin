import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { ReasonDialog } from '@/components/ReasonDialog'
import { isApiError } from '@/lib/api/errors'
import { applyServerFieldErrors } from '@/lib/api/forms'
import { REASON_MAX, REASON_MIN, updateStaff } from '@/lib/api/staff'
import type { GrantableRole, StaffDetail } from '@/lib/api/types'
import { Notice } from '@/pages/auth/AuthShell'
import { describeStaffError, useGrantableRoles, useJournalOptions } from './staffUi'

const PHONE = /^\+[1-9][0-9]{6,14}$/

const editSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter the person’s full name.').max(200, 'Keep the name under 200 characters.'),
  phone: z.string().trim().refine((v) => v === '' || PHONE.test(v), 'Use international format without spaces, for example +919876543210.'),
})
type EditValues = z.infer<typeof editSchema>

/** Name and phone, saved with `If-Match` so an edit never overwrites a newer one. */
export function EditStaffDialog({ person, open, onClose, onSaved, onReload }: { person: StaffDetail; open: boolean; onClose: () => void; onSaved: () => void; onReload: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={`Edit ${person.fullName}`} description="The email address cannot be changed here."
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" form="edit-staff-form" className="btn-primary">Save changes</button></>}>
      <EditForm person={person} onClose={onClose} onSaved={onSaved} onReload={onReload} />
    </Dialog>
  )
}

function EditForm({ person, onClose, onSaved, onReload }: { person: StaffDetail; onClose: () => void; onSaved: () => void; onReload: () => void }) {
  const [stale, setStale] = useState(false)
  const [formError, setFormError] = useState<string>()
  const { register, handleSubmit, setError, formState: { errors, isDirty, isSubmitting } } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { fullName: person.fullName, phone: person.phone ?? '' },
  })
  const submit = handleSubmit(async (v) => {
    setFormError(undefined)
    const changes: { fullName?: string; phone?: string | null } = {}
    if (v.fullName !== person.fullName) changes.fullName = v.fullName
    if (v.phone !== (person.phone ?? '')) changes.phone = v.phone === '' ? null : v.phone
    try {
      await updateStaff(person.id, person.version, changes)
      onSaved()
      onClose()
    } catch (e) {
      if (isApiError(e) && e.is('PRECONDITION_FAILED', 'PRECONDITION_REQUIRED')) return setStale(true)
      if (!applyServerFieldErrors(e, setError, { fullName: 'fullName', phone: 'phone' })) setFormError(describeStaffError(e).message)
    }
  })
  return (
    <form id="edit-staff-form" onSubmit={submit} noValidate className="space-y-4">
      {stale && (
        <Notice tone="warning">
          <p>Someone else changed this person while you were editing. Reload the latest details, then make your change again.</p>
          <button type="button" className="btn-secondary mt-2" onClick={() => { onReload(); onClose() }}>Reload latest</button>
        </Notice>
      )}
      {formError && <Notice>{formError}</Notice>}
      <FormField label="Full name" required error={errors.fullName?.message}>{(a) => <input {...a} autoFocus autoComplete="off" className="input" {...register('fullName')} />}</FormField>
      <FormField label="Phone" error={errors.phone?.message} hint="International format, for example +919876543210. Leave empty to clear it.">{(a) => <input {...a} type="tel" autoComplete="off" className="input" {...register('phone')} />}</FormField>
      <p className="text-xs text-muted">Registered email: {person.email}</p>
      {!isDirty && <p className="text-xs text-muted">Change a field to save.</p>}
      {isSubmitting && <p role="status" className="text-sm text-muted">Saving…</p>}
    </form>
  )
}

/** Grant one role in one journal, with a reason (3 to 500 characters). */
export function GrantRoleDialog({ person, open, onClose, onGrant }: { person: StaffDetail; open: boolean; onClose: () => void; onGrant: (input: { journalCode: string; role: GrantableRole; reason: string }) => Promise<void> }) {
  const journals = useJournalOptions()
  const roles = useGrantableRoles()
  const [journalCode, setJournalCode] = useState('')
  const [role, setRole] = useState<GrantableRole | ''>('')
  const held = person.journals.find((j) => j.journalCode === journalCode)?.roles.some((r) => r.role === role) ?? false
  const close = () => { setJournalCode(''); setRole(''); onClose() }
  return (
    <ReasonDialog open={open} onClose={close} title={`Grant a role to ${person.fullName}`} description="Added to any roles they already hold in that journal." confirmLabel="Grant role"
      minLength={REASON_MIN} maxLength={REASON_MAX} placeholder="Why does this person need this role? It is recorded in the audit log."
      canSubmit={!!journalCode && !!role && !held}
      onSubmit={(reason) => onGrant({ journalCode, role: role as GrantableRole, reason }).then(() => { setJournalCode(''); setRole('') })}>
      <FormField label="Journal" required>
        {(a) => (
          <select {...a} className="input" value={journalCode} onChange={(e) => setJournalCode(e.target.value)}>
            <option value="">Choose…</option>
            {journals.map((j) => <option key={j.value} value={j.value} title={j.name}>{j.label}</option>)}
          </select>
        )}
      </FormField>
      <FormField label="Role" required error={held ? 'They already hold this role in this journal.' : undefined}>
        {(a) => (
          <select {...a} className="input" value={role} onChange={(e) => setRole(e.target.value as GrantableRole | '')}>
            <option value="">Choose…</option>
            {roles.map((r) => <option key={r.value} value={r.value} disabled={r.disabled}>{r.label}</option>)}
          </select>
        )}
      </FormField>
    </ReasonDialog>
  )
}
