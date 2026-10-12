import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { GuardedButton } from '@/components/Tooltip'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { formatDate } from '@/shared/formatters'
import { AWARD_TYPE_LABEL, CYCLE_LABEL, CYCLE_STATUSES, type AwardCycle } from '@/mock/data/website'
import { listCycles } from '@/mock/api/awards'
import { useJournalKey } from '../shared'
import { CycleDialog } from './CycleDialog'
import { CycleStatusBadge } from './parts'

export default function AwardsPage() {
  const { journals, key } = useJournalKey()
  const all = useIsAllJournals()
  const navigate = useNavigate()
  const { can, why } = usePermission('awards')
  const { data, loading, error, reload } = useAsync(() => listCycles(journals), [key])
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [creating, setCreating] = useState(false)
  const rows = useMemo(() => (data ?? []).filter((c) => (!status || c.status === status) && (!type || c.type === type)), [data, status, type])

  const columns: Column<AwardCycle>[] = [
    { id: 'name', header: 'Cycle', locked: true, sort: (c) => c.name.toLowerCase(), cell: (c) => <span className="font-medium text-accent">{c.name}</span> },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (c: AwardCycle) => c.journal, cell: (c: AwardCycle) => <JournalBadge code={c.journal} /> }] : []),
    { id: 'type', header: 'Award', sort: (c) => c.type, cell: (c) => <Badge tone="accent">{AWARD_TYPE_LABEL[c.type]}</Badge> },
    { id: 'period', header: 'Period', sort: (c) => c.periodStart, cell: (c) => <span className="whitespace-nowrap text-sm">{formatDate(c.periodStart)} to {formatDate(c.periodEnd)}</span> },
    { id: 'shortlist', header: 'Shortlisted', align: 'right', sort: (c) => c.nominations.length, cell: (c) => <span className="tabular-nums">{c.nominations.length}</span> },
    { id: 'winners', header: 'Winners', align: 'right', sort: (c) => c.nominations.filter((n) => n.winner).length, cell: (c) => <span className="tabular-nums">{c.nominations.filter((n) => n.winner).length}</span> },
    { id: 'status', header: 'Status', sort: (c) => CYCLE_STATUSES.indexOf(c.status), cell: (c) => <CycleStatusBadge status={c.status} /> },
  ]

  return (
    <>
      <PageHeader title="Awards" description="Run Best Paper and Best Research Mentor cycles from nominations to the published Awards page."
        actions={<GuardedButton allowed={can('manage') && journals.length > 0} why={why('manage')} className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} strokeWidth={1.5} aria-hidden /> New cycle</GuardedButton>} />
      <DataTable<AwardCycle>
        id="award-cycles" data={rows} columns={columns} rowKey={(c) => c.id} loading={loading && !data} error={!!error} onRetry={reload}
        onRowClick={(c) => navigate(`/awards/${c.id}`)}
        search={{ placeholder: 'Search cycles…', text: (c) => `${c.name} ${c.journal}` }}
        filters={<>
          <SelectFilter label="Status" value={status} onChange={setStatus} options={CYCLE_STATUSES.map((s) => ({ value: s, label: CYCLE_LABEL[s] }))} />
          <SelectFilter label="Award" value={type} onChange={setType} options={Object.entries(AWARD_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        </>}
        empty={{ icon: Trophy, title: 'No award cycles yet', hint: 'Create a cycle to start collecting nominations.', action: <button className="btn-primary" onClick={() => setCreating(true)}>New cycle</button> }}
      />
      {creating && <CycleDialog journals={journals} onClose={() => setCreating(false)} onDone={(c) => { reload(); if (c) navigate(`/awards/${c.id}`) }} />}
    </>
  )
}
