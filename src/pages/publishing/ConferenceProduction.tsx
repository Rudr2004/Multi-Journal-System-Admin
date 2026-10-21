import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Info, Plus, Presentation, Save } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { DataTable, type Column } from '@/components/DataTable'
import { DescriptionList } from '@/components/Form'
import { DueChip } from '@/components/Due'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import { useDataStore } from '@/mock/store'
import { getConferenceProduction, listConferenceProduction, type ConferenceProduction, type ConferenceProductionRow } from '@/mock/api/conferences'
import { conferenceStatus } from '@/mock/data/publishing'
import { formatDate, formatTime } from '@/shared/formatters'

const NOTE = 'Conference papers go through the same production steps as other articles. Open the production workspace, complete it, then use Send for final approval there. Editors manage conferences, linked submissions and proceedings issues.'

const paperColumns = (): Column<ConferenceProductionRow>[] => [
  { id: 'paper', header: 'Paper', locked: true, sort: (r) => r.paper.id, cell: (r) => (
    <div className="min-w-0">
      <Link to={`/production/${r.paper.id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{r.paper.id}</Link>
      <p className="line-clamp-2 max-w-[420px] text-sm text-muted" title={r.paper.title}>{r.paper.title}</p>
    </div>
  ) },
  { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.paper.status} /> },
  { id: 'submitted', header: 'Submitted', sort: (r) => r.paper.submittedAt, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.paper.submittedAt)}<span className="block text-xs text-muted">{formatTime(r.paper.submittedAt)} IST</span></span> },
  { id: 'updated', header: 'Last updated', sort: (r) => r.paper.updatedAt, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.paper.updatedAt)}<span className="block text-xs text-muted">{formatTime(r.paper.updatedAt)} IST</span></span> },
  { id: 'due', header: 'Due', cell: (r) => (r.paper.status === 'ready_for_approval' ? <Badge tone="accent">With the Editor</Badge> : <DueChip value={r.due} />) },
  { id: 'checks', header: 'Checklist', cell: (r) => (r.paper.status === 'ready_for_approval' ? <Badge tone="success">Complete</Badge> : r.missing === 0 ? <Badge tone="success">Ready to send</Badge> : <Badge tone="warning">{r.missing} open</Badge>) },
  { id: 'open', header: '', cell: (r) => <Link to={`/production/${r.paper.id}`} className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline">{r.paper.status === 'ready_for_approval' ? 'View workspace' : 'Open workspace'} <ArrowRight size={13} aria-hidden /></Link> },
]

/** Associate Editor: conferences with their papers in production. */
export function ConferenceProductionList() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const user = useCurrentUser()
  const navigate = useNavigate()
  const perm = usePermission('conferences')
  const papers = useDataStore((s) => s.papers)
  const r = useAsync(() => listConferenceProduction(journals, user?.id), [journals.join(','), user?.id, papers])

  const columns: Column<ConferenceProduction>[] = [
    { id: 'name', header: 'Conference', locked: true, sort: (c) => c.conference.shortName, cell: (c) => (
      <div className="min-w-0">
        <Link to={`/conferences/${c.conference.id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{c.conference.shortName}</Link>
        <p className="line-clamp-2 max-w-[360px] text-sm text-muted" title={c.conference.name}>{c.conference.name}</p>
      </div>
    ) },
    ...(all ? [{ id: 'journal', header: 'Journal', cell: (c: ConferenceProduction) => <JournalBadge code={c.conference.journal} /> } as Column<ConferenceProduction>] : []),
    { id: 'dates', header: 'Dates', sort: (c) => c.conference.startDate, cell: (c) => <span className="whitespace-nowrap">{formatDate(c.conference.startDate)}</span> },
    { id: 'prod', header: 'Papers in production', align: 'right', sort: (c) => c.rows.length, cell: (c) => <span className="tabular-nums">{c.rows.length}</span> },
    { id: 'ready', header: 'Ready to send', align: 'right', cell: (c) => <span className="tabular-nums">{c.rows.filter((x) => x.paper.status !== 'ready_for_approval' && x.missing === 0).length}</span> },
    { id: 'status', header: 'Status', cell: (c) => { const s = conferenceStatus(c.conference, c.issue); return <Badge tone={s.tone}>{s.label}</Badge> } },
  ]

  return (
    <>
      <PageHeader title="Conference proceedings" description="Conference papers that are in production and assigned to you."
        actions={<GuardedButton className="btn-primary" allowed={perm.can('manage')} why="Editors create and edit conferences. You complete production of their papers." ><Plus size={16} aria-hidden /> New conference</GuardedButton>} />
      <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900"><Info size={16} className="mt-0.5 shrink-0" aria-hidden />{NOTE}</p>
      <DataTable<ConferenceProduction> id="conference-production" data={r.data ?? []} columns={columns} rowKey={(c) => c.conference.id} loading={r.loading && !r.data} error={!!r.error} onRetry={r.reload}
        onRowClick={(c) => navigate(`/conferences/${c.conference.id}`)}
        search={{ placeholder: 'Search conferences', text: (c) => `${c.conference.shortName} ${c.conference.name} ${c.conference.city}` }}
        empty={{ icon: Presentation, title: 'No conferences for your journals', hint: 'Editors add conferences; papers in production appear here once linked.' }} />
    </>
  )
}

export function ConferenceProductionDetail({ conferenceId }: { conferenceId: string }) {
  const user = useCurrentUser()
  const papers = useDataStore((s) => s.papers)
  const r = useAsync(() => getConferenceProduction(conferenceId, user?.id), [conferenceId, user?.id, papers])
  if (r.error) return <><PageHeader title="Conference not found" crumbs={[{ label: conferenceId }]} /><div className="card"><ErrorState message="We could not load this conference." onRetry={r.reload} /></div></>
  if (!r.data) return <><PageHeader title="Loading conference…" crumbs={[{ label: conferenceId }]} /><Skeleton className="h-72" /></>
  const { conference: c, issue, rows } = r.data
  const st = conferenceStatus(c, issue)
  const noEdit = 'Editors manage the conference. You complete production of its papers.'
  return (
    <>
      <PageHeader title={c.shortName} crumbs={[{ label: c.shortName }]} description={c.name}
        actions={<>
          <Badge tone={st.tone}>{st.label}</Badge>
          <GuardedButton className="btn-primary" allowed={false} why={noEdit}><Save size={15} aria-hidden /> Save changes</GuardedButton>
        </>} />
      <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900"><Info size={16} className="mt-0.5 shrink-0" aria-hidden />{NOTE}</p>
      <div className="grid items-start gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <SectionCard title={`Papers in production (${rows.length})`} flush>
            {rows.length === 0 ? <EmptyState icon={Presentation} title="No conference papers in production" hint="Papers appear here when the Editor assigns them to you for production." /> : (
              <DataTable<ConferenceProductionRow> id={`conf-prod-${c.id}`} data={rows} columns={paperColumns()} rowKey={(x) => x.paper.id} />
            )}
          </SectionCard>
        </div>
        <div className="space-y-5 lg:col-span-2">
          <SectionCard title="Conference">
            <DescriptionList cols={1} items={[
              { label: 'Dates', value: `${formatDate(c.startDate)} – ${formatDate(c.endDate)}` },
              { label: 'Venue', value: `${c.venue}, ${c.city}` },
              { label: 'Organiser', value: c.organiser },
              { label: 'Camera-ready deadline', value: formatDate(c.cameraReadyDeadline) },
            ]} />
          </SectionCard>
        </div>
      </div>
    </>
  )
}
