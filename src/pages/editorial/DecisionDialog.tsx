import { useMemo, useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import type { Paper } from '@/shared/types'
import type { ReviewRecord } from '@/mock/data/editorial'
import { averageScore } from '@/mock/data/editorial'
import { Dialog } from '@/components/Dialog'
import { EmailPreview } from '@/components/EmailPreview'
import { formatDate } from '@/shared/formatters'
import { cn } from '@/lib/utils'
import { RecommendationBadge, ReviewerTypeBadge } from './shared'

export type DecisionChoice = 'accept' | 'revision' | 'reject'

export const DECISION_COPY: Record<DecisionChoice, { title: string; confirm: string; reasonLabel: string; hint: string; danger?: boolean }> = {
  accept: { title: 'Accept paper', confirm: 'Accept paper', reasonLabel: 'Reason for accepting', hint: 'The author is told the paper is accepted and the acceptance email is queued for the next dispatch.' },
  revision: { title: 'Request for revision', confirm: 'Request revision', reasonLabel: 'Changes the author must make', hint: 'The author receives the text below and is asked to upload a revised manuscript.' },
  reject: { title: 'Reject paper', confirm: 'Continue', reasonLabel: 'Reason for rejection', hint: 'You will be asked to confirm on the next step.', danger: true },
}

/**
 * Final decision (Accept, Request for revision or Reject). The Editor can base it on one or more review reports from
 * Reviewers or Review Panel Members, and must give a reason, which is sent to the author.
 */
export function DecisionDialog({ open, kind, paper, reviews, email, onClose, onSubmit }: {
  open: boolean
  kind: DecisionChoice
  paper: Paper
  reviews: ReviewRecord[]
  /** Builds the author email for the live preview. */
  email: (reason: string) => { subject: string; body: string }
  onClose: () => void
  onSubmit: (reason: string, reportIds: string[]) => void
}) {
  const copy = DECISION_COPY[kind]
  const [reason, setReason] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const valid = reason.trim().length >= 10
  const ordered = useMemo(() => [...reviews].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), [reviews])
  const close = () => { setReason(''); setPicked([]); setExpanded(null); setTouched(false); onClose() }
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const preview = email(reason.trim() || '…')

  return (
    <Dialog open={open} onClose={close} width={860} title={copy.title} description={`${paper.id} · ${paper.title}`}
      footer={<>
        <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
        <button type="button" className={copy.danger ? 'btn-danger' : 'btn-primary'} onClick={() => { setTouched(true); if (valid) { onSubmit(reason.trim(), picked); close() } }}>{copy.confirm}</button>
      </>}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <fieldset>
            <legend className="label">Review reports <span className="font-normal text-muted">(optional: tick the report your decision is based on)</span></legend>
            {ordered.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">No review report is available for this paper. The decision is recorded as made without a review report.</p>
            ) : (
              <ul className="space-y-2">
                {ordered.map((r) => (
                  <li key={r.id} className={cn('rounded-lg border p-2.5', picked.includes(r.id) ? 'border-accent bg-accent-soft/50' : 'border-line')}>
                    <div className="flex items-start gap-2.5">
                      <input type="checkbox" id={`rep-${r.id}`} className="mt-1 accent-indigo-600" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
                      <label htmlFor={`rep-${r.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">{r.reviewerName} <ReviewerTypeBadge kind={r.reviewerKind} /> <RecommendationBadge value={r.recommendation} /></span>
                        <span className="block text-xs text-muted">Average {averageScore(r.scores)}/5 · round {r.round} · submitted {formatDate(r.submittedAt)}</span>
                      </label>
                      <button type="button" className="btn-ghost !h-7 !px-1.5 text-xs" aria-expanded={expanded === r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                        <FileText size={13} aria-hidden /> Read <ChevronDown size={12} aria-hidden className={cn('transition-transform', expanded === r.id && 'rotate-180')} />
                      </button>
                    </div>
                    {expanded === r.id && (
                      <div className="mt-2 space-y-2 border-t border-line pt-2 text-sm">
                        <p><span className="text-xs font-medium text-muted">To the author: </span>{r.commentsToAuthor}</p>
                        <p className="rounded bg-amber-50 px-2 py-1.5 text-amber-900"><span className="text-xs font-medium">Reviewer Justification: </span>{r.commentsToEditor || 'None provided.'}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <div>
            <label htmlFor="decision-reason" className="label">{copy.reasonLabel} <span className="text-red-600" aria-hidden>*</span></label>
            <textarea id="decision-reason" rows={5} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)}
              aria-invalid={touched && !valid} className="input !h-auto py-2" placeholder="Explain clearly. This is logged and sent to the author." />
            {touched && !valid ? <p role="alert" className="mt-1 text-xs text-red-600">Please enter at least 10 characters.</p> : <p className="mt-1 text-xs text-muted">{copy.hint}</p>}
          </div>
        </div>
        <EmailPreview to={paper.authorEmail} subject={preview.subject} body={preview.body} />
      </div>
    </Dialog>
  )
}
