import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, CheckCircle2, Globe2, Mail, Send, Undo2, XCircle, FileCheck2, Library } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { ConfirmDialog } from '@/components/Dialog'
import { ReasonDialog } from '@/components/ReasonDialog'
import { ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { CertificatePreview } from '@/components/CertificatePreview'
import { DescriptionList } from '@/components/Form'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { useCan, usePermission } from '@/permissions/hooks'
import { useDataStore } from '@/mock/store'
import { formatDate } from '@/shared/formatters'
import { doiFor } from '@/shared/paperId'
import { getApprovalDetail, nextPages, publishPaper, returnToProduction, type ApprovalDetail } from '@/mock/api/production'
import type { ProductionRecord } from '@/mock/data/production'
import { ArticlePagePreview } from './ArticlePagePreview'
import { IssueVsOnline } from './shared'

const ISSUE_STATUS_LABEL = { draft: 'Draft', open: 'Open for submissions', in_production: 'In production', published: 'Published' } as const

export function FinalApprovalDetailPage() {
  const { paperId = '' } = useParams()
  const status = useDataStore((s) => s.papers.find((p) => p.id === paperId)?.status)
  const q = useAsync(() => getApprovalDetail(paperId), [paperId, status])
  const [published, setPublished] = useState<ProductionRecord | null>(null)
  const crumbs = [{ label: paperId }]
  if (q.error) return (<><PageHeader title="Final approval" crumbs={crumbs} /><div className="card"><ErrorState message={q.error.message} onRetry={q.reload} /></div></>)
  if (q.loading && !published) return (<><PageHeader title="Final approval" crumbs={crumbs} /><div className="grid gap-4 lg:grid-cols-[1fr_360px]"><Skeleton className="h-[560px]" /><Skeleton className="h-[560px]" /></div></>)
  const d = q.data
  if (!d) return null
  const result = published ?? (d.record.publication ? d.record : null)
  if (result && (published || d.paper.status === 'published')) return <PublishedResult detail={d} record={result} />
  if (d.paper.status !== 'ready_for_approval') {
    return (
      <>
        <PageHeader title={d.paper.id} description={d.paper.title} crumbs={crumbs} />
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <StatusBadge status={d.paper.status} />
          <p className="text-sm text-muted">This paper is not waiting for final approval.</p>
          <Link to="/final-approval" className="btn-secondary"><ArrowLeft size={14} aria-hidden /> Back to final approval</Link>
        </div>
      </>
    )
  }
  return <Review detail={d} onPublished={setPublished} />
}

function Review({ detail, onPublished }: { detail: ApprovalDetail; onPublished: (r: ProductionRecord) => void }) {
  const { paper, record, issues, backdated } = detail
  const navigate = useNavigate()
  const perm = usePermission('finalApproval')
  const canIssues = useCan('issues', 'view')
  const allowed = perm.can('approve')
  const issueOptions = useMemo(() => [...issues].sort((a, b) => (a.status === b.status ? a.publicationDate.localeCompare(b.publicationDate) : a.status === 'in_production' ? -1 : 1)), [issues])
  const [issueId, setIssueId] = useState('')
  const issue = issueOptions.find((i) => i.id === issueId) ?? issueOptions[0]
  const [confirm, setConfirm] = useState(false)
  const [returning, setReturning] = useState(false)
  const [busy, setBusy] = useState(false)

  const checks = useMemo(() => {
    const miss = detail.readiness.missing
    const has = (s: string) => miss.some((m) => m.startsWith(s))
    return [
      { label: 'Title, authors and affiliations', pass: !['Title', 'Authors', 'Affiliations'].some(has) },
      { label: 'Abstract and keywords', pass: !['Abstract', 'Keywords'].some(has) },
      { label: 'References', pass: !has('References') },
      { label: 'SEO title, description and slug', pass: !['SEO', 'Slug'].some(has) },
      { label: record.finalFile ? `Final file ${record.finalFile.name} (v${record.finalFile.version})` : 'Final paper file', pass: !has('Final paper') },
      { label: 'Author certificates generated', pass: !has('Certificates') },
      { label: `DOI reserved: ${doiFor(paper.id)}`, pass: true },
    ]
  }, [detail.readiness.missing, record.finalFile, paper.id])
  const ready = detail.readiness.ready && !!issue
  const why = !allowed ? perm.why('approve') : !detail.readiness.ready ? `Cannot publish: ${detail.readiness.missing[0]}` : !issue ? `No open or in-production issue exists for ${paper.journal}. Create one first.` : undefined

  const publish = async () => {
    if (!issue) return
    setBusy(true)
    try { const r = await publishPaper(paper.id, issue.id); onPublished(r); toast.success('Article published.') } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const sendBack = async (note: string) => {
    try { await returnToProduction(paper.id, note); toast.success('Returned to production with your note.'); navigate('/final-approval') } catch (e) { toast.error((e as Error).message) }
  }

  const pages = issue ? nextPages(issue, paper.id) : undefined
  const consequences = issue ? [
    `Make the article page live at ${record.seo.slug ? `/articles/${record.seo.slug}` : 'its URL'} immediately.`,
    `Deposit DOI ${doiFor(paper.id)} to Crossref.`,
    `Send certificates of publication to ${record.authors.length} author(s) by email.`,
    `Add the paper to ${issue.label} at pages ${pages}.`,
    `The article shows the assigned issue publication date, ${formatDate(issue.publicationDate)}, not today’s date.`,
    'This cannot be undone. Later changes need a post-publication change request.',
  ] : []

  return (
    <>
      <PageHeader title={paper.id} description={paper.title} crumbs={[{ label: paper.id }]}
        actions={<>
          <GuardedButton allowed={allowed} why={perm.why('approve')} className="btn-secondary" onClick={() => setReturning(true)}><Undo2 size={15} aria-hidden /> Return to Associate Editor</GuardedButton>
          <GuardedButton allowed={allowed && ready} why={why} className="btn-primary" disabled={busy} onClick={() => setConfirm(true)}><Send size={15} aria-hidden /> Publish</GuardedButton>
        </>} />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <JournalBadge code={paper.journal} /><StatusBadge status={paper.status} />
        {backdated && <Badge tone="warning">Backdated publication</Badge>}
        <Link to={`/production/${paper.id}`} className="text-accent hover:underline">Open production workspace</Link>
        <Link to={`/submissions/${paper.id}`} className="text-accent hover:underline">Submission record</Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-3">
          <h2 className="text-[16px] font-semibold">Article page preview</h2>
          <ArticlePagePreview record={record} journal={paper.journal} paperId={paper.id} articleType={paper.articleType} issueLabel={issue?.label} pages={pages} publishedOn={issue?.publicationDate} />
        </div>
        <div className="space-y-5">
          <SectionCard title="Approval checklist">
            <ul className="space-y-2.5">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm">
                  {c.pass ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-green-600" aria-label="Pass" /> : <XCircle size={17} className="mt-0.5 shrink-0 text-red-600" aria-label="Fail" />}
                  <span className={cn(!c.pass && 'text-red-700')}>{c.label}</span>
                </li>
              ))}
            </ul>
            {!detail.readiness.ready && <ul className="mt-3 list-disc space-y-1 border-t border-line pl-5 pt-3 text-xs text-red-700">{detail.readiness.missing.map((m) => <li key={m}>{m}</li>)}</ul>}
          </SectionCard>

          <SectionCard title="Publish into issue">
            {issueOptions.length === 0 ? (
              <p className="text-sm text-muted">There is no open or in-production issue for {paper.journal}. {canIssues ? <>Create one under <Link to="/issues" className="text-accent hover:underline">Volumes & issues</Link>.</> : 'Ask a Super Admin to create one.'}</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label htmlFor="issue-select" className="label">Issue</label>
                  <select id="issue-select" className="input" value={issue?.id ?? ''} disabled={!!backdated || !allowed} onChange={(e) => setIssueId(e.target.value)}>
                    {issueOptions.map((i) => <option key={i.id} value={i.id}>{i.label} · {ISSUE_STATUS_LABEL[i.status]}</option>)}
                  </select>
                  {backdated && <p className="mt-1 text-xs text-muted">Locked to the past issue chosen in Backdated publication.</p>}
                </div>
                {issue && (
                  <>
                    <DescriptionList cols={1} items={[
                      { label: 'Submission deadline', value: formatDate(issue.submissionDeadline) },
                      { label: 'Planned publication date', value: formatDate(issue.publicationDate) },
                      { label: 'Articles already in issue', value: issue.articleIds.length },
                      { label: 'Pages assigned to this article', value: pages },
                    ]} />
                    <IssueVsOnline issueDate={issue.publicationDate} />
                  </>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Authors & certificates">
            <ul className="space-y-1.5 text-sm">{record.authors.map((a) => <li key={a.email} className="flex justify-between gap-2"><span>{a.name}</span><span className="truncate text-muted">{a.email}</span></li>)}</ul>
            {record.certificates[0] && (
              <div className="pointer-events-none mt-3"><CertificatePreview authorName={record.certificates[0].name} paperTitle={record.title} paperId={paper.id} journal={paper.journal} date={record.certificates[0].date} doi={doiFor(paper.id)} /></div>
            )}
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={publish} title={`Publish ${paper.id}?`} confirmLabel="Publish now" consequences={consequences} />
      <ReasonDialog open={returning} onClose={() => setReturning(false)} onSubmit={sendBack} title="Return to Associate Editor" label="Note to the Associate Editor (required)" confirmLabel="Return to Associate Editor" danger
        description="The Associate Editor sees this note at the top of the workspace and must address it before resending."
        consequences={['The paper moves back to “Returned to production”.', 'The note is stored on the paper timeline and audit log.']} />
    </>
  )
}

function PublishedResult({ detail, record }: { detail: ApprovalDetail; record: ProductionRecord }) {
  const canIssues = useCan('issues', 'view')
  const { paper } = detail
  const pub = record.publication!
  const dep = useDataStore((s) => s.deposits.find((d) => d.paperId === paper.id))
  const issue = useDataStore((s) => s.issues.find((i) => i.id === pub.issueId))
  const cert = record.certificates[0]
  const rows = [
    { icon: Globe2, title: 'Article page is live', body: <span className="break-all font-mono text-xs">{pub.url}</span> },
    { icon: Library, title: `Added to ${pub.issueLabel}`, body: <>Pages {pub.pages}.{canIssues && <> <Link to="/issues" className="text-accent hover:underline">Open Volumes & issues</Link></>}</> },
    { icon: FileCheck2, title: 'DOI deposited to Crossref', body: <><span className="font-mono text-xs">{pub.doi}</span> · deposit v{dep?.version ?? pub.depositVersion} ({dep?.status ?? 'success'}). <Link to="/doi" className="text-accent hover:underline">View deposits</Link></> },
    { icon: Mail, title: `Certificates sent to ${pub.certificatesSent.length} recipient(s)`, body: pub.certificatesSent.join(', ') },
  ]
  return (
    <>
      <PageHeader title={paper.id} description={paper.title} crumbs={[{ label: paper.id }]}
        actions={<><Link to="/final-approval" className="btn-secondary"><ArrowLeft size={14} aria-hidden /> Back to final approval</Link><Link to="/post-publication/new" className="btn-secondary">Request a change</Link></>} />
      <div role="status" className="mb-5 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
        <BadgeCheck size={22} className="mt-0.5 shrink-0 text-green-600" aria-hidden />
        <div>
          <p className="text-base font-semibold text-green-900">Published successfully</p>
          <p className="text-sm text-green-800">{pub.by} published this article{issue ? ` with the issue publication date ${formatDate(issue.publicationDate)}` : ''}. Here is what happened.</p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <SectionCard title="Summary" flush>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.title} className="flex gap-3 px-4 py-3"><r.icon size={18} className="mt-0.5 shrink-0 text-green-600" aria-hidden /><div className="min-w-0"><p className="text-sm font-medium">{r.title}</p><p className="mt-0.5 text-sm text-muted">{r.body}</p></div></li>
            ))}
          </ul>
          {issue && <div className="border-t border-line p-4"><IssueVsOnline issueDate={issue.publicationDate} /></div>}
        </SectionCard>
        {cert && <SectionCard title="Certificate sent to authors"><CertificatePreview authorName={cert.name} paperTitle={record.title} paperId={paper.id} journal={paper.journal} date={cert.date} doi={pub.doi} /></SectionCard>}
      </div>
    </>
  )
}
