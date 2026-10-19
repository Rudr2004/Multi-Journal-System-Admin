import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CalendarClock, ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { JournalBadge, StatusBadge } from '@/components/Badges'
import { ErrorState, Skeleton } from '@/components/States'
import { Tabs, type TabDef } from '@/components/Tabs'
import { useAsync } from '@/lib/useAsync'
import { formatDate, formatDateTime, formatTime } from '@/shared/formatters'
import { doiFor } from '@/shared/paperId'
import { STATUS_META } from '@/shared/statuses'
import { getPaperDetail } from '@/mock/api/papers'
import { useDataStore } from '@/mock/store'
import { useEditorialStore } from '@/mock/stores/editorial'
import { PaperActions } from './PaperActions'
import { CommunicationTab, OverviewTab, PaymentsTab, ProductionTab, ReviewTab, TimelineTab } from './PaperTabs'
import { CopyButton, useAccess } from './shared'

const TAB_IDS = ['overview', 'review', 'payments', 'production', 'communication', 'timeline']
/** Older links: Files now lives in Overview and Decision history in Review. */
const LEGACY_TABS: Record<string, string> = { files: 'overview', decisions: 'review' }

export function PaperDetailPage() {
  const { paperId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const ctx = useAccess('submissions')
  const paper = useDataStore((s) => s.papers.find((p) => p.id === paperId))
  const users = useDataStore((s) => s.users)
  const reviews = useEditorialStore((s) => s.reviews)
  const decisions = useEditorialStore((s) => s.decisions)
  const messages = useDataStore((s) => s.messages)
  const payments = useDataStore((s) => s.payments)
  const detail = useAsync(() => getPaperDetail(paperId, ctx), [paperId, ctx])

  if (detail.error || (!detail.loading && !paper)) {
    return (
      <>
        <PageHeader title="Paper details" crumbs={[{ label: paperId }]} />
        <div className="card">
          <ErrorState message={detail.error?.message ?? `Paper ${paperId} was not found.`} onRetry={detail.error ? detail.reload : undefined} />
          <div className="pb-6 text-center"><Link to="/submissions" className="btn-secondary"><ChevronLeft size={14} aria-hidden /> Back to submissions</Link></div>
        </div>
      </>
    )
  }
  if (!paper || !detail.data) {
    return (
      <>
        <PageHeader title="Paper details" crumbs={[{ label: paperId }]} />
        <div className="space-y-4" aria-busy="true" aria-label="Loading paper">
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]"><Skeleton className="h-96" /><Skeleton className="h-64" /></div>
        </div>
      </>
    )
  }

  const d = detail.data
  const assignee = users.find((u) => u.id === paper.assigneeId)
  const hasDoi = STATUS_META[paper.status].order >= STATUS_META.accepted.order && !['rejected', 'withdrawn'].includes(paper.status)
  const published = ['published', 'indexed', 'corrected', 'retracted'].includes(paper.status)
  const msgCount = messages.filter((m) => m.paperId === paper.id).length
  const payCount = payments.filter((p) => p.paperId === paper.id).length

  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview', content: <OverviewTab paper={paper} detail={d} /> },
    { id: 'review', label: 'Review', badge: reviews.filter((r) => r.paperId === paper.id).length + decisions.filter((x) => x.paperId === paper.id).length || undefined, content: <ReviewTab paper={paper} /> },
    { id: 'payments', label: 'Payments', badge: payCount || undefined, content: <PaymentsTab paper={paper} /> },
    { id: 'production', label: 'Production', content: <ProductionTab paper={paper} /> },
    { id: 'communication', label: 'Communication', badge: msgCount || undefined, content: <CommunicationTab paper={paper} /> },
    { id: 'timeline', label: 'Timeline & audit', content: <TimelineTab paper={paper} /> },
  ]
  const requested = LEGACY_TABS[params.get('tab') ?? ''] ?? params.get('tab') ?? 'overview'
  const tab = TAB_IDS.includes(requested) ? requested : 'overview'

  return (
    <>
      <PageHeader title="Paper details" crumbs={[{ label: paper.id }]}
        actions={<Link to="/submissions" className="btn-secondary"><ChevronLeft size={14} aria-hidden /> All submissions</Link>} />

      {paper.status === 'accepted' && paper.dispatchAt && (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-4 rounded-lg border border-indigo-200 bg-accent-soft px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white"><CalendarClock size={20} strokeWidth={1.5} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-accent">Queued for {formatTime(paper.dispatchAt)} dispatch · {formatDate(paper.dispatchAt)}</p>
            <p className="text-sm text-muted">The acceptance email to {paper.authorEmail} goes out in the next batch. It can be reviewed in the <Link to="/dispatch" className="font-medium text-accent hover:underline">dispatch queue</Link>.</p>
          </div>
        </div>
      )}

      <section aria-label="Paper summary" className="card mb-6 p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="whitespace-nowrap text-base font-semibold">{paper.id}</span>
          <CopyButton value={paper.id} label="Paper ID" />
          <JournalBadge code={paper.journal} />
          <StatusBadge status={paper.status} />
        </div>
        <h2 className="mt-2 max-w-4xl text-lg font-semibold leading-7">{paper.title}</h2>
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><dt className="inline text-muted">Author </dt><dd className="inline font-medium">{paper.author}</dd></div>
          <div><dt className="inline text-muted">Assignee </dt><dd className="inline font-medium">{assignee?.name ?? 'Unassigned'}</dd></div>
          <div><dt className="inline text-muted">Submitted </dt><dd className="inline font-medium">{formatDateTime(paper.submittedAt)}</dd></div>
          {hasDoi && (
            <div className="flex items-center gap-1">
              <dt className="text-muted">DOI </dt>
              <dd className="font-medium">{doiFor(paper.id)}{!published && <span className="ml-1.5 text-xs font-normal text-muted">(registered on publication)</span>}</dd>
              <CopyButton value={doiFor(paper.id)} label="DOI" />
            </div>
          )}
        </dl>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Tabs tabs={tabs} value={tab} onChange={(id) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n }, { replace: true })} />
        <PaperActions paper={paper} />
      </div>
    </>
  )
}
