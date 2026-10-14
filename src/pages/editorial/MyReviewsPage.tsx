import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardCheck, EyeOff, History, Library } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { Drawer } from '@/components/Dialog'
import { DueChip } from '@/components/Due'
import { KpiCard } from '@/components/KpiCard'
import { Tabs } from '@/components/Tabs'
import { useIsAllJournals } from '@/lib/scope'
import { useAsync } from '@/lib/useAsync'
import { useRole } from '@/permissions/hooks'
import { formatDate } from '@/shared/formatters'
import { listMyReviewHistory, listMyReviews, listSubjectSubmissions, type MyReviewRow, type SubjectSubmissionRow } from '@/mock/api/reviews'
import { averageScore, type ReviewRecord } from '@/mock/data/editorial'
import { NOW } from '@/mock/data/papers'
import { useSession } from '@/mock/store'
import { PaperIdLink, RecommendationBadge, SubjectTags, TitleText, useAccess } from './shared'
import { ReviewReport } from './ReviewReport'

type HistoryRow = { review: ReviewRecord; title: string }

function myState(r: MyReviewRow) {
  if (r.paper.status === 'under_review') return r.hasDraft ? { label: 'Draft saved', tone: 'info' as const, cta: 'Continue review' } : { label: 'Not started', tone: 'warning' as const, cta: 'Start review' }
  return r.submitted ? { label: 'Submitted', tone: 'success' as const, cta: 'View my report' } : { label: 'Closed', tone: 'neutral' as const, cta: 'Open' }
}

const Anonymised = () => (
  <span className="inline-flex items-center gap-1 text-xs italic text-muted"><EyeOff size={12} aria-hidden /> Anonymised</span>
)

/** Read-only list of every submission in the reviewer's subject area. Rendered only while the reviewerSeesAll flag is on. */
function SubjectSubmissions() {
  const ctx = useAccess('myReviews')
  const allJournals = useIsAllJournals()
  const q = useAsync(() => listSubjectSubmissions(ctx.userId, ctx.journals), [ctx])
  const columns = useMemo<Column<SubjectSubmissionRow>[]>(() => {
    const c: Column<SubjectSubmissionRow>[] = [
      { id: 'id', header: 'Paper ID', locked: true, sort: (r) => r.paperId, cell: (r) => <span className="whitespace-nowrap font-medium">{r.paperId}</span> },
      { id: 'title', header: 'Title', className: 'min-w-[260px]', sort: (r) => r.title, cell: (r) => <TitleText title={r.title} /> },
    ]
    if (allJournals) c.push({ id: 'journal', header: 'Journal', sort: (r) => r.journal, cell: (r) => <JournalBadge code={r.journal} /> })
    c.push(
      { id: 'subjects', header: 'Subjects', mobileHide: true, cell: (r) => <SubjectTags subjects={r.subjects} matched={r.matched} /> },
      { id: 'author', header: 'Author', cell: () => <Anonymised /> },
      { id: 'status', header: 'Status', sort: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
      { id: 'at', header: 'Submitted', sort: (r) => r.submittedAt, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.submittedAt)}</span> },
    )
    return c
  }, [allJournals])
  return (
    <div className="space-y-3">
      <div role="note" className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">
        <Badge tone="warning">To confirm</Badge>
        <span>Client sheet says &ldquo;show all submissions&rdquo; &mdash; to be confirmed. This list is read-only and never shows author identity.</span>
      </div>
      <DataTable<SubjectSubmissionRow>
        id="my-reviews-subject" data={q.data ?? []} columns={columns} rowKey={(r) => r.paperId}
        loading={q.loading && !q.data} error={!!q.error} onRetry={q.reload}
        search={{ placeholder: 'Search Paper ID or title', text: (r) => `${r.paperId} ${r.title}` }}
        empty={{ icon: Library, title: 'No submissions match your subjects', hint: 'Papers in your journals that share a subject with your expertise appear here.' }}
      />
    </div>
  )
}

export function MyReviewsPage() {
  const navigate = useNavigate()
  const ctx = useAccess('myReviews')
  const role = useRole()
  const flagOn = useSession((s) => s.flags.reviewerSeesAll)
  const seesAll = flagOn && role === 'reviewer'
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
      { id: 'author', header: 'Author', mobileHide: true, cell: () => <Anonymised /> },
      { id: 'type', header: 'Type', sort: (r) => r.paper.articleType, cell: (r) => <span className="whitespace-nowrap text-muted">{r.paper.articleType}</span> },
      { id: 'due', header: 'Review due', sort: (r) => r.paper.reviewDue, cell: (r) => (r.paper.status === 'under_review' ? <DueChip value={r.paper.reviewDue} /> : <span className="text-faint">&mdash;</span>) },
      { id: 'mine', header: 'Status', sort: (r) => myState(r).label, cell: (r) => { const s = myState(r); return <Badge tone={s.tone}>{s.label}</Badge> } },
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

  const tabs = [
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
      id: 'history', label: 'History', badge: hist.data?.length ?? 0,
      content: (
        <DataTable<HistoryRow>
          id="my-review-history" data={hist.data ?? []} columns={histColumns} rowKey={(r) => r.review.id}
          loading={hist.loading && !hist.data} error={!!hist.error} onRetry={hist.reload}
          search={{ placeholder: 'Search Paper ID or title', text: (r) => `${r.review.paperId} ${r.title}` }}
          empty={{ icon: History, title: 'No completed reviews yet', hint: 'Reports you submit are kept here for reference.' }}
        />
      ),
    },
    ...(seesAll ? [{ id: 'subject', label: 'All submissions in my subject', content: <SubjectSubmissions /> }] : []),
  ]

  return (
    <>
      <PageHeader title="Review Submissions" description="Papers assigned to you. Author details are hidden because reviews are double-blind." />
      <section className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3" aria-label="Review summary">
        <KpiCard label="Awaiting my review" value={awaiting.length} icon={ClipboardCheck} loading={mine.loading && !mine.data} tone={awaiting.length ? 'warning' : 'default'} />
        <KpiCard label="Due today or overdue" value={awaiting.filter((r) => r.paper.reviewDue && new Date(r.paper.reviewDue).getTime() < NOW.getTime() + 86_400_000).length} icon={ClipboardCheck} loading={mine.loading && !mine.data} />
        <KpiCard label="Reviews submitted" value={hist.data?.length ?? 0} icon={History} loading={hist.loading && !hist.data} />
      </section>
      <Tabs value={tabs.some((t) => t.id === tab) ? tab : 'assigned'} onChange={setTab} tabs={tabs} />
      <Drawer open={!!open} onClose={() => setOpen(undefined)} title="My review report" width={720}>
        {open && <ReviewReport review={open.review} paperTitle={open.title} />}
      </Drawer>
    </>
  )
}
