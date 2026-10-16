import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Award, Ban, CheckCircle2, ChevronDown, Download, ExternalLink, FileCheck2, FileText, Globe2, ListChecks, Search, Send, Undo2, XCircle } from 'lucide-react'
import type { Paper } from '@/shared/types'
import { formatDate } from '@/shared/formatters'
import { doiFor } from '@/shared/paperId'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'
import { usePermission } from '@/permissions/hooks'
import { SectionCard } from '@/components/Card'
import { CertificatePreview } from '@/components/CertificatePreview'
import { ConfirmDialog } from '@/components/Dialog'
import { ReasonDialog } from '@/components/ReasonDialog'
import { Skeleton, ErrorState } from '@/components/States'
import { toast } from '@/components/Toasts'
import { GuardedButton } from '@/components/Tooltip'
import { DocPreview } from '@/components/Viewers'
import { decidePaper } from '@/mock/api/papers'
import { articleUrl, getApprovalDetail, nextPages, publishPaper, returnToProduction } from '@/mock/api/production'
import { RetractDialog } from './RetractDialog'
import { decisionEmail } from '@/mock/data/editorial'
import { nextDispatch } from '@/mock/data/papers'
import { ArticlePagePreview } from '@/pages/production/ArticlePagePreview'

const ISSUE_STATUS_LABEL = { draft: 'Draft', open: 'Open for submissions', in_production: 'In production', published: 'Published' } as const

/** A verification block the Editor opens, reads and ticks off before deciding. */
function Verify({ icon: Icon, title, hint, checked, onChange, children, disabled }: {
  icon: typeof FileText; title: string; hint: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className={cn('rounded-lg border', checked ? 'border-green-300 bg-green-50/40' : 'border-line')} aria-label={title}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span aria-hidden className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', checked ? 'bg-green-100 text-green-700' : 'bg-accent-soft text-accent')}><Icon size={18} strokeWidth={1.5} /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="text-xs text-muted">{hint}</p></div>
        <button type="button" className="btn-secondary !h-8" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Open'} <ChevronDown size={14} aria-hidden className={cn('transition-transform', open && 'rotate-180')} /></button>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-4 w-4 accent-green-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> Verified
        </label>
      </div>
      {open && <div className="border-t border-line p-4">{children}</div>}
    </section>
  )
}

/**
 * The Editor's production decision: check the draft article page, the final paper and the certificates, then
 * Approve (publish), Reject, or Return to Production with a note saying what has to change.
 */
export function ProductionReview({ paper }: { paper: Paper }) {
  const perm = usePermission('finalApproval')
  const allowed = perm.can('approve')
  const q = useAsync(() => getApprovalDetail(paper.id), [paper.id, paper.status])
  const [v, setV] = useState({ page: false, file: false, certs: false, doi: false, seo: false, reqs: false })
  const [retracting, setRetracting] = useState(false)
  const [issueId, setIssueId] = useState('')
  const [note, setNote] = useState('')
  const [noteTouched, setNoteTouched] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const d = q.data
  const issues = useMemo(() => [...(d?.issues ?? [])].sort((a, b) => (a.status === b.status ? a.publicationDate.localeCompare(b.publicationDate) : a.status === 'in_production' ? -1 : 1)), [d?.issues])
  const issue = issues.find((i) => i.id === issueId) ?? issues[0]

  if (!allowed) return null
  if (q.error) return <div className="card"><ErrorState message={q.error.message} onRetry={q.reload} /></div>
  if (!d) return <Skeleton className="h-64 w-full" />
  const { record, readiness, backdated } = d
  const allVerified = v.page && v.file && v.certs && v.doi && v.seo && v.reqs
  const liveUrl = articleUrl(paper.journal, record.seo.slug || '…')
  const doi = doiFor(paper.id)
  const pages = issue ? nextPages(issue, paper.id) : undefined
  const noteOk = note.trim().length >= 10
  const approveWhy = !readiness.ready ? `Cannot approve: ${readiness.missing[0]}` : !issue ? `No open or in-production issue exists for ${paper.journal}.` : !allVerified ? 'Verify every item above first: article page, final paper, certificates, DOI, SEO metadata and publication requirements.' : undefined

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok) } catch (e) { toast.error(e instanceof Error ? e.message : 'The action could not be completed.') } finally { setBusy(false) }
  }
  const sendBack = () => {
    setNoteTouched(true)
    if (!noteOk) return
    void run(async () => { await returnToProduction(paper.id, note.trim()); setNote('') }, 'Returned to the Associate Editor with your note.')
  }
  const consequences = issue ? [
    `Make the article page live at ${record.seo.slug ? `/articles/${record.seo.slug}` : 'its URL'} immediately.`,
    `Deposit DOI ${doiFor(paper.id)} to Crossref.`,
    `Send certificates of publication to ${record.authors.length} author(s) by email.`,
    `Add the paper to ${issue.label} at pages ${pages}.`,
    `The article shows the assigned issue publication date, ${formatDate(issue.publicationDate)}, not today’s date.`,
    'This cannot be undone. Later changes need a post-publication correction request.',
  ] : []
  const rejectMail = (reason: string) => decisionEmail('rejected', paper, reason, nextDispatch().toISOString())

  return (
    <div className="space-y-5">
      <SectionCard title="Production decision">
        <p className="text-sm text-muted">The Associate Editor has sent this paper for your approval. Open and verify the six items below, including the links, then <strong>Approve</strong> to publish, <strong>Reject</strong>, or <strong>Return to Associate Editor</strong> with a note saying what must change.</p>
        {!readiness.ready && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <div><p className="font-medium">Production is not complete</p><ul className="list-disc pl-5 text-xs">{readiness.missing.map((m) => <li key={m}>{m}</li>)}</ul></div>
          </div>
        )}
        <div className="mt-4 space-y-3">
          <Verify icon={Globe2} title="Draft article page" hint="How the article will look on the journal website." checked={v.page} onChange={(x) => setV((s) => ({ ...s, page: x }))}>
            <div className="max-h-[560px] overflow-auto rounded-lg">
              <ArticlePagePreview record={record} journal={paper.journal} paperId={paper.id} articleType={paper.articleType} issueLabel={issue?.label} pages={pages} publishedOn={issue?.publicationDate} />
            </div>
          </Verify>
          <Verify icon={FileText} title="Published article (final paper)" hint={record.finalFile ? `${record.finalFile.name} · version ${record.finalFile.version}` : 'No final paper has been uploaded.'} checked={v.file} onChange={(x) => setV((s) => ({ ...s, file: x }))} disabled={!record.finalFile}>
            {record.finalFile ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="rounded-lg bg-slate-100 p-4"><DocPreview title={record.title} lines={14} className="mx-auto max-w-md" /></div>
                <button type="button" className="btn-secondary" onClick={() => toast.success(`${record.finalFile?.name} downloaded`)}><Download size={14} aria-hidden /> Download PDF</button>
              </div>
            ) : <p className="text-sm text-muted">Return it to production so the Associate Editor can upload the final file.</p>}
          </Verify>
          <Verify icon={Award} title={`Author certificates (${record.certificates.length})`} hint="Names, dates and the QR link on each certificate." checked={v.certs} onChange={(x) => setV((s) => ({ ...s, certs: x }))} disabled={record.certificates.length === 0}>
            {record.certificates.length === 0 ? <p className="text-sm text-muted">No certificates have been generated yet.</p> : (
              <div className="grid gap-4 md:grid-cols-2">
                {record.certificates.map((c) => (
                  <figure key={c.authorEmail}>
                    <CertificatePreview authorName={c.name} paperTitle={record.title} paperId={paper.id} journal={paper.journal} date={c.date} doi={doiFor(paper.id)} />
                    <figcaption className="mt-1 text-xs text-muted">{c.name} · {c.authorEmail}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </Verify>
          <Verify icon={FileCheck2} title="DOI" hint={`${doi} · Crossref deposit is queued on publication.`} checked={v.doi} onChange={(x) => setV((s) => ({ ...s, doi: x }))}>
            <ul className="space-y-2 text-sm">
              <li>DOI: <a href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline">{doi} <ExternalLink size={12} aria-hidden /><span className="sr-only"> (opens in a new tab)</span></a></li>
              <li className="text-muted">The DOI resolves to the article URL once the article is live and the deposit succeeds.</li>
              <li>Article URL: <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-accent hover:underline">{liveUrl} <ExternalLink size={12} aria-hidden /><span className="sr-only"> (opens in a new tab)</span></a></li>
            </ul>
          </Verify>
          <Verify icon={Search} title="SEO metadata" hint="Title, description and URL slug shown to search engines." checked={v.seo} onChange={(x) => setV((s) => ({ ...s, seo: x }))}>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-muted">SEO title ({record.seo.title.length}/60)</dt><dd className={record.seo.title.length > 60 || !record.seo.title ? 'text-red-700' : ''}>{record.seo.title || 'Missing'}</dd></div>
              <div><dt className="text-xs text-muted">Meta description ({record.seo.description.length}/160)</dt><dd className={record.seo.description.length > 160 || !record.seo.description ? 'text-red-700' : ''}>{record.seo.description || 'Missing'}</dd></div>
              <div><dt className="text-xs text-muted">Article URL slug</dt><dd className="font-mono text-xs">/articles/{record.seo.slug || '—'}</dd></div>
              <div><dt className="text-xs text-muted">Keywords</dt><dd>{record.keywords.filter(Boolean).join(', ') || 'None'}</dd></div>
            </dl>
          </Verify>
          <Verify icon={ListChecks} title="Publication requirements" hint={readiness.ready ? 'Every production requirement is complete.' : `${readiness.missing.length} requirement(s) outstanding.`} checked={v.reqs} onChange={(x) => setV((s) => ({ ...s, reqs: x }))} disabled={!readiness.ready}>
            <ul className="space-y-1.5 text-sm">
              {[
                ['Title, authors and affiliations are complete', record.authors.length > 0 && record.authors.every((a) => a.name.trim() && a.affiliation.trim())],
                ['Abstract and keywords are complete', record.abstract.trim().length > 0 && record.keywords.filter(Boolean).length >= 3],
                ['References are listed', record.references.filter((r) => r.trim()).length >= 5],
                ['Final typeset PDF is uploaded', !!record.finalFile],
                ['A certificate exists for every author', record.certificates.length >= record.authors.length],
                ['SEO title, description and slug are valid', !!record.seo.title && record.seo.title.length <= 60 && !!record.seo.description && record.seo.description.length <= 160 && !!record.seo.slug],
              ].map(([label, ok]) => (
                <li key={String(label)} className="flex items-start gap-2">{ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" aria-label="Pass" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-red-600" aria-label="Fail" />}<span className={ok ? '' : 'text-red-700'}>{String(label)}</span></li>
              ))}
            </ul>
          </Verify>
        </div>
        <p className="mt-3 text-xs text-muted">Need the full workspace? <Link to={`/production/${paper.id}`} className="text-accent hover:underline">Open the production workspace</Link>.</p>
      </SectionCard>

      <SectionCard title="Your decision">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-medium">Approve and publish</p>
            {issues.length === 0 ? (
              <p className="text-sm text-muted">There is no open or in-production issue for {paper.journal}. Create one in Journal &amp; Issue Management first.</p>
            ) : (
              <div>
                <label htmlFor="pr-issue" className="label">Publish into issue</label>
                <select id="pr-issue" className="input" value={issue?.id ?? ''} disabled={!!backdated} onChange={(e) => setIssueId(e.target.value)}>
                  {issues.map((i) => <option key={i.id} value={i.id}>{i.label} · {ISSUE_STATUS_LABEL[i.status]}</option>)}
                </select>
                {backdated && <p className="mt-1 text-xs text-muted">Locked to the past issue chosen in Backdated publication.</p>}
              </div>
            )}
            <GuardedButton allowed={!approveWhy} why={approveWhy} className="btn-primary w-full justify-center" disabled={busy} onClick={() => setConfirm(true)}><Send size={15} aria-hidden /> Approve and publish</GuardedButton>
            <GuardedButton allowed className="btn-danger w-full justify-center" disabled={busy} onClick={() => setRejecting(true)}><XCircle size={15} aria-hidden /> Reject</GuardedButton>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Return to Associate Editor</p>
            <div>
              <label htmlFor="pr-note" className="label">Changes required <span className="text-red-600" aria-hidden>*</span></label>
              <textarea id="pr-note" rows={6} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => setNoteTouched(true)} aria-invalid={noteTouched && !noteOk}
                className="input !h-auto py-2" placeholder="Say exactly what the Associate Editor must fix: formatting, metadata, certificate names, references…" />
              {noteTouched && !noteOk ? <p role="alert" className="mt-1 text-xs text-red-600">Describe the required changes (at least 10 characters).</p> : <p className="mt-1 text-xs text-muted">The Associate Editor sees this note at the top of the workspace and must address it before resending.</p>}
            </div>
            <GuardedButton allowed className="btn-secondary w-full justify-center" disabled={busy} onClick={sendBack}><Undo2 size={15} aria-hidden /> Return to Associate Editor</GuardedButton>
          </div>
        </div>
        {allVerified && <p className="mt-3 flex items-center gap-1.5 text-xs text-green-700"><CheckCircle2 size={14} aria-hidden /> All six items verified.</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-muted">The author asked to withdraw the article?</p>
          <button type="button" className="btn-danger" onClick={() => setRetracting(true)}><Ban size={15} aria-hidden /> Retract article</button>
        </div>
      </SectionCard>

      <RetractDialog open={retracting} paper={paper} onClose={() => setRetracting(false)} />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Publish ${paper.id}?`} confirmLabel="Publish now" consequences={consequences}
        onConfirm={() => { if (issue) void run(() => publishPaper(paper.id, issue.id), 'Article published.') }} />

      <ReasonDialog open={rejecting} onClose={() => setRejecting(false)} danger title="Reject paper" label="Reason for rejection" confirmLabel="Continue"
        description="You will be asked to confirm on the next step."
        emailPreview={{ to: paper.authorEmail, subject: rejectMail('').subject, body: (r) => rejectMail(r).body }}
        onSubmit={(r) => setRejectReason(r)} />
      <ConfirmDialog open={rejectReason !== null} onClose={() => setRejectReason(null)} danger title={`Reject ${paper.id}?`} confirmLabel="Reject paper"
        consequences={['The paper is closed with status Rejected and leaves production.', 'The rejection email, including your reason, is queued for the author.', 'The decision is written to the timeline and audit log and cannot be undone from this screen.']}
        onConfirm={() => { const r = rejectReason ?? ''; setRejectReason(null); void run(() => decidePaper(paper.id, 'reject', r), `${paper.id} rejected. Email queued for the author.`) }} />
    </div>
  )
}
