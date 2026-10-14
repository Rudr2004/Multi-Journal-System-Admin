import { useMemo } from 'react'
import { Bell, ClipboardList, Info, UserX } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { DueChip } from '@/components/Due'
import { RelativeTime } from '@/components/Time'
import { EmptyState } from '@/components/States'
import { useIsAllJournals } from '@/lib/scope'
import { useAsync } from '@/lib/useAsync'
import { listReviewAssignments, type PanelAssignmentStatus, type ReviewAssignmentRow } from '@/mock/api/reviews'
import { useSession } from '@/mock/store'
import { SubjectTags, TitleText, useAccess } from './shared'

const STATUS: Record<PanelAssignmentStatus, { label: string; tone: 'neutral' | 'info' | 'success' }> = {
  assigned: { label: 'Assigned', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'info' },
  submitted: { label: 'Submitted', tone: 'success' },
}

export function ReviewAssignmentsPage() {
  const ctx = useAccess('reviewAssign')
  const on = useSession((s) => s.flags.reviewPanel)
  const allJournals = useIsAllJournals()
  const q = useAsync(() => (on ? listReviewAssignments(ctx.journals) : Promise.resolve([] as ReviewAssignmentRow[])), [ctx, on])

  const columns = useMemo<Column<ReviewAssignmentRow>[]>(() => {
    const c: Column<ReviewAssignmentRow>[] = [
      { id: 'id', header: 'Paper ID', locked: true, sort: (r) => r.paperId, cell: (r) => <span className="whitespace-nowrap font-medium">{r.paperId}</span> },
      { id: 'title', header: 'Title', className: 'min-w-[260px]', sort: (r) => r.title, cell: (r) => <div className="space-y-1"><TitleText title={r.title} /><SubjectTags subjects={r.subjects} /></div> },
    ]
    if (allJournals) c.push({ id: 'journal', header: 'Journal', sort: (r) => r.journal, cell: (r) => <JournalBadge code={r.journal} /> })
    c.push(
      { id: 'member', header: 'Review Panel Member', sort: (r) => r.panelMemberName, cell: (r) => <span className="whitespace-nowrap">{r.panelMemberName}</span> },
      { id: 'status', header: 'Status', sort: (r) => r.status, cell: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge> },
      { id: 'due', header: 'Due date', sort: (r) => r.due, cell: (r) => (r.status === 'submitted' ? <span className="text-faint">&mdash;</span> : <DueChip value={r.due} />) },
      {
        id: 'reminders', header: 'Reminders', sort: (r) => r.reminders.count,
        cell: (r) => (r.reminders.count
          ? <span className="inline-flex items-center gap-1 text-sm"><Bell size={13} aria-hidden /> {r.reminders.count} sent{r.reminders.lastAt && <span className="text-xs text-muted">&middot; <RelativeTime value={r.reminders.lastAt} /></span>}</span>
          : <span className="text-faint">None sent</span>),
      },
    )
    return c
  }, [allJournals])

  return (
    <>
      <PageHeader title="Review Assignments" description="Papers the Editor assigned to external Review Panel Members in your subject area." />
      {!on ? (
        <div className="card"><EmptyState icon={UserX} title="Review Panel is switched off" hint="The Review Panel Member role is currently off, so there are no external assignments to show. A Super Admin can switch it on in Journal Settings." /></div>
      ) : (
        <>
          <div role="note" className="mb-4 flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">
            <Info size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
            <span>Read-only. The Editor assigns and reminds Review Panel Members; you can follow progress here. Author names are never shown.</span>
          </div>
          <DataTable<ReviewAssignmentRow>
            id="review-assignments" data={q.data ?? []} columns={columns} rowKey={(r) => r.paperId}
            loading={q.loading && !q.data} error={!!q.error} onRetry={q.reload}
            search={{ placeholder: 'Search Paper ID, title or panel member', text: (r) => `${r.paperId} ${r.title} ${r.panelMemberName}` }}
            empty={{ icon: ClipboardList, title: 'No external assignments in your area', hint: 'When the Editor sends a paper outside in-house expertise to a Review Panel Member it appears here.' }}
          />
        </>
      )}
    </>
  )
}
