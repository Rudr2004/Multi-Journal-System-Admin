import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTip, XAxis, YAxis } from 'recharts'
import type { Paper, Role } from '@/shared/types'
import { useRole } from '@/permissions/hooks'
import { paperStagePath } from '@/lib/paperRoutes'
import { JournalBadge, StatusBadge } from '@/components/Badges'
import { Skeleton } from '@/components/States'
import { CHART_COLORS } from '@/styles/tokens'

export const TH = 'sticky top-0 bg-surface px-4 py-2 text-left text-xs font-medium text-muted'
export const TD = 'px-4 align-top'
export const CELL = { paddingBlock: 'var(--cell-py)' } as const
export const LINK = 'text-sm font-medium text-accent hover:underline'

/** Where a paper opens for each role (Associate Editor works it in production, reviewers in My reviews). */
export function paperPath(role: Role | undefined, id: string): string {
  switch (role) {
    case 'ASSOCIATE_EDITOR': return `/production/${id}`
    case 'REVIEWER':
    case 'REVIEW_PANEL_MEMBER': return `/my-reviews/${id}`
    default: return `/submissions/${id}`
  }
}

export function TitleCell({ paper }: { paper: Paper }) {
  const role = useRole()
  return (
    <div className="min-w-0">
      <Link to={paperStagePath(role, paper)} className="whitespace-nowrap font-medium text-accent hover:underline">{paper.id}</Link>
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
              <td className={TD} style={CELL}><TitleCell paper={p} /></td>
              {showJournal && <td className={TD} style={CELL}><JournalBadge code={p.journal} /></td>}
              <td className={TD} style={CELL}><StatusBadge status={p.status} /></td>
              <td className={TD} style={CELL}>{extra(p)}</td>
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

/** Bar chart of papers per stage with a text alternative. */
export function StageChart({ data, noun = 'Papers' }: { data: { label: string; count: number }[]; noun?: string }) {
  return (
    <figure aria-label={`${noun} per stage: ${data.map((p) => `${p.label} ${p.count}`).join(', ')}`}>
      <div className="h-[240px]" role="img" aria-label={`Bar chart of ${noun.toLowerCase()} per stage`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#475569' }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#475569' }} />
            <ChartTip cursor={{ fill: '#F1F5F9' }} contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} formatter={(v) => [v, noun]} />
            <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={48} label={{ position: 'top', fontSize: 12, fill: '#0F172A' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export function ScholarCard({ rate, loading, all }: { rate?: number; loading: boolean; all: boolean }) {
  return (
    <>
      {loading || rate === undefined ? <div className="h-12 animate-pulse rounded bg-slate-100" /> : (
        <>
          <div className="text-3xl font-semibold tracking-tight">{rate.toFixed(1)}%</div>
          <p className="mt-1 text-sm text-muted">of published articles are indexed{all ? ' (average across journals)' : ''}.</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={Math.round(rate)} aria-valuemin={0} aria-valuemax={100} aria-label="Scholar indexing rate">
            <div className="h-full rounded-full bg-accent" style={{ width: `${rate}%` }} />
          </div>
        </>
      )}
    </>
  )
}
