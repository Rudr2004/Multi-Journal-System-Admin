import { Link } from 'react-router-dom'
import type { Paper } from '@/shared/types'
import { JournalBadge, StatusBadge } from '@/components/Badges'
import { Skeleton } from '@/components/States'

export const TH = 'sticky top-0 bg-surface px-4 py-2 text-left text-xs font-medium text-muted'
export const TD = 'px-4 align-top'

export function TitleCell({ paper }: { paper: Paper }) {
  return (
    <div className="min-w-0">
      <Link to={`/submissions/${paper.id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{paper.id}</Link>
      <p className="line-clamp-2 max-w-[460px] text-sm text-muted" title={paper.title}>{paper.title}</p>
    </div>
  )
}

export function PaperTable({ papers, showJournal, extra, extraLabel }: {
  papers: Paper[]
  showJournal?: boolean
  extraLabel: string
  extra: (p: Paper) => React.ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className={TH}>Paper</th>
            {showJournal && <th className={TH}>Journal</th>}
            <th className={TH}>Status</th>
            <th className={TH}>{extraLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {papers.map((p) => (
            <tr key={p.id} className="hover:bg-page">
              <td className={TD} style={{ paddingBlock: 'var(--cell-py)' }}><TitleCell paper={p} /></td>
              {showJournal && <td className={TD} style={{ paddingBlock: 'var(--cell-py)' }}><JournalBadge code={p.journal} /></td>}
              <td className={TD} style={{ paddingBlock: 'var(--cell-py)' }}><StatusBadge status={p.status} /></td>
              <td className={TD} style={{ paddingBlock: 'var(--cell-py)' }}>{extra(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  )
}
