import { useMemo, useState, type ReactNode } from 'react'
import { Bell, CheckCircle2, FileCheck2, FilePenLine, PlayCircle, RotateCcw, UserCheck, Users, XCircle, Zap } from 'lucide-react'
import type { Paper } from '@/shared/types'
import { formatDate, formatTime } from '@/shared/formatters'
import { ConfirmDialog } from '@/components/Dialog'
import { ReasonDialog } from '@/components/ReasonDialog'
import { toast } from '@/components/Toasts'
import { GuardedButton } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { useCanAct, usePermission } from '@/permissions/hooks'
import { decidePaper, markRevisionReceived, startScreening, type DecisionAction } from '@/mock/api/papers'
import { sendReviewReminder } from '@/mock/api/reviews'
import { decisionEmail, recommendationMeta, type DecisionKind } from '@/mock/data/editorial'
import { nextDispatch } from '@/mock/data/papers'
import { useEditorialStore } from '@/mock/stores/editorial'
import { AssignReviewerDialog } from './AssignReviewerDialog'

type Dlg = 'assign' | 'reassign' | 'approve' | 'noreview' | 'changes' | 'reject' | 'quick' | 'revision' | null

interface Act {
  key: string
  label: string
  icon: ReactNode
  tone?: 'primary' | 'danger'
  level: 'approve' | 'work'
  run: () => void
  disabledReason?: string
}

/** Right-hand panel: only the actions that are valid for the paper's status, disabled with a reason when the role lacks the level. */
export function PaperActions({ paper }: { paper: Paper }) {
  const { why } = usePermission('submissions')
  const canDecide = useCanAct('submissions', 'approve')
  const canRemind = useCanAct('submissions', 'work', paper.assigneeId)
  const allReviews = useEditorialStore((s) => s.reviews)
  const reviews = useMemo(() => allReviews.filter((r) => r.paperId === paper.id), [allReviews, paper.id])
  const [dlg, setDlg] = useState<Dlg>(null)
  const [rejectReason, setRejectReason] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const dispatchAt = useMemo(() => nextDispatch().toISOString(), [])
  const favourable = reviews.find((r) => r.recommendation === 'accept')
  const hasReports = reviews.length > 0

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(success)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The action could not be completed.')
    } finally {
      setBusy(false)
    }
  }
  const decide = (action: DecisionAction, reason: string, success: string) => run(() => decidePaper(paper.id, action, reason), success)

  const acts: Act[] = []
  const s = paper.status
  const reject: Act = { key: 'reject', label: 'Reject', icon: <XCircle size={15} strokeWidth={1.5} aria-hidden />, tone: 'danger', level: 'approve', run: () => setDlg('reject') }
  const changes: Act = { key: 'changes', label: 'Request changes', icon: <FilePenLine size={15} strokeWidth={1.5} aria-hidden />, level: 'approve', run: () => setDlg('changes') }
  const noReport: Act = { key: 'noreview', label: 'Accept without review report', icon: <FileCheck2 size={15} strokeWidth={1.5} aria-hidden />, level: 'approve', run: () => setDlg('noreview') }
  const remind: Act = {
    key: 'remind', label: 'Send reminder', icon: <Bell size={15} strokeWidth={1.5} aria-hidden />, level: 'work',
    run: () => run(async () => { const r = await sendReviewReminder(paper.id); return r }, 'Reminder queued for the reviewer'),
    disabledReason: paper.reviewerId ? undefined : 'No reviewer is assigned to this paper yet.',
  }

  if (s === 'submitted') {
    acts.push({ key: 'screen', label: 'Start screening', icon: <PlayCircle size={15} strokeWidth={1.5} aria-hidden />, tone: 'primary', level: 'approve', run: () => run(() => startScreening(paper.id), 'Screening started'), }, reject)
  } else if (s === 'screening') {
    acts.push({ key: 'assign', label: 'Assign reviewer', icon: <Users size={15} strokeWidth={1.5} aria-hidden />, tone: 'primary', level: 'approve', run: () => setDlg('assign') }, noReport, changes, reject)
  } else if (s === 'under_review') {
    acts.push(remind, { key: 'reassign', label: 'Reassign reviewer', icon: <UserCheck size={15} strokeWidth={1.5} aria-hidden />, level: 'approve', run: () => setDlg('reassign') }, noReport, changes, reject)
  } else if (s === 'decision_pending') {
    if (favourable) acts.push({ key: 'quick', label: 'Quick Approve', icon: <Zap size={15} strokeWidth={1.5} aria-hidden />, tone: 'primary', level: 'approve', run: () => setDlg('quick') })
    acts.push(
      { key: 'approve', label: 'Approve', icon: <CheckCircle2 size={15} strokeWidth={1.5} aria-hidden />, tone: favourable ? undefined : 'primary', level: 'approve', run: () => setDlg('approve') },
      changes, reject,
      { key: 'reassign', label: 'Request another review', icon: <UserCheck size={15} strokeWidth={1.5} aria-hidden />, level: 'approve', run: () => setDlg('reassign') },
    )
  } else if (s === 'changes_requested') {
    acts.push({ key: 'revision', label: 'Record revised manuscript', icon: <RotateCcw size={15} strokeWidth={1.5} aria-hidden />, tone: 'primary', level: 'approve', run: () => setDlg('revision') }, reject)
  }

  const classFor = (a: Act) => cn('w-full justify-start', a.tone === 'primary' ? 'btn-primary' : a.tone === 'danger' ? 'btn-danger' : 'btn-secondary')
  const email = (kind: DecisionKind, reason: string) => decisionEmail(kind, paper, reason, dispatchAt)
  const closeDlg = () => setDlg(null)

  return (
    <aside aria-label="Actions" className="card lg:sticky lg:top-4">
      <header className="border-b border-line px-4 py-3"><h2 className="text-[16px] font-semibold">Actions</h2></header>
      <div className="space-y-2 p-4">
        {acts.length === 0 ? (
          <p className="text-sm text-muted">
            {['rejected', 'withdrawn'].includes(s)
              ? 'This paper is closed. No further editorial actions are available.'
              : 'The editorial decision is complete. Payment, production and publication continue in their own screens — use the tabs on this page to follow progress.'}
          </p>
        ) : acts.map((a) => {
          const allowed = a.level === 'approve' ? canDecide : canRemind
          const reason = !allowed ? why(a.level) : a.disabledReason
          return (
            <GuardedButton key={a.key} allowed={allowed && !a.disabledReason} why={reason} className={classFor(a)} disabled={busy} onClick={a.run}>
              {a.icon}{a.label}
            </GuardedButton>
          )
        })}
        {acts.length > 0 && !canDecide && <p className="pt-1 text-xs text-muted">{why('approve')}</p>}
        {s === 'decision_pending' && !hasReports && <p className="text-xs text-muted">No review report is on file, so Quick Approve is unavailable.</p>}
        {s === 'decision_pending' && hasReports && !favourable && <p className="text-xs text-muted">No reviewer recommends acceptance, so Quick Approve is unavailable.</p>}
      </div>

      <AssignReviewerDialog open={dlg === 'assign' || dlg === 'reassign'} reassign={dlg === 'reassign'} papers={[paper]} onClose={closeDlg} onDone={() => undefined} />

      <ReasonDialog open={dlg === 'approve'} onClose={closeDlg} title="Approve paper" label="Reason for approval"
        description={`${paper.id} will be accepted and the acceptance email queued for dispatch.`}
        confirmLabel="Approve and queue email"
        consequences={[`Status becomes Accepted.`, `The author email is queued for the ${formatTime(dispatchAt)} dispatch on ${formatDate(dispatchAt)}.`]}
        emailPreview={{ to: paper.authorEmail, subject: email('accepted', '').subject, body: (r) => email('accepted', r).body }}
        onSubmit={(r) => decide('approve', r, `Approved. Acceptance email queued for ${formatTime(dispatchAt)} on ${formatDate(dispatchAt)}.`)} />

      <ReasonDialog open={dlg === 'noreview'} onClose={closeDlg} title="Accept without review report" label="Reason for skipping the review report"
        description="Use only for invited, pre-reviewed or conference-track papers."
        confirmLabel="Accept paper"
        consequences={['Recorded as “Accepted without review report” in the timeline and audit log.', `The acceptance email is queued for the ${formatTime(dispatchAt)} dispatch.`]}
        emailPreview={{ to: paper.authorEmail, subject: email('accepted_without_review', '').subject, body: (r) => email('accepted_without_review', r).body }}
        onSubmit={(r) => decide('approve_no_review', r, `Accepted without a review report. Email queued for ${formatTime(dispatchAt)}.`)} />

      <ReasonDialog open={dlg === 'changes'} onClose={closeDlg} title="Request changes" label="Changes the author must make"
        confirmLabel="Request changes"
        consequences={['Status becomes Changes requested.', 'The author receives the text below by email.']}
        emailPreview={{ to: paper.authorEmail, subject: email('changes_requested', '').subject, body: (r) => email('changes_requested', r).body }}
        onSubmit={(r) => decide('changes', r, 'Changes requested. Email queued for the author.')} />

      <ReasonDialog open={dlg === 'reject'} onClose={closeDlg} title="Reject paper" label="Reason for rejection" danger
        confirmLabel="Continue"
        description="You will be asked to confirm on the next step."
        emailPreview={{ to: paper.authorEmail, subject: email('rejected', '').subject, body: (r) => email('rejected', r).body }}
        onSubmit={(r) => setRejectReason(r)} />
      <ConfirmDialog open={rejectReason !== null} onClose={() => setRejectReason(null)} danger title={`Reject ${paper.id}?`} confirmLabel="Reject paper"
        consequences={['The paper is closed with status Rejected and leaves the review pipeline.', 'The rejection email, including your reason, is queued for the author.', 'The decision is written to the timeline and audit log and cannot be undone from this screen.']}
        onConfirm={() => { const r = rejectReason ?? ''; setRejectReason(null); void decide('reject', r, `${paper.id} rejected. Email queued for the author.`) }} />

      <ConfirmDialog open={dlg === 'quick'} onClose={closeDlg} title="Quick Approve" confirmLabel="Approve now"
        consequences={[
          `Approves ${paper.id} on the strength of ${favourable?.reviewerName ?? 'the reviewer'}’s “${favourable ? recommendationMeta(favourable.recommendation).label : 'Accept'}” recommendation.`,
          `Queues the acceptance email for the ${formatTime(dispatchAt)} dispatch on ${formatDate(dispatchAt)}.`,
          'The reason is recorded automatically and referenced to the review report.',
        ]}
        onConfirm={() => void decide('quick_approve', `Quick approve — reviewer recommendation: ${favourable ? recommendationMeta(favourable.recommendation).label : 'Accept'} (${favourable?.reviewerName ?? 'reviewer'}).`, `Approved. Acceptance email queued for ${formatTime(dispatchAt)} on ${formatDate(dispatchAt)}.`)} />

      <ReasonDialog open={dlg === 'revision'} onClose={closeDlg} title="Record revised manuscript" label="Note on the revision" minLength={5}
        description="The author has sent a revised file. A new version is added and the paper goes back into review."
        confirmLabel="Record revision"
        onSubmit={(r) => run(() => markRevisionReceived(paper.id, r), 'Revision recorded as a new file version')} />
    </aside>
  )
}
