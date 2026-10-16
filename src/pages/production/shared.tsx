import { useMemo } from 'react'
import { useDataStore } from '@/mock/store'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { Author, Paper } from '@/shared/types'
import { formatDate } from '@/shared/formatters'
import type { Block } from '@/mock/data/production'

/** Title cell: wraps to two lines, full title on hover. */
export function PaperTitle({ paper, to }: { paper: Paper; to?: string }) {
  return (
    <div className="min-w-0">
      {to ? (
        <Link to={to} className="whitespace-nowrap font-medium text-accent hover:underline">{paper.id}</Link>
      ) : (
        <span className="whitespace-nowrap font-medium">{paper.id}</span>
      )}
      <p className="line-clamp-2 max-w-[420px] text-sm text-muted" title={paper.title}>{paper.title}</p>
    </div>
  )
}

/** Schematic figure used in place of the author's uploaded image. */
export function FigureMock({ alt, className }: { alt: string; className?: string }) {
  return (
    <svg role="img" aria-label={alt} viewBox="0 0 480 170" className={cn('w-full rounded-md border border-line bg-slate-50', className)}>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="24" y={18 + i * 46} width="140" height="34" rx="6" fill="#EEF2FF" stroke="#A5B4FC" />
          <text x="94" y={40 + i * 46} textAnchor="middle" fontSize="12" fill="#3730A3">Factor {String.fromCharCode(65 + i)}</text>
          <path d={`M164 ${35 + i * 46} L300 ${(i - 1) * 8 + 85}`} stroke="#94A3B8" strokeWidth="1.5" markerEnd="url(#arr)" />
        </g>
      ))}
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#94A3B8" /></marker>
      </defs>
      <rect x="300" y="62" width="150" height="46" rx="8" fill="#4F46E5" />
      <text x="375" y="90" textAnchor="middle" fontSize="13" fontWeight="600" fill="#fff">Outcome</text>
      <rect x="318" y="132" width="114" height="24" rx="12" fill="#F1F5F9" stroke="#CBD5E1" />
      <text x="375" y="148" textAnchor="middle" fontSize="11" fill="#475569">Context (moderator)</text>
      <path d="M375 132 L375 110" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arr)" />
    </svg>
  )
}

/** Read-only rendering of article blocks (used by the manuscript and article-page previews). */
export function BlocksView({ blocks, serif }: { blocks: Block[]; serif?: boolean }) {
  return (
    <div className={cn('space-y-3', serif && 'font-serif')}>
      {blocks.map((b) => {
        switch (b.kind) {
          case 'heading':
            return <h3 key={b.id} className="pt-2 text-base font-semibold text-slate-900">{b.text}</h3>
          case 'paragraph':
            return <p key={b.id} className="text-[13.5px] leading-6 text-slate-800">{b.text}</p>
          case 'table':
            return (
              <figure key={b.id} className="overflow-x-auto">
                <figcaption className="mb-1 text-xs font-medium text-slate-700">{b.caption}</figcaption>
                <table className="w-full border-collapse text-xs">
                  <thead><tr>{b.header.map((h) => <th key={h} scope="col" className="border-y border-slate-400 px-2 py-1 text-left font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cn('border-b border-slate-200 px-2 py-1', j > 0 && 'tabular-nums')}>{c}</td>)}</tr>)}</tbody>
                </table>
              </figure>
            )
          case 'figure':
            return (
              <figure key={b.id}>
                <FigureMock alt={b.alt} />
                <figcaption className="mt-1 text-xs text-slate-600">{b.caption}</figcaption>
              </figure>
            )
        }
      })}
    </div>
  )
}

export function AuthorsLine({ authors }: { authors: Author[] }) {
  return <>{authors.map((a, i) => <span key={a.email + i}>{i > 0 && ', '}{a.name || 'Unnamed author'}<sup>{i + 1}</sup></span>)}</>
}

/** Changes whenever any paper's status changes, so useAsync lists refresh after a mutation elsewhere. */
export function usePapersKey(): string {
  const papers = useDataStore((s) => s.papers)
  return useMemo(() => papers.map((p) => `${p.id}:${p.status}`).join(','), [papers])
}

/** The assigned Issue Publication Date: the only date shown once an article goes live. */
export function IssueVsOnline({ issueDate }: { issueDate: string; onlineDate?: string }) {
  return (
    <dl className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <dt className="text-xs text-amber-900">Issue publication date (shown on the article)</dt>
      <dd className="mt-0.5 text-sm font-semibold text-amber-950">{formatDate(issueDate)}</dd>
      <dd className="mt-1 text-xs text-amber-900">The article carries this date everywhere, including Crossref. Today’s date is not used.</dd>
    </dl>
  )
}
