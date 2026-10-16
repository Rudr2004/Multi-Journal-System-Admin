import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, Pencil, CheckCircle2, Copy, FileCheck2, FileUp, Link2, Mail, Award, Paperclip, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { CertificatePreview } from '@/components/CertificatePreview'
import { ConfirmDialog } from '@/components/Dialog'
import { DescriptionList, FormField } from '@/components/Form'
import { ReasonDialog } from '@/components/ReasonDialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { Timeline } from '@/components/Timeline'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import { FLAG_META } from '@/permissions/flags'
import { useDataStore, useSession } from '@/mock/store'
import { useProductionStore } from '@/mock/stores/production'
import {
  decideChangeRequest, getChangeRequest, markFeePaid, previewFee, releaseWithoutFee, reviewNewVersion, setCorrectionFee, startReview,
  submitNewVersion, waiveCorrectionFee, workBlockReason, type ChangeDetail,
} from '@/mock/api/postPublication'
import { CHANGE_TYPE_META, type ChangeRequest, type MetadataEdit } from '@/mock/data/production'
import { formatDate, formatDateTime, formatMoney } from '@/shared/formatters'
import { doiFor } from '@/shared/paperId'
import type { Currency } from '@/shared/gst'
import { ChangeStatusBadge, ChangeTypeBadge, FeeBadge } from './postPubShared'
import { EditMetadataDialog } from './EditMetadataDialog'

export function PostPubDetailPage() {
  const { id = '' } = useParams()
  const rev = useProductionStore((s) => s.changeRequests.find((r) => r.id === id))
  const key = rev ? `${rev.status}:${rev.versions.length}:${rev.events.length}:${rev.fee?.state ?? ''}` : ''
  const q = useAsync(() => getChangeRequest(id), [id, key])
  const crumbs = [{ label: id }]
  if (q.error) return (<><PageHeader title="Change request" crumbs={crumbs} /><div className="card"><ErrorState message={q.error.message} onRetry={q.reload} /></div></>)
  if (!q.data) return (<><PageHeader title="Change request" crumbs={crumbs} /><div className="grid gap-4 lg:grid-cols-[1fr_340px]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div></>)
  return <Detail detail={{ ...q.data, request: rev ?? q.data.request }} />
}

type StepKey = 'requested' | 'review' | 'approved' | 'fee' | 'ready' | 'version' | 'done'
const STEP_LABEL: Record<StepKey, string> = { requested: 'Requested', review: 'Under review', approved: 'Approved', fee: 'Fee paid or waived', ready: 'Ready for correction', version: 'Version submitted', done: 'Completed' }

function stepsFor(r: ChangeRequest, hasFee: boolean): StepKey[] {
  if (!CHANGE_TYPE_META[r.type].editsArticle) return ['requested', 'review', 'done']
  return hasFee ? ['requested', 'review', 'approved', 'fee', 'ready', 'version', 'done'] : ['requested', 'review', 'approved', 'ready', 'version', 'done']
}
function stepIndex(r: ChangeRequest, steps: StepKey[]) {
  const at = (k: StepKey) => steps.indexOf(k)
  switch (r.status) {
    case 'requested': return at('requested')
    case 'under_review': case 'rejected': return at('review')
    case 'approved': return steps.includes('fee') ? at('fee') : at('approved')
    case 'ready': case 'revision': return at('ready')
    case 'version_review': return at('version')
    case 'completed': return steps.length
  }
}

function Detail({ detail }: { detail: ChangeDetail }) {
  const { request: r, paper } = detail
  const perm = usePermission('postPub')
  const user = useCurrentUser()
  const feeOn = useSession((s) => s.flags.correctionFee)
  const isAe = perm.role === 'associate_editor'
  const isSupport = perm.role === 'support'
  const canApprove = perm.can('approve')
  const canEdit = isAe && r.assigneeId === user?.id
  const users = useDataStore((s) => s.users)
  const meta = CHANGE_TYPE_META[r.type]
  const hasFee = meta.editsArticle && (feeOn || !!r.fee)
  const steps = stepsFor(r, hasFee)
  const current = stepIndex(r, steps)
  const [reject, setReject] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [confirmVersion, setConfirmVersion] = useState(false)
  const [changes, setChanges] = useState(false)
  const [busy, setBusy] = useState(false)
  const initialMeta = useMemo<MetadataEdit>(() => ({ title: detail.record.title, abstract: detail.record.abstract, keywords: detail.record.keywords, authors: detail.record.authors, finalFileName: detail.record.finalFile?.name, manuscriptName: detail.record.manuscript.fileName }), [detail.record])
  const [metaEdit, setMetaEdit] = useState<MetadataEdit | undefined>()
  const [metaOpen, setMetaOpen] = useState(false)
  const metaEdited = !!metaEdit && JSON.stringify(metaEdit) !== JSON.stringify(initialMeta)
  const open = r.status === 'ready' || r.status === 'revision'
  const latest = r.versions[r.versions.length - 1]

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok) } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const approveLabel = r.type === 'retraction' ? 'Approve retraction' : r.type === 'withdrawal' ? 'Approve withdrawal' : 'Approve request'

  // Support only sees requests they raised; the Associate Editor only sees requests the Editor has approved.
  if ((isSupport && r.requestedBy !== user?.name) || (isAe && (!meta.editsArticle || ['requested', 'under_review', 'rejected'].includes(r.status)))) {
    return (
      <>
        <PageHeader title={r.id} crumbs={[{ label: r.id }]} actions={<Link to="/post-publication" className="btn-secondary"><ArrowLeft size={14} aria-hidden /> All requests</Link>} />
        <div className="card"><EmptyState icon={Link2} title="This request is not available to you" hint={isSupport ? 'You can open requests you raised yourself.' : 'It appears here once the Editor has approved it.'} /></div>
      </>
    )
  }

  return (
    <>
      <PageHeader title={r.id} description={`${meta.label} · ${paper.title}`} crumbs={[{ label: r.id }]}
        actions={<Link to="/post-publication" className="btn-secondary"><ArrowLeft size={14} aria-hidden /> All requests</Link>} />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <JournalBadge code={r.journal} /><ChangeTypeBadge type={r.type} /><ChangeStatusBadge status={r.status} />{hasFee && r.status !== 'rejected' && r.status !== 'requested' && r.status !== 'under_review' && <FeeBadge fee={r.fee} />}
        <span className="text-muted">Paper <span className="whitespace-nowrap text-ink">{paper.id}</span></span><StatusBadge status={paper.status} />
        {!isSupport && !isAe && <Link to={`/submissions/${paper.id}`} className="text-accent hover:underline">Submission record</Link>}
      </div>

      {open && (isAe || canApprove) && (
        <section aria-label="Required corrections" className="mb-5 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
              <div>
                <h2 className="text-base font-semibold text-amber-950">Required corrections</h2>
                <p className="text-sm text-amber-900">{r.status === 'revision' ? 'The Editor sent version ' + (r.baseVersion + 1) + ' back. Address the note and the changes below.' : 'The Editor approved these changes. Complete them, then send the new version back for approval.'}</p>
              </div>
            </div>
            <GuardedButton allowed={canEdit} why={perm.why('work') ?? 'This request is assigned to another Associate Editor.'} className="btn-primary" onClick={() => setMetaOpen(true)}><Pencil size={15} aria-hidden /> Edit</GuardedButton>
          </div>
          {r.status === 'revision' && r.decisionNote && <p className="mt-3 rounded-md bg-white/70 p-3 text-sm text-amber-950"><span className="font-medium">Editor’s note:</span> {r.decisionNote}</p>}
          <p className="mt-3 text-sm text-amber-950"><span className="font-medium">Reason:</span> {r.reason}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {r.targets.map((t) => (
              <li key={t.key} className="rounded-md bg-white/70 px-3 py-2"><span className="font-medium">{t.label}:</span> <span className="text-muted line-through">{t.oldValue || '—'}</span> <span aria-hidden>→</span> <span className="font-medium text-amber-950">{t.newValue || '—'}</span></li>
            ))}
          </ul>
          {metaEdited && <p className="mt-2 text-xs font-medium text-green-800">Metadata edits are saved in your draft. Send the new version to the Editor below.</p>}
        </section>
      )}

      <ol aria-label="Progress" className="mb-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <li key={s} aria-current={i === current ? 'step' : undefined}>
            <div className={cn('h-1 rounded-full', r.status === 'rejected' ? 'bg-red-300' : i <= current ? 'bg-accent' : 'bg-slate-200')} />
            <p className={cn('mt-1.5 flex items-center gap-1 text-xs', i === current ? 'font-semibold text-ink' : 'text-muted')}>{i < current && <Check size={12} className="text-accent" aria-hidden />}{STEP_LABEL[s]}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          <SectionCard title="Request">
            <DescriptionList items={[
              { label: 'Raised by', value: `${r.requestedBy} · ${formatDateTime(r.requestedAt)}` },
              { label: 'Current article version', value: `Version ${r.baseVersion}` },
              { label: 'Associate Editor (prepares the new version)', value: users.find((u) => u.id === r.assigneeId)?.name ?? (['requested', 'under_review'].includes(r.status) ? 'Assigned when approved' : 'Not assigned: no Associate Editor in this journal') },
              { label: 'DOI', value: <span className="font-mono text-xs">{doiFor(paper.id)}</span> },
              ...(r.attachmentName ? [{ label: 'Attachment', value: <span className="inline-flex items-center gap-1"><Paperclip size={13} aria-hidden /> {r.attachmentName}</span> }] : []),
            ]} />
            <div className="mt-4"><p className="text-xs text-muted">Reason</p><p className="mt-0.5 text-sm">{r.reason}</p></div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Requested changes</caption>
                <thead><tr className="border-b border-line text-left text-xs text-muted"><th scope="col" className="py-1.5 pr-3 font-medium">Field</th><th scope="col" className="py-1.5 pr-3 font-medium">As published</th><th scope="col" className="py-1.5 font-medium">Requested</th></tr></thead>
                <tbody>{r.targets.map((t) => (
                  <tr key={t.key} className="border-b border-line align-top last:border-0"><td className="py-2 pr-3 font-medium">{t.label}</td><td className="py-2 pr-3 text-muted">{t.oldValue || '—'}</td><td className="py-2">{t.newValue || '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {r.status === 'rejected' && <p role="note" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-900"><span className="font-medium">Rejected.</span> {r.decisionNote}</p>}
            {isSupport && ['requested', 'under_review'].includes(r.status) && <p role="note" className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-muted">The Editor is reviewing this request. You will see the outcome here; tell the author once it is approved or rejected.</p>}
          </SectionCard>

          {(r.status === 'requested' || r.status === 'under_review') && !isSupport && (
            <SectionCard title="Decision">
              <p className="mb-3 text-sm text-muted">{canApprove
                ? meta.editsArticle
                  ? feeOn ? 'Approving moves the request to the fee step. Once the correction fee is paid or waived, the Associate Editor prepares a new version for your approval.' : 'Approving releases the request to the Associate Editor, who prepares a new version for your approval.'
                  : 'Retractions and withdrawals skip the fee and version steps: approving applies the change to the live record immediately.'
                : 'Only an Editor can approve or reject this request.'}</p>
              <div className="flex flex-wrap gap-2">
                {r.status === 'requested' && (
                  <GuardedButton allowed={canApprove} why={perm.why('approve')} className="btn-secondary" disabled={busy} onClick={() => act(() => startReview(r.id), 'Marked as under review.')}>Start review</GuardedButton>
                )}
                <GuardedButton allowed={canApprove} why={perm.why('approve')} className={meta.editsArticle ? 'btn-primary' : 'btn-danger'} disabled={busy} onClick={() => (meta.editsArticle ? act(() => decideChangeRequest(r.id, 'approve'), feeOn ? 'Approved. Set or waive the correction fee next.' : 'Approved and released to the Associate Editor.') : setConfirmApprove(true))}><ThumbsUp size={15} aria-hidden /> {approveLabel}</GuardedButton>
                <GuardedButton allowed={canApprove} why={perm.why('approve')} className="btn-secondary" disabled={busy} onClick={() => setReject(true)}><ThumbsDown size={15} aria-hidden /> Reject</GuardedButton>
              </div>
            </SectionCard>
          )}

          {hasFee && ['approved', 'ready', 'revision', 'version_review', 'completed'].includes(r.status) && (
            <FeeSection request={r} detail={detail} canApprove={canApprove} why={perm.why('approve')} busy={busy} act={act} />
          )}
          {!hasFee && r.status === 'approved' && meta.editsArticle && (
            <SectionCard title="Correction fee">
              <p className="mb-3 text-sm text-muted">The correction fee is switched off, so there is no fee step.</p>
              <GuardedButton allowed={canApprove} why={perm.why('approve')} className="btn-primary" disabled={busy} onClick={() => act(() => releaseWithoutFee(r.id), 'Released to the Associate Editor.')}><Send size={15} aria-hidden /> Release to Associate Editor</GuardedButton>
            </SectionCard>
          )}

          {r.status === 'approved' && (isAe || canApprove) && (
            <SectionCard title="Prepare new version">
              <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900"><span className="font-medium">Read-only for now.</span> {workBlockReason(r)}</p>
            </SectionCard>
          )}

          {(r.status === 'ready' || r.status === 'revision') && (
            canEdit || isAe ? (
              <NewVersionForm key={`${r.id}-${r.versions.length}-${r.events.length}`} request={r} canEdit={canEdit} why={perm.why('work') ?? 'This request is assigned to another Associate Editor.'} busy={busy} metaEdited={metaEdited} onEditMeta={() => setMetaOpen(true)}
                onSubmit={(values, summary) => act(async () => { await submitNewVersion(r.id, values, summary, metaEdited ? metaEdit : undefined); setMetaEdit(undefined) }, `Version ${r.baseVersion + 1} sent back to the Editor for approval.`)} />
            ) : (
              <SectionCard title="With the Associate Editor">
                <p className="text-sm text-muted">{users.find((u) => u.id === r.assigneeId)?.name ?? 'The Associate Editor'} is preparing version {r.baseVersion + 1}. You approve it when it comes back.
                  {r.status === 'revision' && r.decisionNote ? ` Your note: “${r.decisionNote}”` : ''}</p>
              </SectionCard>
            )
          )}

          {r.status === 'version_review' && latest && (
            <SectionCard title={`Review version ${latest.n}`}>
              <p className="mb-3 text-sm text-muted">{latest.summary} · prepared by {latest.by}</p>
              <DiffTable version={latest} />
              {canApprove ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <GuardedButton allowed={canApprove} why={perm.why('approve')} className="btn-primary" disabled={busy} onClick={() => setConfirmVersion(true)}><ThumbsUp size={15} aria-hidden /> Approve version {latest.n}</GuardedButton>
                  <GuardedButton allowed={canApprove} why={perm.why('approve')} className="btn-secondary" disabled={busy} onClick={() => setChanges(true)}>Request changes</GuardedButton>
                </div>
              ) : <p className="mt-3 text-sm text-muted">Sent back to the Editor for approval. You will see the result here.</p>}
            </SectionCard>
          )}

          {r.status === 'completed' && r.result && <ResultPanel r={r} detail={detail} />}

          {r.versions.length > 0 && (
            <SectionCard title="Version history (old vs new)">
              <ol className="space-y-5">
                <li>
                  <p className="text-sm font-medium">Version {r.baseVersion} <Badge tone={r.status === 'completed' ? 'neutral' : 'success'}>{r.status === 'completed' ? 'Superseded' : 'Live'}</Badge></p>
                  <p className="text-xs text-muted">The article as originally published.</p>
                </li>
                {r.versions.map((v) => (
                  <li key={v.n}>
                    <p className="text-sm font-medium">Version {v.n} <Badge tone={v.state === 'live' ? 'success' : v.state === 'in_review' ? 'accent' : 'neutral'}>{{ live: 'Live', draft: 'Draft', in_review: 'Awaiting approval', approved: 'Approved', superseded: 'Superseded' }[v.state]}</Badge></p>
                    <p className="mb-2 text-xs text-muted">{v.by} · {formatDateTime(v.at)} · {v.summary}</p>
                    <DiffTable version={v} baseVersion={r.baseVersion} />
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}
        </div>

        <SectionCard title="Activity">
          <Timeline items={[...r.events].reverse()} />
        </SectionCard>
      </div>

      <EditMetadataDialog open={metaOpen} onClose={() => setMetaOpen(false)} initial={metaEdit ?? initialMeta} onSave={(m) => { setMetaEdit(m); toast.success('Metadata changes saved to the draft version.') }} />
      <ConfirmDialog open={confirmApprove} onClose={() => setConfirmApprove(false)} danger title={`${approveLabel} for ${paper.id}?`} confirmLabel={approveLabel}
        onConfirm={() => act(() => decideChangeRequest(r.id, 'approve'), r.type === 'retraction' ? 'Article retracted.' : 'Article withdrawn.')}
        consequences={[
          r.type === 'retraction' ? 'Mark the article as retracted on the journal website; the notice stays public permanently.' : 'Remove the article from the live record.',
          'Re-deposit the updated metadata to Crossref.',
          'Notify all authors by email.',
          `Set the paper status to ${r.type === 'retraction' ? 'Retracted' : 'Withdrawn'}. This cannot be undone.`,
        ]} />
      <ReasonDialog open={reject} onClose={() => setReject(false)} title="Reject change request" label="Reason for rejecting" confirmLabel="Reject request" danger
        description="The requester sees this reason on the request."
        onSubmit={(note) => act(() => decideChangeRequest(r.id, 'reject', note), 'Request rejected.')} />
      <ConfirmDialog open={confirmVersion} onClose={() => setConfirmVersion(false)} title={`Approve version ${latest?.n ?? ''} and publish the change?`} confirmLabel="Approve & publish"
        onConfirm={() => act(() => reviewNewVersion(r.id, 'approve'), 'Version approved. The article is updated.')}
        consequences={[
          'Replace the live article with the new version and mark the paper as Corrected.',
          'Re-deposit the article to Crossref (versioned re-deposit).',
          ...(r.targets.some((t) => t.apply.kind === 'author' && t.apply.prop === 'name') ? ['Regenerate the certificate of the affected author.'] : []),
          'Notify the authors by email.',
        ]} />
      <ReasonDialog open={changes} onClose={() => setChanges(false)} title="Request changes to the new version" label="What needs to change" confirmLabel="Send back"
        onSubmit={(note) => act(() => reviewNewVersion(r.id, 'changes', note), 'Sent back to the Associate Editor.')} />
    </>
  )
}

/** Correction fee: Editor sets or waives it, the payment link goes to the author and the status is tracked. */
function FeeSection({ request: r, detail, canApprove, why, busy, act }: {
  request: ChangeRequest; detail: ChangeDetail; canApprove: boolean; why?: string; busy: boolean
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>
}) {
  const { paper } = detail
  const indian = paper.authorCountry === 'India'
  const [currency, setCurrency] = useState<Currency>(indian ? 'INR' : 'USD')
  const [base, setBase] = useState(indian ? '1500' : '25')
  const [waive, setWaive] = useState(false)
  const amount = Number(base)
  const invalid = !(amount > 0)
  const g = useMemo(() => (invalid ? null : previewFee(currency, amount)), [currency, amount, invalid])
  const fee = r.fee
  const decide = r.status === 'approved' && !fee

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Payment link copied.') } catch { toast.info('Copy is not available here. Select the link and copy it manually.') }
  }

  return (
    <SectionCard title="Correction fee" action={<Badge tone="accent">{FLAG_META.correctionFee.badge}</Badge>}>
      {decide && (
        <>
          <p className="mb-3 text-sm text-muted">Set a fee for this correction, or waive it. The author receives a payment link by email and the Associate Editor can start once the fee is paid or waived.</p>
          <fieldset disabled={!canApprove} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <FormField label="Currency">
              {(a) => <select {...a} className="input" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}><option value="INR">INR (Indian authors, GST applies)</option><option value="USD">USD (no GST)</option></select>}
            </FormField>
            <FormField label="Fee before tax" required error={invalid ? 'Enter an amount greater than zero.' : undefined}>
              {(a) => <input {...a} type="number" min={1} step="0.01" inputMode="decimal" className="input" value={base} onChange={(e) => setBase(e.target.value)} />}
            </FormField>
          </fieldset>
          {g && (
            <dl className="mt-3 grid max-w-sm grid-cols-2 gap-x-4 gap-y-1 text-sm" aria-label="Fee breakdown">
              <dt className="text-muted">Fee</dt><dd className="text-right tabular-nums">{formatMoney(g.base, g.currency)}</dd>
              {g.cgst > 0 && <><dt className="text-muted">CGST 9%</dt><dd className="text-right tabular-nums">{formatMoney(g.cgst, g.currency)}</dd><dt className="text-muted">SGST 9%</dt><dd className="text-right tabular-nums">{formatMoney(g.sgst, g.currency)}</dd></>}
              {g.igst > 0 && <><dt className="text-muted">IGST 18%</dt><dd className="text-right tabular-nums">{formatMoney(g.igst, g.currency)}</dd></>}
              <dt className="font-medium">Total payable</dt><dd className="text-right font-medium tabular-nums">{formatMoney(g.total, g.currency)}</dd>
              <dd className="col-span-2 text-xs text-muted">{g.note}</dd>
            </dl>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <GuardedButton allowed={canApprove && !invalid} why={why ?? 'Enter the fee amount first.'} className="btn-primary" disabled={busy} onClick={() => act(() => setCorrectionFee(r.id, currency, amount), 'Fee set and payment link sent to the author.')}><Send size={15} aria-hidden /> Send payment link</GuardedButton>
            <GuardedButton allowed={canApprove} why={why} className="btn-secondary" disabled={busy} onClick={() => setWaive(true)}>Waive fee</GuardedButton>
          </div>
        </>
      )}
      {!decide && !fee && <p className="text-sm text-muted">No fee was set for this request.</p>}
      {fee && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><FeeBadge fee={fee} />
            {fee.state !== 'waived' && <span className="tabular-nums">{formatMoney(fee.total, fee.currency)}{fee.gst > 0 ? ` (fee ${formatMoney(fee.base, fee.currency)} + ${fee.gstNote})` : ` · ${fee.gstNote}`}</span>}
            {fee.state === 'paid' && fee.paidAt && <span className="text-muted">Paid {formatDate(fee.paidAt)}</span>}
          </div>
          {fee.state === 'waived' && <p className="text-muted">Waived: {fee.waivedReason}</p>}
          {fee.link && fee.state !== 'waived' && (
            <div>
              <p className="label">Correction fee payment link{fee.sentAt ? ` · sent ${formatDate(fee.sentAt)}` : ''}</p>
              <div className="flex items-center gap-2">
                <input readOnly aria-label="Payment link" className="input font-mono text-xs" value={fee.link} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn-secondary shrink-0" onClick={() => copy(fee.link!)}><Copy size={14} aria-hidden /> Copy</button>
              </div>
            </div>
          )}
          {fee.state === 'pending' && (
            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3">
              <p className="text-xs text-amber-900"><span className="font-medium">Prototype only.</span> Real payments are not connected. This button simulates the author paying through the link.</p>
              <GuardedButton allowed={canApprove} why={why} className="btn-secondary mt-2" disabled={busy} onClick={() => act(() => markFeePaid(r.id), 'Marked as paid. The Associate Editor can start.')}><Check size={14} aria-hidden /> Mark as paid (simulate)</GuardedButton>
            </div>
          )}
        </div>
      )}
      <ReasonDialog open={waive} onClose={() => setWaive(false)} title="Waive the correction fee" label="Reason for waiving" confirmLabel="Waive fee"
        description="The request goes straight to the Associate Editor. The reason is recorded in the audit log."
        onSubmit={(note) => act(() => waiveCorrectionFee(r.id, note), 'Fee waived. Released to the Associate Editor.')} />
    </SectionCard>
  )
}

function DiffTable({ version, baseVersion }: { version: ChangeRequest['versions'][number]; baseVersion?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Changes in version {version.n}</caption>
        <thead><tr className="border-b border-line text-left text-xs text-muted"><th scope="col" className="py-1.5 pr-3 font-medium">Field</th><th scope="col" className="py-1.5 pr-3 font-medium">Version {baseVersion ?? version.n - 1} (before)</th><th scope="col" className="py-1.5 font-medium">Version {version.n} (after)</th></tr></thead>
        <tbody>{version.changes.map((c) => (
          <tr key={c.field} className="border-b border-line align-top last:border-0">
            <td className="py-2 pr-3 font-medium">{c.field}</td>
            <td className="py-2 pr-3"><span className="rounded bg-red-50 px-1 text-red-800 line-through decoration-red-300">{c.oldValue || '—'}</span></td>
            <td className="py-2"><span className="rounded bg-green-50 px-1 text-green-800">{c.newValue}</span></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function NewVersionForm({ request: r, canEdit, why, busy, metaEdited, onEditMeta, onSubmit }: { request: ChangeRequest; canEdit: boolean; why: string; busy: boolean; metaEdited: boolean; onEditMeta: () => void; onSubmit: (values: Record<string, string>, summary: string) => void }) {
  const prev = r.versions[r.versions.length - 1]
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(r.targets.map((t) => [t.key, prev?.changes.find((c) => c.field === t.label)?.newValue ?? t.newValue])))
  const [summary, setSummary] = useState(prev?.summary ?? '')
  const [touched, setTouched] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const unchanged = useMemo(() => r.targets.every((t) => (values[t.key] ?? '').trim() === t.oldValue), [r.targets, values])
  const blank = r.targets.some((t) => !(values[t.key] ?? '').trim())
  const n = r.baseVersion + 1
  const submit = () => { setTouched(true); if ((!unchanged || metaEdited) && !blank && summary.trim().length >= 5) onSubmit(values, summary) }
  return (
    <SectionCard title={`Prepare new version (v${n})`} action={<GuardedButton allowed={canEdit} why={why} className="btn-secondary !h-8" onClick={onEditMeta}><Pencil size={14} aria-hidden /> Edit Metadata{metaEdited ? ' ✓' : ''}</GuardedButton>}>
      {r.status === 'revision' && r.decisionNote && <p role="note" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><span className="font-medium">Editor’s note:</span> {r.decisionNote}</p>}
      <p className="mb-4 text-sm text-muted">The published article (version {r.baseVersion}) stays live until version {n} is approved. Check the proposed values and adjust them if needed, then send it back to the Editor for approval.</p>
      <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
        {r.targets.map((t) => (
          <FormField key={t.key} label={t.label} required error={touched && !(values[t.key] ?? '').trim() ? 'This value is required.' : undefined} hint={t.oldValue ? `As published: ${t.oldValue}` : undefined}>
            {(a) => t.apply.kind === 'file' ? (
              <div className="flex items-center gap-2">
                <input {...a} className="input" value={values[t.key]} readOnly />
                <input ref={file} type="file" accept=".pdf,.docx" className="sr-only" tabIndex={-1} aria-label="Choose replacement file" onChange={(e) => { const f = e.target.files?.[0]; if (f) setValues((v) => ({ ...v, [t.key]: f.name })) }} />
                <button type="button" className="btn-secondary shrink-0" onClick={() => file.current?.click()}><FileUp size={15} aria-hidden /> Choose</button>
              </div>
            ) : t.multiline ? (
              <textarea {...a} rows={4} className="input !h-auto py-2" value={values[t.key]} onChange={(e) => setValues((v) => ({ ...v, [t.key]: e.target.value }))} />
            ) : (
              <input {...a} className="input" value={values[t.key]} onChange={(e) => setValues((v) => ({ ...v, [t.key]: e.target.value }))} />
            )}
          </FormField>
        ))}
        <FormField label="Summary of changes" required error={touched && summary.trim().length < 5 ? 'Describe what changed (at least 5 characters).' : touched && unchanged && !metaEdited ? 'The new version is identical to the published one.' : undefined}>
          {(a) => <input {...a} className="input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Corrected the first author’s name" />}
        </FormField>
      </fieldset>
      <div className="mt-4 flex justify-end">
        <GuardedButton allowed={canEdit} why={why} className="btn-primary" disabled={busy} onClick={submit}><Send size={15} aria-hidden /> Send back to Editor (version {n})</GuardedButton>
      </div>
    </SectionCard>
  )
}

function ResultPanel({ r, detail }: { r: ChangeRequest; detail: ChangeDetail }) {
  const res = r.result!
  const { paper, record } = detail
  const dep = useDataStore((s) => s.deposits.find((d) => d.paperId === paper.id))
  const changed = res.certificates.map((c, i) => ({ ...c, cert: record.certificates[i] })).filter((c) => c.changed && c.cert)
  return (
    <SectionCard title="Result">
      <div role="status" className="mb-4 flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm font-medium text-green-900"><CheckCircle2 size={18} aria-hidden /> Completed {formatDate(res.at)} by {res.by}. The paper is now {res.paperStatus}.</div>
      <ul className="space-y-3 text-sm">
        <li className="flex gap-3"><FileCheck2 size={18} className="mt-0.5 shrink-0 text-green-600" aria-hidden /><span><span className="font-medium">Crossref re-deposit</span> · <span className="font-mono text-xs">{res.doi}</span> · deposit v{dep?.version ?? res.depositVersion} ({dep?.status === 're_deposited' ? 're-deposited' : dep?.status ?? 're-deposited'}). <Link to="/doi" className="text-accent hover:underline">View deposits</Link></span></li>
        <li className="flex gap-3"><Award size={18} className="mt-0.5 shrink-0 text-green-600" aria-hidden /><span><span className="font-medium">Certificates</span> · {changed.length ? `regenerated for ${changed.map((c) => c.authorName).join(', ')}.` : res.certificates.length ? 'no certificate needed to change.' : 'not applicable to this change.'}</span></li>
        <li className="flex gap-3"><Mail size={18} className="mt-0.5 shrink-0 text-green-600" aria-hidden /><span><span className="font-medium">Authors notified</span> · {res.notified.join(', ')}</span></li>
      </ul>
      {changed.length > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {changed.map((c) => (
            <figure key={c.cert.authorEmail}>
              <figcaption className="mb-1 text-xs font-medium text-muted">Updated certificate · version {c.cert.version}</figcaption>
              <CertificatePreview authorName={c.cert.name} paperTitle={record.title} paperId={paper.id} journal={paper.journal} date={c.cert.date} doi={doiFor(paper.id)} />
            </figure>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
