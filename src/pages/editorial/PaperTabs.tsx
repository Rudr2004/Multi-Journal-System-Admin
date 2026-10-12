import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Eye, ExternalLink, MessagesSquare, RefreshCw } from 'lucide-react'
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
import { usePermission } from '@/permissions/hooks'
import { resendMessage, type PaperDetail } from '@/mock/api/papers'
import { DECISION_META, averageScore, messageContentFor, userName } from '@/mock/data/editorial'
import { useDataStore } from '@/mock/store'
import { useEditorialStore } from '@/mock/stores/editorial'
import { DueChip } from '@/components/Due'
import { ReviewReport } from './ReviewReport'
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
              <tr>{['Name', 'Affiliation', 'Country', 'Email', 'ORCID'].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {detail.authors.map((a, i) => (
                <tr key={a.email}>
                  <td className="px-4 py-2.5 align-top"><span className="whitespace-nowrap font-medium">{a.name}</span> {i === 0 && <Badge tone="accent">Submitting author</Badge>}{a.corresponding && <span className="ml-1"><Badge>Corresponding</Badge></span>}</td>
                  <td className="px-4 py-2.5 align-top text-muted">{a.affiliation}</td>
                  <td className="px-4 py-2.5 align-top whitespace-nowrap">{a.country}</td>
                  <td className="px-4 py-2.5 align-top"><a className="text-accent hover:underline" href={`mailto:${a.email}`}>{a.email}</a></td>
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
          { label: 'Submitted', value: formatDate(paper.submittedAt) },
          { label: 'Manuscript length', value: `${detail.wordCount.toLocaleString('en-IN')} words` },
          { label: 'Author country', value: paper.authorCountry },
          { label: 'Conference', value: detail.conference },
          { label: 'Payment', value: <PaymentStatusBadge status={paper.paymentStatus} /> },
          { label: 'Subject areas', value: <SubjectTags subjects={detail.subjects} /> },
          { label: 'Mentor', value: detail.mentor ?? <span className="text-muted">No mentor named</span> },
          { label: 'Referral', value: detail.referral ? <span>{detail.referral.code} · referred by {detail.referral.referrer} <Link to="/referrals" className="text-accent hover:underline">View credit</Link></span> : <span className="text-muted">Direct submission</span> },
        ]} />
      </SectionCard>
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
  const [open, setOpen] = useState<string>()
  const reviewer = users.find((u) => u.id === paper.reviewerId)
  const openReview = reviews.find((r) => r.id === open)
  return (
    <div className="space-y-5">
      <SectionCard title="Reviewer assigned">
        {reviewer ? (
          <DescriptionList cols={3} items={[
            { label: 'Reviewer', value: <span className="font-medium">{reviewer.name}</span> },
            { label: 'Type', value: <ReviewerTypeBadge kind={reviewer.assignments[paper.journal] === 'panel_member' ? 'panel' : 'in_house'} /> },
            { label: 'Review due', value: <DueChip value={paper.reviewDue} /> },
            { label: 'Reminders sent', value: reminders?.count ?? 0 },
            { label: 'Last reminder', value: reminders?.lastAt ? <RelativeTime value={reminders.lastAt} /> : <span className="text-muted">None yet</span> },
          ]} />
        ) : <p className="text-sm text-muted">No reviewer is assigned. {paper.status === 'screening' ? 'Use “Assign reviewer” in the Actions panel.' : ''}</p>}
      </SectionCard>

      {reviews.length === 0 ? (
        <div className="card"><EmptyState title="No review reports yet" hint={reviewer ? `${reviewer.name} has not submitted a report. You can send a reminder from the Actions panel.` : 'Reports appear here once a reviewer submits them.'} /></div>
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
              <div className="rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-inset ring-amber-200"><p className="text-xs font-medium text-amber-800">Confidential — comments to the editor</p><p className="mt-0.5 leading-6">{r.commentsToEditor || 'None provided.'}</p></div>
            </div>
          </div>
        </SectionCard>
      ))}
      <Drawer open={!!openReview} onClose={() => setOpen(undefined)} title="Review report" width={720}>
        {openReview && <ReviewReport review={openReview} paperTitle={paper.title} />}
      </Drawer>
    </div>
  )
}

/* ---------------- Decisions ---------------- */
export function DecisionsTab({ paper }: { paper: Paper }) {
  const all = useEditorialStore((s) => s.decisions)
  const list = useMemo(() => all.filter((d) => d.paperId === paper.id).sort((a, b) => b.at.localeCompare(a.at)), [all, paper.id])
  if (list.length === 0) {
    return <div className="card"><EmptyState title="No decision recorded" hint={paper.status === 'decision_pending' ? 'Review reports are in. Record a decision from the Actions panel.' : 'Decisions appear here with the reason given and who made them.'} /></div>
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
        </li>
      ))}
    </ol>
  )
}

/* ---------------- Payments ---------------- */
export function PaymentsTab({ paper }: { paper: Paper }) {
  const all = useDataStore((s) => s.payments)
  const { can } = usePermission('payments')
  const list = useMemo(() => all.filter((p) => p.paperId === paper.id), [all, paper.id])
  const METHOD: Record<string, string> = { razorpay: 'Razorpay', card: 'Card', upi: 'UPI', bank_transfer: 'Bank transfer', other: 'Other' }
  return (
    <SectionCard title="Payments for this paper" flush action={can('view') && <Link to="/payments" className="text-sm font-medium text-accent hover:underline">Open payments</Link>}>
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
    </SectionCard>
  )
}

/* ---------------- Production ---------------- */
export function ProductionTab({ paper }: { paper: Paper }) {
  const users = useDataStore((s) => s.users)
  const deposits = useDataStore((s) => s.deposits)
  const { can } = usePermission('production')
  const started = ['paid', 'in_production', 'returned_to_production', 'ready_for_approval', 'published', 'indexed', 'retracted', 'corrected'].includes(paper.status)
  const deposit = deposits.filter((d) => d.paperId === paper.id).sort((a, b) => b.version - a.version)[0]
  return (
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
