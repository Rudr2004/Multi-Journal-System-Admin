import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, ShieldCheck, ShieldOff } from 'lucide-react'
import { Badge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { disableMfa } from '@/lib/api/auth'
import { errorMessage, isApiError } from '@/lib/api/errors'
import { reloadMe, signOutEverywhere } from '@/lib/api/session'
import type { Me } from '@/lib/api/types'
import { MfaSetupPanel } from '@/pages/auth/MfaSetupPanel'
import { Notice } from '@/pages/auth/AuthShell'

/** Two-step sign-in (turn on / off) and "sign out everywhere". Two-step is required for Super Admins while the server has it on. */
export function SecurityCard({ me }: { me: Me }) {
  const navigate = useNavigate()
  const [setupOpen, setSetupOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)

  const refresh = () => reloadMe().catch((e: unknown) => toast.error(errorMessage(e)))

  return (
    <SectionCard title="Two-step sign-in and devices">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {me.twoStepEnabled ? <ShieldCheck size={16} strokeWidth={1.5} className="text-green-600" aria-hidden /> : <ShieldOff size={16} strokeWidth={1.5} className="text-faint" aria-hidden />}
            Authenticator app <Badge tone={me.twoStepEnabled ? 'success' : 'neutral'}>{me.twoStepEnabled ? 'On' : 'Off'}</Badge>
          </p>
          <p className="mt-1 text-xs text-muted">
            {me.twoStepRequired ? 'Required for Super Admins. A Super Admin can reset it if you lose your phone.' : 'Adds a 6-digit code from an authenticator app to every sign-in.'}
          </p>
        </div>
        {me.twoStepEnabled ? (
          <GuardedButton allowed={!me.twoStepRequired} why="Two-step sign-in is required for Super Admins." onClick={() => setDisableOpen(true)}>Turn off</GuardedButton>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setSetupOpen(true)}>Turn on</button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="min-w-0 text-sm text-muted">Signed in somewhere you no longer use? End every session, on every device, including this one.</p>
        <button type="button" className="btn-secondary" onClick={() => setConfirmAll(true)}><LogOut size={15} strokeWidth={1.5} aria-hidden /> Sign out everywhere</button>
      </div>

      <Dialog open={setupOpen} onClose={() => setSetupOpen(false)} title="Turn on two-step sign-in" width={480}>
        <MfaSetupPanel onDone={() => { setSetupOpen(false); toast.success('Two-step sign-in is on.'); void refresh() }} />
      </Dialog>
      <DisableDialog open={disableOpen} onClose={() => setDisableOpen(false)} onDone={() => { setDisableOpen(false); toast.success('Two-step sign-in is off.'); void refresh() }} />
      <ConfirmDialog open={confirmAll} onClose={() => setConfirmAll(false)} title="Sign out everywhere?" confirmLabel="Sign out everywhere" danger
        consequences={['End every session of your account on every device, including this one.', 'Ask you to sign in again here.']}
        onConfirm={() => void signOutEverywhere().then(() => navigate('/login'))} />
    </SectionCard>
  )
}

function DisableDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const close = () => { setPassword(''); setCode(''); setError(undefined); onClose() }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return setError('Enter your password.')
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from your authenticator app.')
    setBusy(true)
    setError(undefined)
    try {
      await disableMfa({ password, code })
      close()
      onDone()
    } catch (err) {
      setError(isApiError(err) && err.is('MFA_CODE_INVALID') ? 'That code is not correct.' : errorMessage(err))
    } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={close} title="Turn off two-step sign-in" description="Confirm with your password and a current code."
      footer={<><button type="button" className="btn-secondary" onClick={close}>Cancel</button><button type="submit" form="disable-mfa-form" className="btn-danger" disabled={busy}>{busy ? 'Turning off…' : 'Turn off'}</button></>}>
      <form id="disable-mfa-form" onSubmit={submit} noValidate className="space-y-4">
        {error && <Notice>{error}</Notice>}
        <FormField label="Password" required>{(a) => <input {...a} type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="input" />}</FormField>
        <FormField label="Code from the app" required>{(a) => <input {...a} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="input font-mono tracking-[0.3em]" />}</FormField>
      </form>
    </Dialog>
  )
}
