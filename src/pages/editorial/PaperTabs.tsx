import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Bell, Download, Eye, ExternalLink, MessagesSquare, Phone, RefreshCw, RotateCcw, UserCheck, Users } from 'lucide-react'
import type { PaperEvent, Paper, MessageLogEntry } from '@/shared/types'
import { formatDate, formatDateTime, formatMoney } from '@/shared/formatters'
import { Badge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { Drawer } from '@/components/Dialog'
import { EmailPreview } from '@/components/EmailPreview'
import { DescriptionList } from '@/components/Form'
import { EmptyState } from '@/components/States'
import { RelativeTime } from '@/components/Time'
import { Timeline } from '@/components/Timeline'
import { toast } from '@/components/Toasts'
import { GuardedButton } from '@/components/Tooltip'
import { DocPreview, FileRow } from '@/components/Viewers'
import { useCanAct, usePermission } from '@/permissions/hooks'
import { UserAvatar } from '@/components/UserAvatar'
import { ReasonDialog } from '@/components/ReasonDialog'
import { markRevisionReceived, resendMessage, type PaperDetail } from '@/mock/api/papers'
import { sendReviewReminder } from '@/mock/api/reviews'
import { DECISION_META, averageScore, messageContentFor, userName } from '@/mock/data/editorial'
import { useDataStore } from '@/mock/store'
import { useEditorialStore } from '@/mock/stores/editorial'
import { DueChip } from '@/components/Due'
import { ReviewReport } from './ReviewReport'
import { AssignReviewerDialog } from './AssignReviewerDialog'
import { ProductionReview } from './ProductionReview'
import { AssociateEditorCard } from './AssociateEditorCard'
import { ManualPaymentDialog } from './ManualPaymentDialog'
import { RetractDialog } from './RetractDialog'
import { RetractionNotice } from './RetractionNotice'
import { useProductionStore } from '@/mock/stores/production'
import { MessageStatusBadge, PaymentStatusBadge, RecommendationBadge, ReviewerTypeBadge, ScoreBars, SubjectTags } from './shared'

/* ---------------- Overview ---------------- */
export function OverviewTab({ paper, detail }: { paper: Paper; detail: PaperDetail }) {
  return (
    <div className="space-y-5">
      <SectionCard title="Abstract">
        <p className="max-w-3xl text-sm leading-6">{detail.abstract}</p>
        <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Keywords">
          <span className="mr-1 text-xs text-muted">Keywords</span>
          {detail.keywords.map((k) => <Badge key={k}>{k}</Badge>)}
        </div>
      </SectionCard>

      <SectionCard title={`Authors (${detail.authors.length})`} flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>{['Author', 'Affiliation', 'Country', 'Contact', 'ORCID'].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {detail.authors.map((a, i) => (
                <tr key={a.email}>
                  <td className="px-4 py-2.5 align-top">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={a.name} photo={a.photo} size={44} />
                      <div className="min-w-0"><span className="whitespace-nowrap font-medium">{a.name}</span><div className="mt-0.5 flex flex-wrap gap-1">{i === 0 && <Badge tone="accent">Submitting author</Badge>}{a.corresponding && <Badge>Corresponding</Badge>}</div></div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 align-top text-muted">{a.affiliation}</td>
                  <td className="px-4 py-2.5 align-top whitespace-nowrap">{a.country}</td>
                  <td className="px-4 py-2.5 align-top">
                    <a className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium hover:text-accent" href={`tel:${(a.phone ?? '').replace(/\s/g, '')}`}><Phone size={13} aria-hidden className="text-faint" />{a.phone ?? <span className="font-normal text-faint">No number</span>}</a>
                    <a className="mt-0.5 block text-accent hover:underline" href={`mailto:${a.email}`}>{a.email}</a>
                  </td>
                  <td className="px-4 py-2.5 align-top whitespace-nowrap">
                    {a.orcid ? <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`https://orcid.org/${a.orcid}`} target="_blank" rel="noreferrer">{a.orcid}<ExternalLink size={12} aria-hidden /></a> : <span className="text-faint">Not provided</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Submission details">
        <DescriptionList cols={3} items={[
          { label: 'Article type', value: paper.articleType },
          { label: 'Submitted', value: formatDateTime(paper.submittedAt) },
          { label: 'Manuscript length', value: `${detail.wordCount.toLocaleString('en-IN')} words` },
          { label: 'Author country', value: paper.authorCountry },
          { label: 'Conference', value: detail.conference },
          { label: 'Payment', value: <PaymentStatusBadge status={paper.paymentStatus} /> },
          { label: 'Subject areas', value: <SubjectTags subjects={detail.subjects} /> },
          { label: 'Mentor', value: detail.mentor ?? <span className="text-muted">No mentor named</span> },
          { label: 'Referral', value: detail.referral ? <span>{detail.referral.code} · referred by {detail.referral.referrer} <Link to="/referrals" className="text-accent hover:underline">View credit</Link></span> : <span className="text-muted">Direct submission</span> },
        ]} />
      </SectionCard>

      <section aria-label="Files">
        <h3 className="mb-3 text-[16px] font-semibold">Files and manuscript versions</h3>
        <FilesTab paper={paper} />
      </section>
    </div>
  )
}

/* ---------------- Files ---------------- */
export function FilesTab({ paper }: { paper: Paper }) {
  const files = useEditorialStore((s) => s.files[paper.id])
  const list = useMemo(() => files ?? [], [files])
  const [openId, setOpenId] = useState<string>()
  const current = list.find((f) => f.id === openId) ?? list.find((f) => f.kind === 'manuscript')
  const manuscripts = list.filter((f) => f.kind === 'manuscript')
  const latest = manuscripts[0]?.id
  const row = (f: (typeof list)[number]) => (
    <FileRow key={f.id} name={f.name}
      meta={`${f.format.toUpperCase()} · ${f.sizeKb >= 1024 ? `${(f.sizeKb / 1024).toFixed(1)} MB` : `${f.sizeKb} KB`} · uploaded ${formatDate(f.uploadedAt)}${f.note ? ` · ${f.note}` : ''}`}
      action={<span className="flex items-center gap-1">
        {f.id === latest && <Badge tone="success">Current</Badge>}
        {f.kind === 'manuscript' && <Badge>v{f.version}</Badge>}
        <button className="btn-ghost !h-8 !px-2" aria-label={`Preview ${f.name}`} onClick={() => setOpenId(f.id)}><Eye size={15} strokeWidth={1.5} /></button>
        <button className="btn-ghost !h-8 !px-2" aria-label={`Download ${f.name}`} onClick={() => toast.success(`${f.name} downloaded`)}><Download size={15} strokeWidth={1.5} /></button>
      </span>} />
  )
  if (list.length === 0) return <EmptyState title="No files uploaded" hint="Manuscript files appear here once the author uploads them." />
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <SectionCard title="Manuscript versions"><div className="space-y-2">{manuscripts.map(row)}</div></SectionCard>
        <SectionCard title="Supplementary files"><div className="space-y-2">{list.filter((f) => f.kind === 'supplementary').map(row)}{list.every((f) => f.kind === 'manuscript') && <p className="text-sm text-muted">No supplementary files.</p>}</div></SectionCard>
      </div>
      {current && (
        <SectionCard title={`Preview · ${current.format === 'pdf' ? 'PDF' : 'Word'}`}>
          <p className="mb-2 truncate text-xs text-muted" title={current.name}>{current.name}</p>
          <div className="rounded-lg bg-slate-100 p-4">
            <DocPreview title={current.kind === 'manuscript' ? paper.title : current.name.replace(/_/g, ' ').replace(/\.pdf$/, '')} lines={current.kind === 'manuscript' ? 16 : 8} className="mx-auto max-w-md" />
          </div>
          <p className="mt-2 text-xs text-muted">Mock preview — the real file viewer renders the uploaded document here.</p>
        </SectionCard>
      )}
    </div>
  )
}

/* ---------------- Review ---------------- */
export function ReviewTab({ paper }: { paper: Paper }) {
  const users = useDataStore((s) => s.users)
  const allReviews = useEditorialStore((s) => s.reviews)
  const reminders = useEditorialStore((s) => s.reminders[paper.id])
  const reviews = useMemo(() => allReviews.filter((r) => r.paperId === paper.id), [allReviews, paper.id])
  const canAssign = useCanAct('submissions', 'approve')
  const canRemind = useCanAct('submissions', 'work', paper.assigneeId)
  const { why } = usePermission('submissions')
  const [open, setOpen] = useState<string>()
  const [dlg, setDlg] = useState<'assign' | 'reassign' | 'revision' | null>(null)
  const [busy, setBusy] = useState(false)
  const reviewer = users.find((u) => u.id === paper.reviewerId)
  const openReview = reviews.find((r) => r.id === open)
  const inReview = ['submitted', 'screening', 'under_review', 'decision_pending'].includes(paper.status)
  const remind = async () => {
    setBusy(true)
    try { await sendReviewReminder(paper.id); toast.success('Reminder queued for the reviewer') } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not send the reminder.') } finally { setBusy(false) }
  }
  return (
    <div className="space-y-5">
      <SectionCard title="Reviewer assigned" action={
        <div className="flex flex-wrap gap-2">
          {inReview && <GuardedButton allowed={canAssign} why={why('approve')} className="btn-secondary !h-8" onClick={() => setDlg(reviewer ? 'reassign' : 'assign')}>{reviewer ? <><UserCheck size={14} aria-hidden /> Reassign reviewer</> : <><Users size={14} aria-hidden /> Assign reviewer</>}</GuardedButton>}
          {paper.status === 'under_review' && reviewer && <GuardedButton allowed={canRemind} why={why('work')} className="btn-secondary !h-8" disabled={busy} onClick={remind}><Bell size={14} aria-hidden /> Send reminder</GuardedButton>}
          {paper.status === 'changes_requested' && <GuardedButton allowed={canAssign} why={why('approve')} className="btn-secondary !h-8" onClick={() => setDlg('revision')}><RotateCcw size={14} aria-hidden /> Record revised manuscript</GuardedButton>}
        </div>
      }>
        {reviewer ? (
          <div className="flex flex-wrap items-start gap-4">
            <UserAvatar name={reviewer.name} photo={reviewer.photo} size={48} />
            <div className="min-w-0 flex-1">
              <DescriptionList cols={3} items={[
                { label: 'Reviewer', value: <span className="font-medium">{reviewer.name}</span> },
                { label: 'Type', value: <ReviewerTypeBadge kind={reviewer.assignments[paper.journal] === 'panel_member' ? 'panel' : 'in_house'} /> },
                { label: 'Contact', value: reviewer.phone ? <a href={`tel:${reviewer.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-accent"><Phone size={13} aria-hidden className="text-faint" />{reviewer.phone}</a> : <a href={`mailto:${reviewer.email}`} className="text-accent hover:underline">{reviewer.email}</a> },
                { label: 'Review due', value: <DueChip value={paper.reviewDue} /> },
                { label: 'Reminders sent', value: reminders?.count ?? 0 },
                { label: 'Last reminder', value: reminders?.lastAt ? <RelativeTime value={reminders.lastAt} /> : <span className="text-muted">None yet</span> },
              ]} />
            </div>
          </div>
        ) : <p className="text-sm text-muted">No reviewer is assigned. {inReview ? 'Use “Assign reviewer” above.' : ''}</p>}
      </SectionCard>

      {reviews.length === 0 ? (
        <div className="card"><EmptyState title="No review reports yet" hint={reviewer ? `${reviewer.name} has not submitted a report. You can send a reminder above.` : 'Reports appear here once a reviewer submits them.'} /></div>
      ) : reviews.map((r) => (
        <SectionCard key={r.id} title={`Review by ${r.reviewerName}`} action={<button className="btn-secondary !h-8" onClick={() => setOpen(r.id)}><Eye size={14} strokeWidth={1.5} aria-hidden /> View report (PDF)</button>}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <RecommendationBadge value={r.recommendation} />
            <ReviewerTypeBadge kind={r.reviewerKind} />
            <span className="text-xs text-muted">Average {averageScore(r.scores)}/5 · submitted {formatDate(r.submittedAt)}</span>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,260px)_1fr]">
            <ScoreBars scores={r.scores} />
            <div className="space-y-3 text-sm">
              <div><p className="label">Comments to the author</p><p className="leading-6">{r.commentsToAuthor}</p></div>
              <div className="rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-inset ring-amber-200"><p className="text-xs font-medium text-amber-800">Reviewer Justification</p><p className="mt-0.5 leading-6">{r.commentsToEditor || 'None provided.'}</p></div>
            </div>
          </div>
        </SectionCard>
      ))}

      <section aria-label="Decision history">
        <h3 className="mb-3 text-[16px] font-semibold">Decision history</h3>
        <DecisionsTab paper={paper} />
      </section>

      <Drawer open={!!openReview} onClose={() => setOpen(undefined)} title="Review report" width={720}>
        {openReview && <ReviewReport review={openReview} paperTitle={paper.title} />}
      </Drawer>
      <AssignReviewerDialog open={dlg === 'assign' || dlg === 'reassign'} reassign={dlg === 'reassign'} papers={[paper]} onClose={() => setDlg(null)} onDone={() => undefined} />
      <ReasonDialog open={dlg === 'revision'} onClose={() => setDlg(null)} title="Record revised manuscript" label="Note on the revision" minLength={5}
        description="The author has sent a revised file. A new version is added and the paper goes back into review."
        confirmLabel="Record revision"
        onSubmit={(r) => { void markRevisionReceived(paper.id, r).then(() => toast.success('Revision recorded as a new file version'), (e: Error) => toast.error(e.message)) }} />
    </div>
  )
}

/* ---------------- Decisions (shown inside the Review tab) ---------------- */
export function DecisionsTab({ paper }: { paper: Paper }) {
  const all = useEditorialStore((s) => s.decisions)
  const list = useMemo(() => all.filter((d) => d.paperId === paper.id).sort((a, b) => b.at.localeCompare(a.at)), [all, paper.id])
  if (list.length === 0) {
    return <div className="card"><EmptyState title="No decision recorded" hint={paper.status === 'decision_pending' ? 'Review reports are in. Record a decision from the Decision panel.' : 'Decisions appear here with the reason given and who made them.'} /></div>
  }
  return (
    <ol className="space-y-3">
      {list.map((d) => (
        <li key={d.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={DECISION_META[d.kind].tone}>{DECISION_META[d.kind].label}</Badge>
            <span className="text-sm font-medium">{d.by}</span>
            <span className="text-xs text-muted" title={formatDateTime(d.at)}>{formatDate(d.at)} · round {d.round}</span>
          </div>
          <p className="mt-2 rounded-md bg-subtle px-3 py-2 text-sm leading-6">“{d.reason}”</p>
          {d.basedOn && d.basedOn.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">Based on the report{d.basedOn.length > 1 ? 's' : ''} of {d.basedOn.map((b) => <span key={b.id} className="inline-flex items-center gap-1 font-medium text-ink">{b.reviewerName} <RecommendationBadge value={b.recommendation} /></span>)}</p>
          )}
        </li>
      ))}
    </ol>
  )
}

/* ---------------- Payments ---------------- */
export function PaymentsTab({ paper }: { paper: Paper }) {
  const all = useDataStore((s) => s.payments)
  const { can, why } = usePermission('payments')
  const [manual, setManual] = useState(false)
  const list = useMemo(() => all.filter((p) => p.paperId === paper.id), [all, paper.id])
  const METHOD: Record<string, string> = { razorpay: 'Razorpay', card: 'Card', upi: 'UPI', bank_transfer: 'Bank transfer', other: 'Other' }
  const canRecord = ['accepted', 'payment_pending'].includes(paper.status) && !list.some((p) => p.status.startsWith('verified'))
  const existing = list.find((p) => ['awaiting_proof', 'pending_verification', 'rejected'].includes(p.status))
  return (
    <SectionCard title="Payments for this paper" flush action={<div className="flex flex-wrap items-center gap-3">
      {canRecord && <GuardedButton allowed={can('approve')} why={why('approve')} className="btn-primary !h-8" onClick={() => setManual(true)}>Manual payment</GuardedButton>}
      {can('view') && <Link to="/payments" className="text-sm font-medium text-accent hover:underline">Open payments</Link>}
    </div>}>
      {list.length === 0 ? (
        <EmptyState title="No payment recorded" hint={paper.paymentStatus === 'none' ? 'The processing charge is requested once the paper is accepted.' : `Payment status is “${paper.paymentStatus}”. Records appear here when the author pays or uploads proof.`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted"><tr>{['Date', 'Method', 'Reference', 'Amount', 'Status', 'Invoice'].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-4 py-2.5">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-2.5">{METHOD[p.method]}</td>
                  <td className="px-4 py-2.5 text-muted">{p.reference}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium tabular-nums">{formatMoney(p.total, p.currency)}</td>
                  <td className="px-4 py-2.5"><Badge tone={p.status === 'rejected' ? 'danger' : p.status === 'refunded' ? 'neutral' : p.status.startsWith('verified') ? 'success' : p.status === 'pending_verification' ? 'info' : 'warning'}>{p.status.replace(/_/g, ' ')}</Badge>{p.rejectReason && <p className="mt-1 text-xs text-red-600">{p.rejectReason}</p>}</td>
                  <td className="px-4 py-2.5 text-muted">{p.invoiceNo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canRecord && <ManualPaymentDialog open={manual} paper={paper} existing={existing} onClose={() => setManual(false)} />}
    </SectionCard>
  )
}

/* ---------------- Production ---------------- */
export function ProductionTab({ paper }: { paper: Paper }) {
  const users = useDataStore((s) => s.users)
  const finalPerm = usePermission('finalApproval')
  const record = useProductionStore((s) => s.records[paper.id])
  const [retracting, setRetracting] = useState(false)
  const canRetract = ['paid', 'in_production', 'returned_to_production', 'ready_for_approval', 'published', 'indexed', 'corrected'].includes(paper.status)
  const deposits = useDataStore((s) => s.deposits)
  const { can } = usePermission('production')
  const started = ['paid', 'in_production', 'returned_to_production', 'ready_for_approval', 'published', 'indexed', 'retracted', 'corrected'].includes(paper.status)
  const deposit = deposits.filter((d) => d.paperId === paper.id).sort((a, b) => b.version - a.version)[0]
  return (
    <div className="space-y-5">
    {paper.status === 'ready_for_approval' && <ProductionReview paper={paper} />}
    {started && <AssociateEditorCard paper={paper} />}
    <SectionCard title="Production summary" action={started && can('view') ? <Link to={`/production/${paper.id}`} className="btn-secondary !h-8">Open production workspace <ExternalLink size={13} aria-hidden /></Link> : undefined}>
      {started ? (
        <DescriptionList cols={3} items={[
          { label: 'Stage', value: <Badge tone="accent">{paper.status.replace(/_/g, ' ')}</Badge> },
          { label: 'Responsible Associate Editor', value: userName(paper.assigneeId, users) ?? <span className="text-muted">Not assigned</span> },
          { label: 'Production due', value: <DueChip value={paper.productionDue} /> },
          { label: 'DOI deposit', value: deposit ? `${deposit.status.replace('_', '-')} · v${deposit.version}` : <span className="text-muted">Not deposited yet</span> },
          { label: 'Payment', value: <PaymentStatusBadge status={paper.paymentStatus} /> },
          { label: 'Last updated', value: <RelativeTime value={paper.updatedAt} /> },
        ]} />
      ) : (
        <EmptyState title="Production has not started" hint="Production begins automatically once the paper is accepted and the payment is verified." />
      )}
    </SectionCard>
    {paper.status === 'retracted' && record?.retraction && <RetractionNotice paper={paper} record={record} />}
    {canRetract && finalPerm.can('approve') && (
      <SectionCard title="Author withdrawal">
        <p className="mb-3 text-sm text-muted">If the author asks to withdraw this article, retract it here, before or after publication. It needs the author’s written consent by email and your approval. The article page is replaced by a retraction notice at the same URL; the DOI and publication record are kept.</p>
        <button type="button" className="btn-danger" onClick={() => setRetracting(true)}><Ban size={15} aria-hidden /> Retract article</button>
        <RetractDialog open={retracting} paper={paper} onClose={() => setRetracting(false)} />
      </SectionCard>
    )}
    </div>
  )
}

/* ---------------- Communication ---------------- */
export function CommunicationTab({ paper }: { paper: Paper }) {
  const all = useDataStore((s) => s.messages)
  const { can, why } = usePermission('commLog')
  const list = useMemo(() => all.filter((m) => m.paperId === paper.id).sort((a, b) => b.at.localeCompare(a.at)), [all, paper.id])
  const [openId, setOpenId] = useState<string>()
  const open = list.find((m) => m.id === openId)
  const [busy, setBusy] = useState(false)
  const content = open ? messageContentFor(open.template, paper) : undefined
  const retry = async (m: MessageLogEntry) => {
    setBusy(true)
    try { await resendMessage(m.id); toast.success('Message re-queued for the next dispatch'); setOpenId(undefined) } catch { toast.error('Could not re-queue the message.') } finally { setBusy(false) }
  }
  return (
    <SectionCard title={`Messages (${list.length})`} flush action={can('view') && <Link to="/communication-log" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"><MessagesSquare size={14} aria-hidden /> Communication log</Link>}>
      {list.length === 0 ? <EmptyState title="No messages sent yet" hint="Every email, SMS and WhatsApp message about this paper is listed here with its delivery status." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted"><tr>{['When', 'Channel', 'Message', 'Recipient', 'Delivery'].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((m) => (
                <tr key={m.id} tabIndex={0} className="cursor-pointer hover:bg-page" onClick={() => setOpenId(m.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(m.id)}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted"><RelativeTime value={m.at} /></td>
                  <td className="px-4 py-2.5 capitalize">{m.channel}</td>
                  <td className="px-4 py-2.5 font-medium">{m.template}</td>
                  <td className="px-4 py-2.5 text-muted">{m.recipient}</td>
                  <td className="px-4 py-2.5"><MessageStatusBadge status={m.status} />{m.failureReason && <p className="mt-1 max-w-[260px] text-xs text-red-600">{m.failureReason}</p>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Drawer open={!!open} onClose={() => setOpenId(undefined)} title={open?.template ?? 'Message'} width={560}>
        {open && content && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <MessageStatusBadge status={open.status} />
              <span className="capitalize text-muted">{open.channel}</span>
              <span className="text-muted" title={formatDateTime(open.at)}>· {formatDateTime(open.at)}</span>
            </div>
            {open.status === 'failed' && (
              <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                <p className="font-medium">Delivery failed</p><p>{open.failureReason ?? 'The provider did not give a reason.'}</p>
              </div>
            )}
            {open.channel === 'email'
              ? <EmailPreview to={open.recipient} subject={content.subject} body={content.body} />
              : <div><p className="label">To {open.recipient}</p><p className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-green-50 px-4 py-3 text-sm leading-6 ring-1 ring-inset ring-green-200">{content.body}</p></div>}
            {open.status === 'failed' && (
              <GuardedButton allowed={can('work')} why={why('work')} className="btn-primary" disabled={busy} onClick={() => retry(open)}><RefreshCw size={14} aria-hidden /> Re-queue message</GuardedButton>
            )}
          </div>
        )}
      </Drawer>
    </SectionCard>
  )
}

/* ---------------- Timeline / audit ---------------- */
export function TimelineTab({ paper }: { paper: Paper }) {
  const live = useDataStore((s) => s.events)
  const audit = useDataStore((s) => s.audit)
  const history = useEditorialStore((s) => s.history)
  const { can } = usePermission('audit')
  const items = useMemo(() => {
    const merged: PaperEvent[] = [...live.filter((e) => e.paperId === paper.id), ...history.filter((e) => e.paperId === paper.id)]
    return merged.sort((a, b) => b.at.localeCompare(a.at))
  }, [live, history, paper.id])
  const entries = useMemo(() => audit.filter((a) => a.target === paper.id), [audit, paper.id])
  return (
    <div className="space-y-5">
      <SectionCard title="Timeline"><Timeline items={items} empty="No activity recorded yet." /></SectionCard>
      <SectionCard title="Audit trail" flush>
        {!can('view') ? <p className="p-4 text-sm text-muted">The audit trail is visible to Super Admins. Timeline entries above show the same decisions in plain language.</p>
          : entries.length === 0 ? <p className="p-4 text-sm text-muted">No audited changes since the demo data was loaded.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted"><tr>{['When', 'Who', 'Change', 'Old → new'].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {entries.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted" title={formatDateTime(a.at)}><RelativeTime value={a.at} /></td>
                    <td className="px-4 py-2.5">{a.actor}</td>
                    <td className="px-4 py-2.5 font-medium">{a.action}</td>
                    <td className="px-4 py-2.5 text-muted">{a.oldValue || a.newValue ? `${a.oldValue ?? '—'} → ${a.newValue ?? '—'}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
