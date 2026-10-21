import { useMemo, useState } from 'react'
import { Bell, ClipboardList, UserX, UserCog } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { DueChip } from '@/components/Due'
import { RelativeTime } from '@/components/Time'
import { EmptyState } from '@/components/States'
import { useIsAllJournals } from '@/lib/scope'
import { useAsync } from '@/lib/useAsync'
import { listReviewAssignments, type AllSubmissionRow, type PanelAssignmentStatus, type ReviewAssignmentRow } from '@/mock/api/reviews'
import { AssignExternalDialog } from './AssignExternalDialog'
import { useDataStore } from '@/mock/store'
import { useEditorialStore } from '@/mock/stores/editorial'
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
  const papers = useDataStore((s) => s.papers)
  const overrides = useEditorialStore((s) => s.panelOverrides)
  const q = useAsync(() => (on ? listReviewAssignments(ctx.journals) : Promise.resolve([] as ReviewAssignmentRow[])), [ctx, on, papers, overrides])
  const [reassigning, setReassigning] = useState<AllSubmissionRow | null>(null)

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
        id: 'reminders', header: 'Reminders', className: 'min-w-[150px]', sort: (r) => r.reminders.count,
        cell: (r) => (r.reminders.count
          ? (
            <div className="leading-tight">
              <p className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"><Bell size={12} aria-hidden /> {r.reminders.count} {r.reminders.count === 1 ? 'reminder' : 'reminders'} sent</p>
              {r.reminders.lastAt && <p className="mt-1 whitespace-nowrap text-xs text-muted">Last sent <RelativeTime value={r.reminders.lastAt} /></p>}
            </div>
          )
          : <span className="whitespace-nowrap text-sm text-faint">None sent</span>),
      },
      {
        id: 'reassign', header: '', locked: true, mobileHide: false,
        cell: (r) => r.status === 'submitted' ? <span className="text-faint">&mdash;</span> : (
          <button type="button" className="btn-secondary !h-8 whitespace-nowrap" onClick={() => setReassigning({ paperId: r.paperId, journal: r.journal, title: r.title, subjects: r.subjects, matched: [], status: 'under_review', submittedAt: '', panelMemberId: r.panelMemberId, panelMemberName: r.panelMemberName, due: r.due, autoReassigned: 0 })}><UserCog size={14} aria-hidden /> Reassign to Reviewer</button>
        ),
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
          <p role="note" className="mb-4 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">Use <span className="font-medium text-ink">Reassign to Reviewer</span> to withdraw a manuscript from its Review Panel Member and send it to another one. The member is told the assignment was withdrawn. Author names are never shown.</p>
          <AssignExternalDialog row={reassigning} onClose={() => setReassigning(null)} onDone={q.reload} />
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
