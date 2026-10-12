import { useNavigate } from 'react-router-dom'
import { BadgeCheck, CheckCircle2, AlertCircle, History } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { RelativeTime } from '@/components/Time'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { listApprovalQueue, type ApprovalRow } from '@/mock/api/production'
import { PaperTitle, usePapersKey } from './shared'

export function FinalApprovalListPage() {
  const navigate = useNavigate()
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const key = usePapersKey()
  const q = useAsync(() => listApprovalQueue(journals), [journals.join(','), key])

  const columns: Column<ApprovalRow>[] = [
    { id: 'paper', header: 'Paper', locked: true, cell: (r) => <PaperTitle paper={r.paper} to={`/final-approval/${r.paper.id}`} />, sort: (r) => r.paper.id },
    ...(all ? [{ id: 'journal', header: 'Journal', cell: (r: ApprovalRow) => <JournalBadge code={r.paper.journal} />, sort: (r: ApprovalRow) => r.paper.journal } as Column<ApprovalRow>] : []),
    { id: 'type', header: 'Type', cell: (r) => (r.backdated ? <Badge tone="warning"><History size={12} aria-hidden /> Backdated · {r.backdated.issueLabel}</Badge> : <span className="text-muted">Regular</span>), sort: (r) => (r.backdated ? 1 : 0) },
    { id: 'sent', header: 'Sent for approval', cell: (r) => (r.sentAt ? <RelativeTime value={r.sentAt} /> : '—'), sort: (r) => r.sentAt },
    { id: 'by', header: 'Prepared by', cell: (r) => r.assigneeName ?? <span className="text-faint">—</span>, sort: (r) => r.assigneeName ?? '' },
    { id: 'checks', header: 'Checks', cell: (r) => (r.missing === 0 ? <Badge tone="success"><CheckCircle2 size={12} aria-hidden /> All pass</Badge> : <Badge tone="warning"><AlertCircle size={12} aria-hidden /> {r.missing} open</Badge>), sort: (r) => r.missing },
  ]

  return (
    <>
      <PageHeader title="Final approval" description="Papers sent by production. Check the article page, choose an issue and publish, or return the paper with a note." />
      <DataTable<ApprovalRow>
        id="final-approval"
        data={q.data ?? []}
        columns={columns}
        rowKey={(r) => r.paper.id}
        loading={q.loading}
        error={!!q.error}
        onRetry={q.reload}
        onRowClick={(r) => navigate(`/final-approval/${r.paper.id}`)}
        search={{ placeholder: 'Search by Paper ID or title', text: (r) => `${r.paper.id} ${r.paper.title}` }}
        empty={{ icon: BadgeCheck, title: 'Nothing is waiting for approval', hint: 'Papers appear here when the Associate Editor sends them for final approval.' }}
      />
    </>
  )
}
