import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Factory, Newspaper, Undo2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { JournalBadge, StatusBadge, Badge } from '@/components/Badges'
import { DueChip } from '@/components/Due'
import { KpiCard } from '@/components/KpiCard'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import { listProductionQueue, type QueueRow } from '@/mock/api/production'
import { formatDate, formatTime } from '@/shared/formatters'
import { STATUS_META } from '@/shared/statuses'
import { usePapersKey } from './shared'
import { TemplateCard } from './TemplateDownload'

export function ProductionQueuePage() {
  const navigate = useNavigate()
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const user = useCurrentUser()
  const perm = usePermission('production')
  const onlyMine = perm.level === 'work'
  const key = usePapersKey()
  const q = useAsync(() => listProductionQueue(journals, onlyMine ? user?.id : undefined), [journals.join(','), onlyMine, user?.id, key])
  const [status, setStatus] = useState('pending')
  const [press, setPress] = useState('')
  const rows = useMemo(() => (q.data ?? []).filter((r) => (!status || (status === 'pending' ? r.paper.status !== 'ready_for_approval' : r.paper.status === 'ready_for_approval')) && (!press || (press === 'in_press' ? r.inPress : !r.inPress))), [q.data, status, press])
  const data = q.data ?? []

  const columns: Column<QueueRow>[] = [
    { id: 'paper', header: 'Manuscript ID', locked: true, cell: (r) => <Link to={`/production/${r.paper.id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{r.paper.id}</Link>, sort: (r) => r.paper.id },
    { id: 'title', header: 'Title', cell: (r) => <p className="line-clamp-2 max-w-[420px] text-sm" title={r.paper.title}>{r.paper.title}</p>, sort: (r) => r.paper.title },
    ...(all ? [{ id: 'journal', header: 'Journal', cell: (r: QueueRow) => <JournalBadge code={r.paper.journal} />, sort: (r: QueueRow) => r.paper.journal } as Column<QueueRow>] : []),
    { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.paper.status} />, sort: (r) => STATUS_META[r.paper.status].order },
    { id: 'press', header: 'Article In Press', cell: (r) => (r.inPress
      ? <Badge tone="info"><Newspaper size={12} aria-hidden /> In Press</Badge>
      : <span className="text-faint">Not yet listed</span>), sort: (r) => Number(r.inPress) },
    { id: 'submitted', header: 'Submitted', cell: (r) => <span className="whitespace-nowrap">{formatDate(r.paper.submittedAt)}<span className="block text-xs text-muted">{formatTime(r.paper.submittedAt)} IST</span></span>, sort: (r) => r.paper.submittedAt },
    { id: 'updated', header: 'Last updated', cell: (r) => <span className="whitespace-nowrap">{formatDate(r.paper.updatedAt)}<span className="block text-xs text-muted">{formatTime(r.paper.updatedAt)} IST</span></span>, sort: (r) => r.paper.updatedAt },
    { id: 'due', header: 'Due date', cell: (r) => (r.paper.status === 'ready_for_approval' ? <span className="text-faint">—</span> : <DueChip value={r.due} showDate />), sort: (r) => r.due },
  ]

  return (
    <>
      <PageHeader
        title="Assigned manuscripts"
        description={onlyMine ? 'Papers assigned to you. Payment-verified papers arrive here automatically.' : perm.level === 'view' ? 'Read-only view of papers in production across your journals.' : 'Accepted and paid papers being prepared for publication.'}
      />
      {journals.length === 1 && <TemplateCard journal={journals[0]} />}
      <section aria-label="Queue summary" className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard label="In queue" value={data.length} icon={Factory} loading={q.loading} />
        <KpiCard label="In Press" value={data.filter((r) => r.inPress).length} icon={Newspaper} loading={q.loading} />
        <KpiCard label="Returned by Editor" value={data.filter((r) => r.returned).length} icon={Undo2} loading={q.loading} tone={data.some((r) => r.returned) ? 'danger' : 'default'} />
        <KpiCard label="Awaiting final approval" value={data.filter((r) => r.paper.status === 'ready_for_approval').length} icon={CheckCircle2} loading={q.loading} />
        <KpiCard label="Overdue" value={data.filter((r) => r.paper.status !== 'ready_for_approval' && new Date(r.due) < new Date(new Date().toDateString())).length} icon={AlertCircle} loading={q.loading} tone="warning" />
      </section>
      <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
        <Newspaper size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>Articles marked <span className="font-medium">In Press</span> are listed publicly on the Article In Press page while in production. When the Editor publishes an article it leaves this list.</span>
      </p>
      <DataTable<QueueRow>
        id="production-queue"
        data={rows}
        columns={columns}
        rowKey={(r) => r.paper.id}
        loading={q.loading}
        error={!!q.error}
        onRetry={q.reload}
        onRowClick={(r) => navigate(`/production/${r.paper.id}`)}
        search={{ placeholder: 'Search by Paper ID or title', text: (r) => `${r.paper.id} ${r.paper.title} ${r.assigneeName ?? ''}` }}
        filters={<><SelectFilter label="Article In Press" value={press} onChange={setPress} options={[{ value: 'in_press', label: 'In Press' }, { value: 'not', label: 'Not yet listed' }]} /><SelectFilter label="Status" value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' }]} /></>}
        rowClassName={(r) => (r.returned ? 'bg-red-50/40' : undefined)}
        empty={{ icon: Factory, title: onlyMine ? 'Your production queue is empty' : 'No papers in production', hint: 'Papers appear here automatically as soon as their payment is verified.' }}
      />
    </>
  )
}
