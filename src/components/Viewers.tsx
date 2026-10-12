import { FileText, ZoomIn, ZoomOut } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/** Mock "scanned proof" image (inline SVG) with zoom — stands in for an uploaded payment screenshot. */
export function ProofViewer({ caption, reference, amount, date }: { caption: string; reference: string; amount: string; date: string }) {
  const [zoom, setZoom] = useState(1)
  return (
    <figure className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line bg-page px-3 py-2">
        <figcaption className="text-xs font-medium text-muted">{caption}</figcaption>
        <div className="flex gap-1">
          <button aria-label="Zoom out" className="btn-ghost !h-7 !w-7 !px-0" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}><ZoomOut size={14} /></button>
          <button aria-label="Zoom in" className="btn-ghost !h-7 !w-7 !px-0" onClick={() => setZoom((z) => Math.min(2, z + 0.2))}><ZoomIn size={14} /></button>
        </div>
      </div>
      <div className="max-h-[380px] overflow-auto bg-slate-100 p-4">
        <svg role="img" aria-label={`${caption}: ${amount}, reference ${reference}`} viewBox="0 0 320 420" style={{ width: 280 * zoom, margin: '0 auto', display: 'block' }} className="rounded-md bg-white shadow">
          <rect width="320" height="56" fill="#4F46E5" />
          <text x="20" y="35" fill="#fff" fontSize="16" fontWeight="600">Payment successful</text>
          <circle cx="160" cy="110" r="26" fill="#DCFCE7" />
          <path d="M148 110l9 9 16-18" stroke="#16A34A" strokeWidth="4" fill="none" strokeLinecap="round" />
          <text x="160" y="170" textAnchor="middle" fontSize="26" fontWeight="700" fill="#0F172A">{amount}</text>
          {[['Reference / UTR', reference], ['Date', date], ['Status', 'Completed'], ['Paid to', 'EdTech Publishers Pvt. Ltd.']].map(([k, v], i) => (
            <g key={k} transform={`translate(24 ${220 + i * 44})`}>
              <text fontSize="11" fill="#64748B">{k}</text>
              <text y="18" fontSize="13" fill="#0F172A" fontWeight="500">{v}</text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  )
}

/** Generic file row with version label. */
export function FileRow({ name, meta, action }: { name: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
      <FileText size={18} strokeWidth={1.5} className="shrink-0 text-faint" aria-hidden />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p>{meta && <p className="text-xs text-muted">{meta}</p>}</div>
      {action}
    </div>
  )
}

/** Mock document preview (Word / PDF page) used where a real file viewer would go. */
export function DocPreview({ title, lines = 9, className }: { title: string; lines?: number; className?: string }) {
  return (
    <div aria-label={`Preview of ${title}`} className={cn('rounded-lg border border-line bg-white p-6 shadow-sm', className)}>
      <p className="text-center text-base font-semibold leading-snug">{title}</p>
      <div className="mt-4 space-y-2" aria-hidden>
        {Array.from({ length: lines }).map((_, i) => <div key={i} className="h-2 rounded bg-slate-200" style={{ width: `${70 + ((i * 17) % 30)}%` }} />)}
      </div>
    </div>
  )
}
