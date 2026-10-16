import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dices, Eye, EyeOff, EyeOff as Silent } from 'lucide-react'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { PASSWORD_HINT, PASSWORD_RULE, adminSetUserPassword } from '@/mock/api/account'
import type { StaffUser } from '@/shared/types'

const schema = z.object({
  password: z.string().refine((v) => PASSWORD_RULE.test(v), PASSWORD_HINT),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords do not match.' })

function strongPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(12))
  return `${Array.from(bytes, (b) => chars[b % chars.length]).join('')}7`
}

/** Super Admin sets a new password for any user. The user is not notified and is not signed out. */
export function ChangePasswordDialog({ user, onClose, onDone }: { user: StaffUser | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={!!user} onClose={onClose} width={520} title={user ? `Change password for ${user.name}` : 'Change password'}
      description="Set a new password for this person without contacting them."
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" form="admin-password-form">Change password</button></>}>
      {user && <Form user={user} onClose={onClose} onDone={onDone} />}
    </Dialog>
  )
}

function Form({ user, onClose, onDone }: { user: StaffUser; onClose: () => void; onDone: () => void }) {
  const [show, setShow] = useState(false)
  const { register, handleSubmit, setValue, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } })
  const submit = handleSubmit(async (v) => {
    try {
      await adminSetUserPassword(user.id, v.password)
      toast.success(`Password changed for ${user.name}. They were not notified.`)
      onDone()
      onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not change the password.') }
  })
  const type = show ? 'text' : 'password'
  return (
    <form id="admin-password-form" onSubmit={submit} noValidate className="space-y-4">
      <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <Silent size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
        <p><strong>{user.name} is not told.</strong> No email or alert is sent and any open session stays signed in. The change is recorded in the audit log under your name. It does not change the account status{user.status === 'suspended' ? ': this person stays suspended' : ''}.</p>
      </div>
      <FormField label="New password" required error={errors.password?.message} hint={PASSWORD_HINT}>
        {(a) => (
          <div className="flex gap-2">
            <input {...a} type={type} autoComplete="new-password" className="input flex-1 font-mono" {...register('password')} />
            <button type="button" className="btn-secondary shrink-0" onClick={() => { const p = strongPassword(); setValue('password', p, { shouldValidate: true }); setValue('confirm', p, { shouldValidate: true }); setShow(true) }}><Dices size={15} aria-hidden /> Generate</button>
          </div>
        )}
      </FormField>
      <FormField label="Confirm new password" required error={errors.confirm?.message}>{(a) => <input {...a} type={type} autoComplete="new-password" className="input font-mono" {...register('confirm')} />}</FormField>
      <button type="button" className="btn-ghost !h-8 text-xs" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />} {show ? 'Hide' : 'Show'} password</button>
    </form>
  )
}
