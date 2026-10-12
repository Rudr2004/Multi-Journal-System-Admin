import { useState } from 'react'
import { Dialog } from './Dialog'
import { EmailPreview } from './EmailPreview'

/**
 * Every decision, rejection, retraction, Return to Production and verification rejection requires a reason.
 * Optionally shows a live preview of the email the author will receive.
 */
export function ReasonDialog({
  open, onClose, onSubmit, title, description, confirmLabel = 'Submit', danger, minLength = 10, label = 'Reason', consequences, emailPreview,
}: {
  open: boolean; onClose: () => void; onSubmit: (reason: string) => void
  title: string; description?: string; confirmLabel?: string; danger?: boolean; minLength?: number; label?: string
  consequences?: string[]
  emailPreview?: { to: string; subject: string; body: (reason: string) => string }
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const valid = reason.trim().length >= minLength
  const close = () => { setReason(''); setTouched(false); onClose() }
  return (
    <Dialog open={open} onClose={close} title={title} description={description} width={emailPreview ? 720 : 520}
      footer={<>
        <button className="btn-secondary" onClick={close}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => { setTouched(true); if (valid) { onSubmit(reason.trim()); close() } }}>{confirmLabel}</button>
      </>}>
      <div className={emailPreview ? 'grid gap-5 md:grid-cols-2' : ''}>
        <div>
          {consequences && (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted">{consequences.map((c) => <li key={c}>{c}</li>)}</ul>
          )}
          <label htmlFor="reason-text" className="label">{label} <span className="text-red-600" aria-hidden>*</span></label>
          <textarea id="reason-text" autoFocus rows={5} value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)}
            aria-invalid={touched && !valid} className="input !h-auto py-2" placeholder="Explain clearly — this is logged and may be sent to the author." />
          {touched && !valid && <p role="alert" className="mt-1 text-xs text-red-600">Please enter at least {minLength} characters.</p>}
        </div>
        {emailPreview && <EmailPreview to={emailPreview.to} subject={emailPreview.subject} body={emailPreview.body(reason || '…')} />}
      </div>
    </Dialog>
  )
}
