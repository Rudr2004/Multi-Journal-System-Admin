import { useMemo, useState } from 'react'
import { CheckCircle2, FilePenLine, XCircle } from 'lucide-react'
import type { Paper } from '@/shared/types'
import { formatDate, formatTime } from '@/shared/formatters'
import { ConfirmDialog } from '@/components/Dialog'
import { toast } from '@/components/Toasts'
import { GuardedButton } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { useCanAct, usePermission } from '@/permissions/hooks'
import { decidePaper, type DecisionAction } from '@/mock/api/papers'
import { decisionEmail } from '@/mock/data/editorial'
import { nextDispatch } from '@/mock/data/papers'
import { useEditorialStore } from '@/mock/stores/editorial'
import { DecisionDialog, type DecisionChoice } from './DecisionDialog'

/** Statuses in which the Editor can still make the accept / revise / reject decision. */
const DECIDABLE = ['submitted', 'screening', 'under_review', 'decision_pending', 'changes_requested']

/**
 * Right-hand panel. The Editor has exactly three actions here: Accept, Request for revision and Reject.
 * Assigning reviewers and reminders live in the Review tab; the production decision lives in the Production tab.
 */
export function PaperActions({ paper }: { paper: Paper }) {
  const { why } = usePermission('submissions')
  const canDecide = useCanAct('submissions', 'approve')
  const allReviews = useEditorialStore((s) => s.reviews)
  const reviews = useMemo(() => allReviews.filter((r) => r.paperId === paper.id), [allReviews, paper.id])
  const [dlg, setDlg] = useState<DecisionChoice | null>(null)
  const [rejecting, setRejecting] = useState<{ reason: string; reports: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const dispatchAt = useMemo(() => nextDispatch().toISOString(), [])
  const s = paper.status
  const decidable = DECIDABLE.includes(s)

  const decide = async (action: DecisionAction, reason: string, reports: string[], success: string) => {
    setBusy(true)
    try {
      await decidePaper(paper.id, action, reason, reports)
      toast.success(success)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The decision could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  const submit = (kind: DecisionChoice) => (reason: string, reports: string[]) => {
    if (kind === 'reject') return setRejecting({ reason, reports })
    if (kind === 'revision') return void decide('changes', reason, reports, 'Revision requested. Email queued for the author.')
    return void decide(reviews.length === 0 ? 'approve_no_review' : 'approve', reason, reports, `Accepted. Acceptance email queued for ${formatTime(dispatchAt)} on ${formatDate(dispatchAt)}.`)
  }
  const emailFor = (kind: DecisionChoice) => (reason: string) => {
    const k = kind === 'accept' ? (reviews.length === 0 ? 'accepted_without_review' : 'accepted') : kind === 'revision' ? 'changes_requested' : 'rejected'
    const m = decisionEmail(k, paper, reason, dispatchAt)
    return { subject: m.subject, body: m.body }
  }

  const buttons: { key: DecisionChoice; label: string; icon: React.ReactNode; cls: string }[] = [
    { key: 'accept', label: 'Accept', icon: <CheckCircle2 size={15} strokeWidth={1.5} aria-hidden />, cls: 'btn-primary' },
    { key: 'revision', label: 'Request for revision', icon: <FilePenLine size={15} strokeWidth={1.5} aria-hidden />, cls: 'btn-secondary' },
    { key: 'reject', label: 'Reject', icon: <XCircle size={15} strokeWidth={1.5} aria-hidden />, cls: 'btn-danger' },
  ]

  return (
    <aside aria-label="Actions" className="card lg:sticky lg:top-4">
      <header className="border-b border-line px-4 py-3"><h2 className="text-[16px] font-semibold">Decision</h2></header>
      <div className="space-y-2 p-4">
        {decidable ? (
          <>
            {buttons.map((b) => (
              <GuardedButton key={b.key} allowed={canDecide} why={why('approve')} className={cn('w-full justify-start', b.cls)} disabled={busy} onClick={() => setDlg(b.key)}>
                {b.icon}{b.label}
              </GuardedButton>
            ))}
            <p className="pt-1 text-xs text-muted">
              {reviews.length > 0
                ? `${reviews.length} review report${reviews.length === 1 ? ' is' : 's are'} available. You can pick the report your decision is based on.`
                : 'No review report yet. You can still decide; it is recorded as made without a review report.'}
            </p>
          </>
        ) : s === 'ready_for_approval' ? (
          <p className="text-sm text-muted">This paper is waiting for your production decision. Open the <strong>Production</strong> tab to verify the certificates and article, then approve, reject or return it to production.</p>
        ) : ['rejected', 'withdrawn'].includes(s) ? (
          <p className="text-sm text-muted">This paper is closed. No further editorial actions are available.</p>
        ) : (
          <p className="text-sm text-muted">The editorial decision is complete. Payment, production and publication continue in the other tabs and screens; use the tabs on this page to follow progress.</p>
        )}
      </div>

      {(['accept', 'revision', 'reject'] as const).map((k) => (
        <DecisionDialog key={k} open={dlg === k} kind={k} paper={paper} reviews={reviews} email={emailFor(k)} onClose={() => setDlg(null)} onSubmit={submit(k)} />
      ))}

      <ConfirmDialog open={rejecting !== null} onClose={() => setRejecting(null)} danger title={`Reject ${paper.id}?`} confirmLabel="Reject paper"
        consequences={['The paper is closed with status Rejected and leaves the pipeline.', 'The rejection email, including your reason, is queued for the author.', 'The decision is written to the timeline and audit log and cannot be undone from this screen.']}
        onConfirm={() => { const r = rejecting; setRejecting(null); if (r) void decide('reject', r.reason, r.reports, `${paper.id} rejected. Email queued for the author.`) }} />
    </aside>
  )
}
