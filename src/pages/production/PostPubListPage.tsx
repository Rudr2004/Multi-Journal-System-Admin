import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FilePenLine, Plus } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { JournalBadge } from '@/components/Badges'
import { RelativeTime } from '@/components/Time'
import { GuardedButton } from '@/components/Tooltip'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { listChangeRequests } from '@/mock/api/postPublication'
import { CHANGE_TYPE_META, type ChangeRequest, type ChangeType } from '@/mock/data/production'
import { useProductionStore } from '@/mock/stores/production'
import { useDataStore } from '@/mock/store'
import { CHANGE_STATUS_META, ChangeStatusBadge, ChangeTypeBadge } from './postPubShared'

export function PostPubListPage() {
  const navigate = useNavigate()
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const perm = usePermission('postPub')
  const rev = useProductionStore((s) => s.changeRequests)
  const users = useDataStore((s) => s.users)
  const q = useAsync(() => listChangeRequests(journals), [journals.join(','), rev.map((r) => r.id + r.status).join()])
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const rows = useMemo(() => (q.data ?? []).filter((r) => (!status || r.status === status) && (!type || r.type === type)), [q.data, status, type])

  const columns: Column<ChangeRequest>[] = [
    { id: 'id', header: 'Request', locked: true, cell: (r) => <Link to={`/post-publication/${r.id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{r.id}</Link>, sort: (r) => r.id },
    { id: 'paper', header: 'Paper', cell: (r) => <span className="whitespace-nowrap">{r.paperId}</span>, sort: (r) => r.paperId },
    ...(all ? [{ id: 'journal', header: 'Journal', cell: (r: ChangeRequest) => <JournalBadge code={r.journal} />, sort: (r: ChangeRequest) => r.journal } as Column<ChangeRequest>] : []),
    { id: 'type', header: 'Type', cell: (r) => <ChangeTypeBadge type={r.type} />, sort: (r) => r.type },
    { id: 'status', header: 'Status', cell: (r) => <ChangeStatusBadge status={r.status} />, sort: (r) => r.status },
    { id: 'reason', header: 'Reason', cell: (r) => <p className="line-clamp-2 max-w-[320px] text-sm text-muted" title={r.reason}>{r.reason}</p>, mobileHide: true },
    { id: 'by', header: 'Requested by', cell: (r) => r.requestedBy, sort: (r) => r.requestedBy },
    { id: 'assignee', header: 'Assigned to', cell: (r) => users.find((u) => u.id === r.assigneeId)?.name ?? <span className="text-faint">—</span>, defaultHidden: true },
    { id: 'at', header: 'Raised', cell: (r) => <RelativeTime value={r.requestedAt} />, sort: (r) => r.requestedAt },
  ]

  return (
    <>
      <PageHeader title="Post-publication changes" description="Corrections, author changes, file replacements, errata, retractions and withdrawals for published articles."
        actions={<GuardedButton allowed={perm.can('work')} why={perm.why('work')} className="btn-primary" onClick={() => navigate('/post-publication/new')}><Plus size={15} aria-hidden /> New change request</GuardedButton>} />
      <DataTable<ChangeRequest>
        id="post-pub" data={rows} columns={columns} rowKey={(r) => r.id} loading={q.loading} error={!!q.error} onRetry={q.reload}
        onRowClick={(r) => navigate(`/post-publication/${r.id}`)}
        search={{ placeholder: 'Search by request, Paper ID or reason', text: (r) => `${r.id} ${r.paperId} ${r.reason} ${r.requestedBy}` }}
        filters={<>
          <SelectFilter label="Status" value={status} onChange={setStatus} options={Object.entries(CHANGE_STATUS_META).map(([value, m]) => ({ value, label: m.label }))} />
          <SelectFilter label="Type" value={type} onChange={setType} options={(Object.keys(CHANGE_TYPE_META) as ChangeType[]).map((value) => ({ value, label: CHANGE_TYPE_META[value].label }))} />
        </>}
        empty={{ icon: FilePenLine, title: 'No change requests', hint: 'Raise a request when a published article needs a correction, an erratum or a retraction.', action: perm.can('work') ? <Link to="/post-publication/new" className="btn-primary">New change request</Link> : undefined }}
      />
    </>
  )
}
