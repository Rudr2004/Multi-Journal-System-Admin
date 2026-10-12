import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Factory, Undo2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { JournalBadge, StatusBadge, Badge } from '@/components/Badges'
import { DueChip } from '@/components/Due'
import { KpiCard } from '@/components/KpiCard'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import { listProductionQueue, type QueueRow } from '@/mock/api/production'
import { STATUS_META } from '@/shared/statuses'
import { PaperTitle, usePapersKey } from './shared'

export function ProductionQueuePage() {
  const navigate = useNavigate()
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const user = useCurrentUser()
  const perm = usePermission('production')
  const onlyMine = perm.level === 'work'
  const key = usePapersKey()
  const q = useAsync(() => listProductionQueue(journals, onlyMine ? user?.id : undefined), [journals.join(','), onlyMine, user?.id, key])
  const [status, setStatus] = useState('')
  const rows = useMemo(() => (q.data ?? []).filter((r) => !status || r.paper.status === status), [q.data, status])
  const data = q.data ?? []

  const columns: Column<QueueRow>[] = [
    { id: 'paper', header: 'Paper', locked: true, cell: (r) => <PaperTitle paper={r.paper} to={`/production/${r.paper.id}`} />, sort: (r) => r.paper.id },
    ...(all ? [{ id: 'journal', header: 'Journal', cell: (r: QueueRow) => <JournalBadge code={r.paper.journal} />, sort: (r: QueueRow) => r.paper.journal } as Column<QueueRow>] : []),
    { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.paper.status} />, sort: (r) => STATUS_META[r.paper.status].order },
    { id: 'due', header: 'Due', cell: (r) => (r.paper.status === 'ready_for_approval' ? <span className="text-faint">—</span> : <DueChip value={r.due} />), sort: (r) => r.due },
    { id: 'assignee', header: 'Assignee', cell: (r) => r.assigneeName ?? <span className="text-faint">Unassigned</span>, sort: (r) => r.assigneeName ?? '' },
    {
      id: 'checks', header: 'Checklist', cell: (r) => r.paper.status === 'ready_for_approval'
        ? <Badge tone="success"><CheckCircle2 size={12} aria-hidden /> Complete</Badge>
        : r.missing === 0 ? <Badge tone="success"><CheckCircle2 size={12} aria-hidden /> Ready to send</Badge>
        : <Badge tone="warning"><AlertCircle size={12} aria-hidden /> {r.missing} open</Badge>,
      sort: (r) => r.missing,
    },
  ]

  return (
    <>
      <PageHeader
        title="Production queue"
        description={onlyMine ? 'Papers assigned to you. Payment-verified papers arrive here automatically.' : perm.level === 'view' ? 'Read-only view of papers in production across your journals.' : 'Accepted and paid papers being prepared for publication.'}
      />
      <section aria-label="Queue summary" className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="In queue" value={data.length} icon={Factory} loading={q.loading} />
        <KpiCard label="Returned by Editor" value={data.filter((r) => r.returned).length} icon={Undo2} loading={q.loading} tone={data.some((r) => r.returned) ? 'danger' : 'default'} />
        <KpiCard label="Awaiting final approval" value={data.filter((r) => r.paper.status === 'ready_for_approval').length} icon={CheckCircle2} loading={q.loading} />
        <KpiCard label="Overdue" value={data.filter((r) => r.paper.status !== 'ready_for_approval' && new Date(r.due) < new Date(new Date().toDateString())).length} icon={AlertCircle} loading={q.loading} tone="warning" />
      </section>
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
        filters={<SelectFilter label="Status" value={status} onChange={setStatus} options={['paid', 'in_production', 'returned_to_production', 'ready_for_approval'].map((s) => ({ value: s, label: STATUS_META[s as keyof typeof STATUS_META].label }))} />}
        rowClassName={(r) => (r.returned ? 'bg-red-50/40' : undefined)}
        empty={{ icon: Factory, title: onlyMine ? 'Your production queue is empty' : 'No papers in production', hint: 'Papers appear here automatically as soon as their payment is verified.' }}
      />
    </>
  )
}
