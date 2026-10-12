import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, CheckCircle2, FileCheck2, FileUp, Mail, Award, Send, ThumbsDown, ThumbsUp } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { CertificatePreview } from '@/components/CertificatePreview'
import { ConfirmDialog } from '@/components/Dialog'
import { DescriptionList, FormField } from '@/components/Form'
import { ReasonDialog } from '@/components/ReasonDialog'
import { ErrorState, Skeleton } from '@/components/States'
import { Timeline } from '@/components/Timeline'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { useCan, useCanAct, usePermission } from '@/permissions/hooks'
import { useDataStore } from '@/mock/store'
import { useProductionStore } from '@/mock/stores/production'
import { decideChangeRequest, getChangeRequest, reviewNewVersion, submitNewVersion, type ChangeDetail } from '@/mock/api/postPublication'
import { CHANGE_TYPE_META, type ChangeRequest } from '@/mock/data/production'
import { formatDate, formatDateTime } from '@/shared/formatters'
import { doiFor } from '@/shared/paperId'
import { ChangeStatusBadge, ChangeTypeBadge } from './postPubShared'

export function PostPubDetailPage() {
  const { id = '' } = useParams()
  const rev = useProductionStore((s) => s.changeRequests.find((r) => r.id === id))
  const key = rev ? `${rev.status}:${rev.versions.length}:${rev.events.length}` : ''
  const q = useAsync(() => getChangeRequest(id), [id, key])
  const crumbs = [{ label: id }]
  if (q.error) return (<><PageHeader title="Change request" crumbs={crumbs} /><div className="card"><ErrorState message={q.error.message} onRetry={q.reload} /></div></>)
  if (!q.data) return (<><PageHeader title="Change request" crumbs={crumbs} /><div className="grid gap-4 lg:grid-cols-[1fr_340px]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div></>)
  return <Detail detail={{ ...q.data, request: rev ?? q.data.request }} />
}

const stepsFor = (r: ChangeRequest) => (CHANGE_TYPE_META[r.type].editsArticle
  ? ['Requested', 'Approved', 'New version', 'Version approved', 'Published']
  : ['Requested', 'Approved & applied'])
const stepIndex = (r: ChangeRequest) => {
  const edits = CHANGE_TYPE_META[r.type].editsArticle
  switch (r.status) {
    case 'requested': case 'rejected': return 0
    case 'approved': return 1
    case 'revision': return 2
    case 'version_review': return 3
    case 'completed': return edits ? 5 : 2
  }
}

function Detail({ detail }: { detail: ChangeDetail }) {
  const { request: r, paper } = detail
  const perm = usePermission('postPub')
  const canApprove = useCan('postPub', 'approve')
  const canEdit = useCanAct('postPub', 'work', r.assigneeId)
  const users = useDataStore((s) => s.users)
  const meta = CHANGE_TYPE_META[r.type]
  const steps = stepsFor(r)
  const current = stepIndex(r)
  const [reject, setReject] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [confirmVersion, setConfirmVersion] = useState(false)
  const [changes, setChanges] = useState(false)
  const [busy, setBusy] = useState(false)
  const latest = r.versions[r.versions.length - 1]

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok) } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const approveLabel = r.type === 'retraction' ? 'Approve retraction' : r.type === 'withdrawal' ? 'Approve withdrawal' : 'Approve request'

  return (
    <>
      <PageHeader title={r.id} description={`${meta.label} · ${paper.title}`} crumbs={[{ label: r.id }]}
        actions={<Link to="/post-publication" className="btn-secondary"><ArrowLeft size={14} aria-hidden /> All requests</Link>} />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <JournalBadge code={r.journal} /><ChangeTypeBadge type={r.type} /><ChangeStatusBadge status={r.status} />
        <span className="text-muted">Paper <span className="whitespace-nowrap text-ink">{paper.id}</span></span><StatusBadge status={paper.status} />
        <Link to={`/submissions/${paper.id}`} className="text-accent hover:underline">Submission record</Link>
      </div>

      <ol aria-label="Progress" className="mb-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <li key={s} aria-current={i === current ? 'step' : undefined}>
            <div className={cn('h-1 rounded-full', r.status === 'rejected' ? 'bg-red-300' : i <= current ? 'bg-accent' : 'bg-slate-200')} />
            <p className={cn('mt-1.5 flex items-center gap-1 text-xs', i === current ? 'font-semibold text-ink' : 'text-muted')}>{i < current && <Check size={12} className="text-accent" aria-hidden />}{s}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          <SectionCard title="Request">
            <DescriptionList items={[
              { label: 'Raised by', value: `${r.requestedBy} · ${formatDateTime(r.requestedAt)}` },
              { label: 'Current article version', value: `Version ${r.baseVersion}` },
              { label: 'Assigned to (edits new version)', value: users.find((u) => u.id === r.assigneeId)?.name ?? 'Assigned when approved' },
              { label: 'DOI', value: <span className="font-mono text-xs">{doiFor(paper.id)}</span> },
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
          </SectionCard>

          {r.status === 'requested' && (
            <SectionCard title="Decision">
              <p className="mb-3 text-sm text-muted">{canApprove ? (meta.editsArticle ? 'Approving lets the Associate Editor prepare a new version of the article, which you then approve.' : 'Approving applies this change to the live record immediately.') : 'Only an Editor can approve or reject this request.'}</p>
              <div className="flex flex-wrap gap-2">
                <GuardedButton allowed={canApprove} why={perm.why('approve')} className={meta.editsArticle ? 'btn-primary' : 'btn-danger'} disabled={busy} onClick={() => (meta.editsArticle ? act(() => decideChangeRequest(r.id, 'approve'), 'Request approved.') : setConfirmApprove(true))}><ThumbsUp size={15} aria-hidden /> {approveLabel}</GuardedButton>
                <GuardedButton allowed={canApprove} why={perm.why('approve')} className="btn-secondary" disabled={busy} onClick={() => setReject(true)}><ThumbsDown size={15} aria-hidden /> Reject</GuardedButton>
              </div>
            </SectionCard>
          )}

          {(r.status === 'approved' || r.status === 'revision') && (
            <NewVersionForm key={`${r.id}-${r.versions.length}-${r.events.length}`} request={r} canEdit={canEdit} why={perm.why('work') ?? 'This request is assigned to another Associate Editor.'} busy={busy}
              onSubmit={(values, summary) => act(() => submitNewVersion(r.id, values, summary), `Version ${r.baseVersion + 1} submitted for approval.`)} />
          )}

          {r.status === 'version_review' && latest && (
            <SectionCard title={`Review version ${latest.n}`}>
              <p className="mb-3 text-sm text-muted">{latest.summary} · prepared by {latest.by}</p>
              <DiffTable version={latest} />
              <div className="mt-4 flex flex-wrap gap-2">
                <GuardedButton allowed={canApprove} why={perm.why('approve')} className="btn-primary" disabled={busy} onClick={() => setConfirmVersion(true)}><ThumbsUp size={15} aria-hidden /> Approve version {latest.n}</GuardedButton>
                <GuardedButton allowed={canApprove} why={perm.why('approve')} className="btn-secondary" disabled={busy} onClick={() => setChanges(true)}>Request changes</GuardedButton>
              </div>
            </SectionCard>
          )}

          {r.status === 'completed' && r.result && <ResultPanel r={r} detail={detail} />}

          {r.versions.length > 0 && (
            <SectionCard title="Version history">
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

function NewVersionForm({ request: r, canEdit, why, busy, onSubmit }: { request: ChangeRequest; canEdit: boolean; why: string; busy: boolean; onSubmit: (values: Record<string, string>, summary: string) => void }) {
  const prev = r.versions[r.versions.length - 1]
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(r.targets.map((t) => [t.key, prev?.changes.find((c) => c.field === t.label)?.newValue ?? t.newValue])))
  const [summary, setSummary] = useState(prev?.summary ?? '')
  const [touched, setTouched] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const unchanged = useMemo(() => r.targets.every((t) => (values[t.key] ?? '').trim() === t.oldValue), [r.targets, values])
  const blank = r.targets.some((t) => !(values[t.key] ?? '').trim())
  const n = r.baseVersion + 1
  const submit = () => { setTouched(true); if (!unchanged && !blank && summary.trim().length >= 5) onSubmit(values, summary) }
  return (
    <SectionCard title={`Edit new version (v${n})`}>
      {r.status === 'revision' && r.decisionNote && <p role="note" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><span className="font-medium">Editor’s note:</span> {r.decisionNote}</p>}
      <p className="mb-4 text-sm text-muted">The published article (version {r.baseVersion}) stays live until version {n} is approved. Check the proposed values and adjust them if needed.</p>
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
        <FormField label="Summary of changes" required error={touched && summary.trim().length < 5 ? 'Describe what changed (at least 5 characters).' : touched && unchanged ? 'The new version is identical to the published one.' : undefined}>
          {(a) => <input {...a} className="input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Corrected the first author’s name" />}
        </FormField>
      </fieldset>
      <div className="mt-4 flex justify-end">
        <GuardedButton allowed={canEdit} why={why} className="btn-primary" disabled={busy} onClick={submit}><Send size={15} aria-hidden /> Submit version {n} for approval</GuardedButton>
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
