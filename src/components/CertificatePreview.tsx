import { formatDate } from '@/shared/formatters'
import { JOURNAL_COLORS } from '@/styles/tokens'
import { journalByCode } from '@/mock/data/core'
import type { JournalCode } from '@/shared/types'

/** Deterministic QR-like pattern. In production the QR encodes the published article URL. */
function QrMock({ seed, size = 72 }: { seed: string; size?: number }) {
  const n = 21
  let h = [...seed].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381)
  const cells: boolean[] = []
  for (let i = 0; i < n * n; i++) { h = (h * 1103515245 + 12345) >>> 0; cells.push((h >> 16) % 3 !== 0) }
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8)
  return (
    <svg role="img" aria-label="QR code linking to the published article" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      {cells.map((on, i) => { const x = i % n, y = Math.floor(i / n); return on && !finder(x, y) ? <rect key={i} x={x} y={y} width="1" height="1" fill="#0F172A" /> : null })}
      {[[0, 0], [n - 7, 0], [0, n - 7]].map(([x, y]) => (
        <g key={`${x}${y}`}><rect x={x} y={y} width="7" height="7" fill="#0F172A" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#0F172A" /></g>
      ))}
    </svg>
  )
}

export function CertificatePreview({ authorName, paperTitle, paperId, journal, date, doi }: {
  authorName: string; paperTitle: string; paperId: string; journal: JournalCode; date: string; doi: string
}) {
  const j = journalByCode(journal)
  return (
    <div role="img" aria-label={`Certificate of publication for ${authorName}`} className="relative aspect-[1.414/1] w-full overflow-hidden rounded-lg border-4 border-double border-slate-300 bg-white p-6 text-center shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: JOURNAL_COLORS[journal] }} />
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{j.name}</p>
      <h3 className="mt-3 font-serif text-2xl font-semibold text-slate-900">Certificate of Publication</h3>
      <p className="mt-3 text-xs text-slate-500">This is to certify that</p>
      <p className="mt-1 font-serif text-xl font-semibold text-slate-900">{authorName}</p>
      <p className="mx-auto mt-2 max-w-[85%] text-xs leading-5 text-slate-600">has published the paper “{paperTitle}” in {j.code}.</p>
      <div className="absolute inset-x-6 bottom-5 flex items-end justify-between text-left text-[10px] text-slate-500">
        <div><p>Paper ID: <span className="font-medium text-slate-800">{paperId}</span></p><p>DOI: <span className="font-medium text-slate-800">{doi}</span></p><p>Date: {formatDate(date)}</p></div>
        <QrMock seed={paperId} />
      </div>
    </div>
  )
}
