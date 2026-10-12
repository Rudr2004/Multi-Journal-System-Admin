import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { AlarmClock, Bell, CalendarClock, ClipboardCheck, UserPlus, UserRoundCog, Users } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { DueChip } from '@/components/Due'
import { JournalBadge, StatusBadge } from '@/components/Badges'
import { KpiCard } from '@/components/KpiCard'
import { RelativeTime } from '@/components/Time'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useIsAllJournals } from '@/lib/scope'
import { useAsync } from '@/lib/useAsync'
import { usePermission } from '@/permissions/hooks'
import type { Paper } from '@/shared/types'
import { listReviewQueue, sendReviewReminder, type ReviewQueueRow } from '@/mock/api/reviews'
import { EXPERTISE, matchScore } from '@/mock/data/editorial'
import { useSession } from '@/mock/store'
import { AssignReviewerDialog, SetDueDialog } from './AssignReviewerDialog'
import { PaperIdLink, ReviewerTypeBadge, SubjectTags, TitleText, useAccess } from './shared'

interface Filters { state: string; type: string; due: string }
const EMPTY: Filters = { state: '', type: '', due: '' }

const stateOf = (r: ReviewQueueRow) => (!r.reviewer ? 'needs' : r.paper.status === 'decision_pending' ? 'received' : 'in_progress')
const overdue = (p: Paper) => !!p.reviewDue && p.status === 'under_review' && differenceInCalendarDays(parseISO(p.reviewDue), new Date()) < 0

export function ReviewManagementPage() {
  const navigate = useNavigate()
  const ctx = useAccess('reviewMgmt')
  const { can, why } = usePermission('reviewMgmt')
  const allJournals = useIsAllJournals()
  const panelOn = useSession((s) => s.flags.reviewPanel)
  const q = useAsync(() => listReviewQueue(ctx.journals), [ctx])
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [assign, setAssign] = useState<{ paper: Paper; reassign: boolean }>()
  const [dueFor, setDueFor] = useState<Paper>()
  const [busyId, setBusyId] = useState<string>()

  const rows = useMemo(() => q.data ?? [], [q.data])
  const filtered = useMemo(
    () => rows.filter((r) => (!filters.state || stateOf(r) === filters.state) && (!filters.type || r.kind === filters.type) && (!filters.due || (filters.due === 'overdue' ? overdue(r.paper) : !overdue(r.paper)))),
    [rows, filters],
  )
  const active = Object.values(filters).some(Boolean)

  const remind = async (r: ReviewQueueRow) => {
    setBusyId(r.paper.id)
    try {
      const res = await sendReviewReminder(r.paper.id)
      toast.success(`Reminder #${res.count} queued for ${res.reviewer.name}`)
      q.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the reminder.')
    } finally {
      setBusyId(undefined)
    }
  }

  const columns = useMemo<Column<ReviewQueueRow>[]>(() => {
    const cols: Column<ReviewQueueRow>[] = [
      { id: 'id', header: 'Paper ID', locked: true, sort: (r) => r.paper.id, cell: (r) => <PaperIdLink id={r.paper.id} to={`/submissions/${r.paper.id}?tab=review`} /> },
      { id: 'title', header: 'Title', className: 'min-w-[240px]', sort: (r) => r.paper.title, cell: (r) => <TitleText title={r.paper.title} /> },
    ]
    if (allJournals) cols.push({ id: 'journal', header: 'Journal', sort: (r) => r.paper.journal, cell: (r) => <JournalBadge code={r.paper.journal} /> })
    cols.push(
      { id: 'subjects', header: 'Subjects', defaultHidden: true, cell: (r) => <div className="max-w-[220px]"><SubjectTags subjects={r.subjects} /></div> },
      {
        id: 'reviewer', header: 'Reviewer', sort: (r) => r.reviewer?.name ?? '', className: 'min-w-[170px]',
        cell: (r) => {
          if (!r.reviewer) return <div><span className="text-amber-700">Needs reviewer</span>{r.outsideInHouse && <p className="text-xs text-muted">Outside in-house expertise</p>}</div>
          const m = matchScore(r.subjects, EXPERTISE[r.reviewer.id])
          return <div><p className="whitespace-nowrap font-medium">{r.reviewer.name}</p><p className="text-xs text-muted" title={m.matched.length ? `Matched: ${m.matched.join(', ')}` : 'No overlapping subject tags'}>{m.score}% subject match{m.matched.length ? ` · ${m.matched.join(', ')}` : ''}</p></div>
        },
      },
      { id: 'type', header: 'Type', sort: (r) => r.kind ?? '', cell: (r) => (r.kind ? <ReviewerTypeBadge kind={r.kind} /> : <span className="text-faint">—</span>) },
      { id: 'due', header: 'Due', sort: (r) => r.paper.reviewDue, cell: (r) => <DueChip value={r.paper.status === 'under_review' ? r.paper.reviewDue : undefined} /> },
      { id: 'status', header: 'Status', sort: (r) => r.paper.status, cell: (r) => <StatusBadge status={r.paper.status} /> },
      {
        id: 'reminders', header: 'Reminders', sort: (r) => r.reminders.count,
        cell: (r) => (
          <div className="whitespace-nowrap"><span className="tabular-nums">{r.reminders.count}</span> sent{r.reminders.lastAt && <p className="text-xs text-muted">Last <RelativeTime value={r.reminders.lastAt} /></p>}</div>
        ),
      },
      {
        id: 'actions', header: 'Actions', locked: true, mobileHide: false,
        cell: (r) => {
          const p = r.paper
          const inReview = p.status === 'under_review'
          return (
            <div className="flex flex-wrap gap-1.5" data-no-row-click>
              <GuardedButton allowed={can('work')} why={why('work')} className="btn-secondary !h-8 !px-2.5" onClick={() => setAssign({ paper: p, reassign: !!r.reviewer })}>
                {r.reviewer ? <><UserRoundCog size={14} strokeWidth={1.5} aria-hidden /> Reassign</> : <><UserPlus size={14} strokeWidth={1.5} aria-hidden /> Assign</>}
              </GuardedButton>
              <GuardedButton allowed={can('work') && inReview} why={!can('work') ? why('work') : 'A due date only applies while the paper is under review.'} className="btn-secondary !h-8 !px-2.5" onClick={() => setDueFor(p)}>
                <CalendarClock size={14} strokeWidth={1.5} aria-hidden /> Due date
              </GuardedButton>
              <GuardedButton allowed={can('work') && inReview} why={!can('work') ? why('work') : 'Reminders can be sent while a review is outstanding.'} className="btn-secondary !h-8 !px-2.5" disabled={busyId === p.id} onClick={() => remind(r)}>
                <Bell size={14} strokeWidth={1.5} aria-hidden /> Remind
              </GuardedButton>
            </div>
          )
        },
      },
    )
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allJournals, can, why, busyId])

  const count = (f: (r: ReviewQueueRow) => boolean) => rows.filter(f).length

  return (
    <>
      <PageHeader title="Review management" description="Assign reviewers by subject expertise, track due dates and send reminders."
        actions={!panelOn ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">Review Panel is off — only in-house reviewers can be assigned</span> : undefined} />
      <section className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Review pipeline">
        <KpiCard label="Need a reviewer" value={count((r) => stateOf(r) === 'needs')} icon={Users} loading={q.loading && !q.data} tone={count((r) => stateOf(r) === 'needs') ? 'warning' : 'default'} />
        <KpiCard label="Under review" value={count((r) => stateOf(r) === 'in_progress')} icon={ClipboardCheck} loading={q.loading && !q.data} />
        <KpiCard label="Overdue" value={count((r) => overdue(r.paper))} icon={AlarmClock} loading={q.loading && !q.data} tone={count((r) => overdue(r.paper)) ? 'danger' : 'default'} />
        <KpiCard label="Report received" value={count((r) => stateOf(r) === 'received')} icon={ClipboardCheck} loading={q.loading && !q.data} hint="Awaiting editorial decision" />
      </section>
      <DataTable<ReviewQueueRow>
        id="review-management"
        data={filtered}
        columns={columns}
        rowKey={(r) => r.paper.id}
        loading={q.loading && !q.data}
        error={!!q.error}
        onRetry={q.reload}
        onRowClick={(r) => navigate(`/submissions/${r.paper.id}?tab=review`)}
        search={{ placeholder: 'Search Paper ID, title or reviewer', text: (r) => `${r.paper.id} ${r.paper.title} ${r.reviewer?.name ?? ''} ${r.subjects.join(' ')}` }}
        views={{ filters, applyFilters: (f) => setFilters({ ...EMPTY, ...(f as Partial<Filters>) }) }}
        empty={{ icon: Users, title: active ? 'No papers match your filters' : 'No papers are in review', hint: active ? 'Clear a filter to see every paper in the review pipeline.' : 'Papers appear here once screening starts.', action: active ? <button className="btn-secondary" onClick={() => setFilters(EMPTY)}>Clear filters</button> : undefined }}
        filters={
          <>
            <SelectFilter label="State" value={filters.state} onChange={(v) => setFilters((f) => ({ ...f, state: v }))} options={[{ value: 'needs', label: 'Needs reviewer' }, { value: 'in_progress', label: 'Under review' }, { value: 'received', label: 'Report received' }]} />
            <SelectFilter label="Type" value={filters.type} onChange={(v) => setFilters((f) => ({ ...f, type: v }))} options={[{ value: 'in_house', label: 'In-house' }, { value: 'panel', label: 'Review Panel' }]} />
            <SelectFilter label="Due" value={filters.due} onChange={(v) => setFilters((f) => ({ ...f, due: v }))} options={[{ value: 'overdue', label: 'Overdue' }, { value: 'ontime', label: 'Not overdue' }]} />
            {active && <button className="btn-ghost" onClick={() => setFilters(EMPTY)}>Clear filters</button>}
          </>
        }
      />
      <AssignReviewerDialog open={!!assign} papers={assign ? [assign.paper] : []} reassign={assign?.reassign} onClose={() => setAssign(undefined)} onDone={q.reload} />
      <SetDueDialog open={!!dueFor} paper={dueFor} onClose={() => setDueFor(undefined)} onDone={q.reload} />
    </>
  )
}
