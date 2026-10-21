import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FilePenLine, Plus } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { RelativeTime } from '@/components/Time'
import { GuardedButton } from '@/components/Tooltip'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import { useSession } from '@/mock/store'
import { listChangeRequests, workBlockReason } from '@/mock/api/postPublication'
import { CHANGE_TYPE_META, type ChangeRequest, type ChangeType } from '@/mock/data/production'
import { useProductionStore } from '@/mock/stores/production'
import { useDataStore } from '@/mock/store'
import { formatMoney } from '@/shared/formatters'
import { CHANGE_STATUS_META, ChangeStatusBadge, ChangeTypeBadge, FeeBadge, useCanRaise } from './postPubShared'

export function PostPubListPage() {
  const navigate = useNavigate()
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const perm = usePermission('postPub')
  const user = useCurrentUser()
  const raise = useCanRaise()
  const feeOn = useSession((s) => s.flags.correctionFee)
  const isSupport = perm.role === 'SUPPORT_EXECUTIVE'
  const isAe = perm.role === 'ASSOCIATE_EDITOR'
  const rev = useProductionStore((s) => s.changeRequests)
  const users = useDataStore((s) => s.users)
  const papers = useDataStore((s) => s.papers)
  const titleOf = (id: string) => papers.find((p) => p.id === id)?.title ?? ''
  const q = useAsync(
    () => listChangeRequests(journals, isSupport ? { requestedBy: user?.name } : isAe ? { forAssociateEditor: true } : {}),
    [journals.join(','), isSupport, isAe, user?.name, rev.map((r) => r.id + r.status + (r.fee?.state ?? '')).join()],
  )
  const [state, setState] = useState('pending')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const rows = useMemo(() => (q.data ?? []).filter((r) => (!state || (state === 'pending' ? !['completed', 'rejected'].includes(r.status) : ['completed', 'rejected'].includes(r.status))) && (!status || r.status === status) && (!type || r.type === type)), [q.data, state, status, type])
  const waitingForMe = (q.data ?? []).filter((r) => isAe && !workBlockReason(r) && r.assigneeId === user?.id).length
  const toDecide = (q.data ?? []).filter((r) => perm.can('approve') && ['requested', 'under_review', 'version_review'].includes(r.status)).length

  const columns: Column<ChangeRequest>[] = [
    { id: 'id', header: 'Request', locked: true, cell: (r) => <Link to={`/post-publication/${r.id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{r.id}</Link>, sort: (r) => r.id },
    { id: 'paper', header: 'Manuscript ID', cell: (r) => <span className="whitespace-nowrap font-medium">{r.paperId}</span>, sort: (r) => r.paperId },
    { id: 'title', header: 'Title', cell: (r) => <p className="line-clamp-2 max-w-[360px] text-sm" title={titleOf(r.paperId)}>{titleOf(r.paperId)}</p>, sort: (r) => titleOf(r.paperId) },
    ...(all ? [{ id: 'journal', header: 'Journal', cell: (r: ChangeRequest) => <JournalBadge code={r.journal} />, sort: (r: ChangeRequest) => r.journal } as Column<ChangeRequest>] : []),
    { id: 'type', header: 'Type', cell: (r) => <ChangeTypeBadge type={r.type} />, sort: (r) => r.type },
    { id: 'status', header: 'Status', cell: (r) => <ChangeStatusBadge status={r.status} />, sort: (r) => r.status },
    ...(feeOn ? [{
      id: 'fee', header: 'Correction fee', cell: (r: ChangeRequest) => (
        <div>
          <FeeBadge fee={r.fee} />
          {r.fee && r.fee.state !== 'waived' && <p className="mt-0.5 whitespace-nowrap text-xs text-muted">{formatMoney(r.fee.total, r.fee.currency)}</p>}
        </div>
      ),
    } as Column<ChangeRequest>] : []),
    ...(isAe ? [{
      id: 'elig', header: 'Your next step', mobileHide: false, cell: (r: ChangeRequest) => {
        const why = workBlockReason(r)
        if (!why) return r.assigneeId === user?.id ? <Badge tone="success">Prepare new version</Badge> : <span className="text-sm text-muted">Assigned to another Associate Editor</span>
        return <span className="text-sm text-muted">{why}</span>
      },
    } as Column<ChangeRequest>] : [{ id: 'reason', header: 'Reason', cell: (r: ChangeRequest) => <p className="line-clamp-2 max-w-[320px] text-sm text-muted" title={r.reason}>{r.reason}</p>, mobileHide: true } as Column<ChangeRequest>]),
    ...(isSupport ? [] : [{ id: 'by', header: 'Requested by', cell: (r: ChangeRequest) => r.requestedBy, sort: (r: ChangeRequest) => r.requestedBy } as Column<ChangeRequest>]),
    { id: 'assignee', header: 'Assigned to', cell: (r) => users.find((u) => u.id === r.assigneeId)?.name ?? <span className="text-faint">—</span>, defaultHidden: true },
    { id: 'at', header: 'Raised', cell: (r) => <RelativeTime value={r.requestedAt} />, sort: (r) => r.requestedAt },
  ]

  const description = isSupport
    ? 'Raise a request when an author asks for a change to a published article, and follow its progress. You see the requests you raised.'
    : isAe
      ? 'Corrections the Editor has approved. You can start once any correction fee is paid or waived; others are shown read-only.'
      : 'Review requests raised by Support, set or waive the correction fee, and approve new versions before they go live.'

  return (
    <>
      <PageHeader title="Post corrections" description={description}
        actions={<GuardedButton allowed={raise.can} why={raise.why} className="btn-primary" onClick={() => navigate('/post-publication/new')}><Plus size={15} aria-hidden /> {isSupport ? 'Raise a request for an author' : 'New request'}</GuardedButton>} />
      {(isAe && waitingForMe > 0) && <p role="status" className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">{waitingForMe} correction(s) are ready for you to prepare.</p>}
      {(toDecide > 0) && <p role="status" className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">{toDecide} request(s) need your decision.</p>}
      <DataTable<ChangeRequest>
        id="post-pub" data={rows} columns={columns} rowKey={(r) => r.id} loading={q.loading} error={!!q.error} onRetry={q.reload}
        onRowClick={(r) => navigate(`/post-publication/${r.id}`)}
        search={{ placeholder: 'Search by request, Paper ID or reason', text: (r) => `${r.id} ${r.paperId} ${titleOf(r.paperId)} ${r.reason} ${r.requestedBy}` }}
        filters={<>
          <SelectFilter label="Status" value={state} onChange={setState} options={[{ value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' }]} />
          <SelectFilter label="Stage" value={status} onChange={setStatus} options={Object.entries(CHANGE_STATUS_META).map(([value, m]) => ({ value, label: m.label }))} />
          <SelectFilter label="Type" value={type} onChange={setType} options={(Object.keys(CHANGE_TYPE_META) as ChangeType[]).map((value) => ({ value, label: CHANGE_TYPE_META[value].label }))} />
        </>}
        empty={{
          icon: FilePenLine,
          title: isAe ? 'No approved corrections yet' : isSupport ? 'You have not raised any requests' : 'No change requests',
          hint: isAe ? 'Corrections appear here after the Editor approves them.' : 'Raise a request when a published article needs a correction, an erratum or a retraction.',
          action: raise.can ? <Link to="/post-publication/new" className="btn-primary">Raise a request</Link> : undefined,
        }}
      />
    </>
  )
}
