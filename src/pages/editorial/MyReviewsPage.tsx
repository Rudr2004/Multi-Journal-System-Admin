import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardCheck, History } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { Drawer } from '@/components/Dialog'
import { DueChip } from '@/components/Due'
import { KpiCard } from '@/components/KpiCard'
import { Tabs } from '@/components/Tabs'
import { useIsAllJournals } from '@/lib/scope'
import { useAsync } from '@/lib/useAsync'
import { formatDate } from '@/shared/formatters'
import { listMyReviewHistory, listMyReviews, type MyReviewRow } from '@/mock/api/reviews'
import { averageScore, type ReviewRecord } from '@/mock/data/editorial'
import { NOW } from '@/mock/data/papers'
import { PaperIdLink, RecommendationBadge, TitleText, useAccess } from './shared'
import { ReviewReport } from './ReviewReport'

type HistoryRow = { review: ReviewRecord; title: string }

function myState(r: MyReviewRow) {
  if (r.paper.status === 'under_review') return r.hasDraft ? { label: 'Draft saved', tone: 'info' as const, cta: 'Continue review' } : { label: 'Not started', tone: 'warning' as const, cta: 'Start review' }
  return r.submitted ? { label: 'Submitted', tone: 'success' as const, cta: 'View my report' } : { label: 'Closed', tone: 'neutral' as const, cta: 'Open' }
}

export function MyReviewsPage() {
  const navigate = useNavigate()
  const ctx = useAccess('myReviews')
  const allJournals = useIsAllJournals()
  const mine = useAsync(() => listMyReviews(ctx.userId, ctx.journals), [ctx])
  const hist = useAsync(() => listMyReviewHistory(ctx.userId, ctx.journals), [ctx])
  const [tab, setTab] = useState('assigned')
  const [open, setOpen] = useState<HistoryRow>()

  const rows = useMemo(() => mine.data ?? [], [mine.data])
  const awaiting = rows.filter((r) => r.paper.status === 'under_review')

  const columns = useMemo<Column<MyReviewRow>[]>(() => {
    const c: Column<MyReviewRow>[] = [
      { id: 'id', header: 'Paper ID', locked: true, sort: (r) => r.paper.id, cell: (r) => <PaperIdLink id={r.paper.id} to={`/my-reviews/${r.paper.id}`} /> },
      { id: 'title', header: 'Title', className: 'min-w-[260px]', sort: (r) => r.paper.title, cell: (r) => <TitleText title={r.paper.title} /> },
    ]
    if (allJournals) c.push({ id: 'journal', header: 'Journal', sort: (r) => r.paper.journal, cell: (r) => <JournalBadge code={r.paper.journal} /> })
    c.push(
      { id: 'type', header: 'Type', sort: (r) => r.paper.articleType, cell: (r) => <span className="whitespace-nowrap text-muted">{r.paper.articleType}</span> },
      { id: 'due', header: 'Review due', sort: (r) => r.paper.reviewDue, cell: (r) => (r.paper.status === 'under_review' ? <DueChip value={r.paper.reviewDue} /> : <span className="text-faint">—</span>) },
      { id: 'mine', header: 'My review', sort: (r) => myState(r).label, cell: (r) => { const s = myState(r); return <Badge tone={s.tone}>{s.label}</Badge> } },
      { id: 'open', header: '', locked: true, cell: (r) => <Link to={`/my-reviews/${r.paper.id}`} className={r.paper.status === 'under_review' ? 'btn-primary !h-8' : 'btn-secondary !h-8'}>{myState(r).cta}</Link> },
    )
    return c
  }, [allJournals])

  const histColumns = useMemo<Column<HistoryRow>[]>(() => [
    { id: 'id', header: 'Paper ID', locked: true, sort: (r) => r.review.paperId, cell: (r) => <span className="whitespace-nowrap font-medium">{r.review.paperId}</span> },
    { id: 'title', header: 'Title', className: 'min-w-[260px]', cell: (r) => <TitleText title={r.title} /> },
    { id: 'rec', header: 'My recommendation', sort: (r) => r.review.recommendation, cell: (r) => <RecommendationBadge value={r.review.recommendation} /> },
    { id: 'score', header: 'Average score', sort: (r) => averageScore(r.review.scores), cell: (r) => <span className="tabular-nums">{averageScore(r.review.scores)} / 5</span> },
    { id: 'at', header: 'Submitted', sort: (r) => r.review.submittedAt, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.review.submittedAt)}</span> },
    { id: 'view', header: '', locked: true, cell: (r) => <button className="btn-secondary !h-8" onClick={() => setOpen(r)}>View report</button> },
  ], [])

  return (
    <>
      <PageHeader title="My reviews" description="Papers assigned to you. Author details are hidden — reviews are double-blind." />
      <section className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3" aria-label="Review summary">
        <KpiCard label="Awaiting my review" value={awaiting.length} icon={ClipboardCheck} loading={mine.loading && !mine.data} tone={awaiting.length ? 'warning' : 'default'} />
        <KpiCard label="Due today or overdue" value={awaiting.filter((r) => r.paper.reviewDue && new Date(r.paper.reviewDue).getTime() < NOW.getTime() + 86_400_000).length} icon={ClipboardCheck} loading={mine.loading && !mine.data} />
        <KpiCard label="Reviews submitted" value={hist.data?.length ?? 0} icon={History} loading={hist.loading && !hist.data} />
      </section>
      <Tabs value={tab} onChange={setTab} tabs={[
        {
          id: 'assigned', label: 'Assigned to me', badge: rows.length,
          content: (
            <DataTable<MyReviewRow>
              id="my-reviews" data={rows} columns={columns} rowKey={(r) => r.paper.id}
              loading={mine.loading && !mine.data} error={!!mine.error} onRetry={mine.reload}
              onRowClick={(r) => navigate(`/my-reviews/${r.paper.id}`)}
              search={{ placeholder: 'Search Paper ID or title', text: (r) => `${r.paper.id} ${r.paper.title}` }}
              empty={{ icon: ClipboardCheck, title: 'No reviews assigned to you', hint: 'When an Editor assigns you a paper it appears here with a due date and an email notification.' }}
            />
          ),
        },
        {
          id: 'history', label: 'My review history', badge: hist.data?.length ?? 0,
          content: (
            <DataTable<HistoryRow>
              id="my-review-history" data={hist.data ?? []} columns={histColumns} rowKey={(r) => r.review.id}
              loading={hist.loading && !hist.data} error={!!hist.error} onRetry={hist.reload}
              search={{ placeholder: 'Search Paper ID or title', text: (r) => `${r.review.paperId} ${r.title}` }}
              empty={{ icon: History, title: 'No submitted reviews yet', hint: 'Reports you submit are kept here for reference.' }}
            />
          ),
        },
      ]} />
      <Drawer open={!!open} onClose={() => setOpen(undefined)} title="My review report" width={720}>
        {open && <ReviewReport review={open.review} paperTitle={open.title} />}
      </Drawer>
    </>
  )
}
