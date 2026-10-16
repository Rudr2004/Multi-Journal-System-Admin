import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Paper } from '@/shared/types'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { retractArticle } from '@/mock/api/production'
import { todayInput } from './shared'

/** Retract an article at the author's request: needs the author's written consent and the Editor's explicit approval. */
export function RetractDialog({ open, paper, onClose }: { open: boolean; paper: Paper; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} width={620} title="Retract article" description={`${paper.id} · ${paper.title}`}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" form="retract-form" className="btn-danger">Retract article</button></>}>
      {open && <Body paper={paper} onClose={onClose} />}
    </Dialog>
  )
}

function Body({ paper, onClose }: { paper: Paper; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState(paper.authorEmail)
  const [date, setDate] = useState(todayInput())
  const [excerpt, setExcerpt] = useState('')
  const [file, setFile] = useState('')
  const [consent, setConsent] = useState(false)
  const [approve, setApprove] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const errors = {
    reason: reason.trim().length < 10 ? 'Give the reason for the retraction (at least 10 characters).' : '',
    from: !/^\S+@\S+\.\S+$/.test(from) ? 'Enter the email address the consent came from.' : '',
    date: !date ? 'Enter the date of the email.' : date > todayInput() ? 'The date cannot be in the future.' : '',
    excerpt: excerpt.trim().length < 20 ? 'Paste the author’s consent message (at least 20 characters) so it is documented.' : '',
    confirm: !consent || !approve ? 'Tick both confirmations to continue.' : '',
  }
  const bad = Object.values(errors).some(Boolean)
  return (
    <form id="retract-form" noValidate className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setTouched(true)
      if (bad) return
      setBusy(true)
      try {
        await retractArticle(paper.id, { reason, consentFrom: from, consentDate: date, consentExcerpt: excerpt, consentFileName: file || undefined, consentConfirmed: consent, approved: approve })
        toast.success('Article retracted. The notice is live at the same URL and the author has been emailed.')
        onClose()
      } catch (err) { toast.error(err instanceof Error ? err.message : 'The retraction could not be completed.') } finally { setBusy(false) }
    }}>
      <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <p>The status becomes <strong>Retracted</strong>, the article leaves active listings and its page is replaced by a retraction notice at the same URL. The DOI and bibliographic record stay on file.</p>
      </div>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <FormField label="Reason for retraction" required error={touched ? errors.reason : undefined} hint="Shown in the retraction notice.">
          {(a) => <textarea {...a} rows={3} className="input !h-auto py-2" value={reason} onChange={(e) => setReason(e.target.value)} />}
        </FormField>
        <div>
          <p className="label">Author consent by email</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Received from" required error={touched ? errors.from : undefined}>{(a) => <input {...a} type="email" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />}</FormField>
            <FormField label="Date of email" required error={touched ? errors.date : undefined}>{(a) => <input {...a} type="date" max={todayInput()} className="input" value={date} onChange={(e) => setDate(e.target.value)} />}</FormField>
          </div>
          <div className="mt-3 space-y-3">
            <FormField label="Consent message" required error={touched ? errors.excerpt : undefined} hint="Paste the author’s email text. It is stored with the retraction.">
              {(a) => <textarea {...a} rows={4} className="input !h-auto py-2" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />}
            </FormField>
            <FormField label="Attach the email (optional)" hint="Only the file name is kept in this prototype.">
              {(a) => <input {...a} type="file" accept=".eml,.msg,.pdf,.png,.jpg" className="input !h-auto py-1.5" onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')} />}
            </FormField>
          </div>
        </div>
        <div className="space-y-2 rounded-lg border border-line p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-red-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> The author has explicitly consented to this retraction in writing by email.</label>
          <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-red-600" checked={approve} onChange={(e) => setApprove(e.target.checked)} /> I approve this retraction as the Editor.</label>
          {touched && errors.confirm && <p role="alert" className="text-xs text-red-600">{errors.confirm}</p>}
        </div>
      </fieldset>
    </form>
  )
}
