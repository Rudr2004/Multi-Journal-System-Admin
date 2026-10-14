import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, History, Info } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { DataTable, type Column } from '@/components/DataTable'
import { DueChip } from '@/components/Due'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { useCurrentUser } from '@/permissions/hooks'
import { dueOf, listBackdatedInProduction } from '@/mock/api/production'
import type { BackdatedItem } from '@/mock/data/production'
import type { Paper } from '@/shared/types'
import { formatDate } from '@/shared/formatters'
import { useDataStore } from '@/mock/store'
import { useProductionStore } from '@/mock/stores/production'
import { PaperTitle } from './shared'

type Row = BackdatedItem & { paper: Paper }

/** Associate Editor: only the production step of backdated items. Finding, re-accepting and choosing the issue belong to the Editor. */
export function BackdatedProductionView() {
  const navigate = useNavigate()
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const user = useCurrentUser()
  const bd = useProductionStore((s) => s.backdated)
  const papers = useDataStore((s) => s.papers)
  const key = bd.map((b) => b.id + b.status).join()
  const q = useAsync(() => listBackdatedInProduction(journals, user?.id), [journals.join(','), user?.id, key, papers])

  const columns: Column<Row>[] = [
    { id: 'paper', header: 'Article', locked: true, cell: (r) => <PaperTitle paper={r.paper} to={`/production/${r.paper.id}`} />, sort: (r) => r.paper.id },
    ...(all ? [{ id: 'journal', header: 'Journal', cell: (r: Row) => <JournalBadge code={r.journal} /> } as Column<Row>] : []),
    { id: 'issue', header: 'Issue (date)', cell: (r) => <span className="whitespace-nowrap">{r.issueLabel} · {formatDate(r.issueDate)}</span>, sort: (r) => r.issueDate },
    { id: 'status', header: 'Production status', cell: (r) => <StatusBadge status={r.paper.status} /> },
    { id: 'due', header: 'Due', cell: (r) => (r.paper.status === 'ready_for_approval' ? <Badge tone="accent">With the Editor</Badge> : <DueChip value={dueOf(r.paper)} />) },
    { id: 'open', header: '', cell: (r) => <Link to={`/production/${r.paper.id}`} className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline">Open production workspace <ArrowRight size={13} aria-hidden /></Link> },
  ]

  return (
    <>
      <PageHeader title="Backdated publications" description="Backdated articles that are in production and assigned to you." />
      <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        Editors handle finding, re-accepting and choosing the issue; you complete production. Finish the workspace as for any article, then send it for final approval.
      </p>
      <DataTable<Row>
        id="backdated-production" data={q.data ?? []} columns={columns} rowKey={(r) => r.id} loading={q.loading && !q.data} error={!!q.error} onRetry={q.reload}
        onRowClick={(r) => navigate(`/production/${r.paper.id}`)}
        search={{ placeholder: 'Search by Paper ID or title', text: (r) => `${r.paper.id} ${r.paper.title}` }}
        empty={{ icon: History, title: 'No backdated articles in production', hint: 'When an Editor moves a backdated article to production for your journal, it appears here.' }}
      />
    </>
  )
}
