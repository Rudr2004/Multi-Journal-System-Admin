import { useState, type ReactNode } from 'react'
import { Dialog } from './Dialog'
import { EmailPreview } from './EmailPreview'

/**
 * Every decision, rejection, retraction, Return to Production and verification rejection requires a reason.
 * Optionally shows a live preview of the email the author will receive.
 *
 * `onSubmit` may return a promise: the dialog then stays open with a busy button and shows the rejection's message under the
 * field, so the person can fix the reason and retry. A plain function closes the dialog at once, as before.
 * `children` render above the reason field (extra inputs); `canSubmit` holds the button back until they are filled in.
 */
export function ReasonDialog({
  open, onClose, onSubmit, title, description, confirmLabel = 'Submit', danger, minLength = 10, maxLength, label = 'Reason', placeholder = 'Explain clearly — this is logged and may be sent to the author.', consequences, emailPreview, children, canSubmit = true,
}: {
  open: boolean; onClose: () => void; onSubmit: (reason: string) => void | Promise<void>
  title: string; description?: string; confirmLabel?: string; danger?: boolean; minLength?: number; maxLength?: number; label?: string; placeholder?: string
  consequences?: string[]
  emailPreview?: { to: string; subject: string; body: (reason: string) => string }
  children?: ReactNode
  canSubmit?: boolean
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const valid = reason.trim().length >= minLength
  const close = () => { setReason(''); setTouched(false); setError(undefined); onClose() }
  const submit = async () => {
    setTouched(true)
    if (!valid || !canSubmit) return
    const result = onSubmit(reason.trim())
    if (!(result instanceof Promise)) return close()
    setBusy(true)
    setError(undefined)
    try { await result; close() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Try again.') } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={close} title={title} description={description} width={emailPreview ? 720 : 520}
      footer={<>
        <button className="btn-secondary" onClick={close}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy || !canSubmit} onClick={submit}>{busy ? 'Working…' : confirmLabel}</button>
      </>}>
      <div className={emailPreview ? 'grid gap-5 md:grid-cols-2' : ''}>
        <div>
          {consequences && (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted">{consequences.map((c) => <li key={c}>{c}</li>)}</ul>
          )}
          {children && <div className="mb-3 space-y-3">{children}</div>}
          <label htmlFor="reason-text" className="label">{label} <span className="text-red-600" aria-hidden>*</span></label>
          <textarea id="reason-text" autoFocus={!children} rows={5} value={reason} maxLength={maxLength} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)}
            aria-invalid={touched && !valid} className="input !h-auto py-2" placeholder={placeholder} />
          <div className="mt-1 flex items-start justify-between gap-3">
            {touched && !valid ? <p role="alert" className="text-xs text-red-600">Please enter at least {minLength} characters.</p> : <span />}
            {maxLength && <span className="text-xs tabular-nums text-muted">{reason.length} / {maxLength}</span>}
          </div>
          {error && <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        {emailPreview && <EmailPreview to={emailPreview.to} subject={emailPreview.subject} body={emailPreview.body(reason || '…')} />}
      </div>
    </Dialog>
  )
}
