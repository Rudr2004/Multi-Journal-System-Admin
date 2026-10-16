import { Download } from 'lucide-react'
import { toast } from '@/components/Toasts'
import type { ProductionRecord } from '@/mock/data/production'
import { BlocksView } from '../shared'

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Word-compatible copy of the author's submission, so formatting can start offline. */
function downloadManuscript(record: ProductionRecord) {
  const m = record.manuscript
  const body = m.blocks.map((b) => {
    if (b.kind === 'heading') return `<h2>${esc(b.text)}</h2>`
    if (b.kind === 'paragraph') return `<p>${esc(b.text)}</p>`
    if (b.kind === 'figure') return `<p><i>[Figure] ${esc(b.caption)}</i></p>`
    return `<p><b>${esc(b.caption)}</b></p><table border="1" cellspacing="0" cellpadding="4"><tr>${b.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
  }).join('')
  const html = `<html><head><meta charset="utf-8"><title>${esc(m.title)}</title></head><body><h1>${esc(m.title)}</h1><p><i>${esc(m.authors.join(', '))}</i></p><h2>Abstract</h2><p>${esc(m.abstract)}</p>${body}</body></html>`
  const url = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }))
  const a = document.createElement('a')
  a.href = url
  a.download = m.fileName.replace(/\.docx?$/i, '') + '.doc'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.success(`${m.fileName} downloaded. Start formatting from this copy.`)
}

/** Mock Word view of the author's original submission (read-only, never edited in production). */
export function ManuscriptPane({ record }: { record: ProductionRecord }) {
  const m = record.manuscript
  return (
    <section aria-label="Original Word manuscript" className="card flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line bg-page px-4 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-xs font-bold text-white" aria-hidden>W</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{m.fileName}</p>
          <p className="text-xs text-muted">Original submission · version {m.version} · {m.pageCount} pages · {m.wordCount.toLocaleString('en-IN')} words</p>
        </div>
        <button type="button" className="btn-secondary !h-8 shrink-0" onClick={() => downloadManuscript(record)}><Download size={14} aria-hidden /> Download</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-4" tabIndex={0} aria-label="Manuscript pages">
        <article className="mx-auto max-w-[620px] bg-white px-10 py-9 font-serif shadow">
          <h2 className="text-center text-lg font-bold leading-snug text-slate-900">{m.title}</h2>
          <p className="mt-2 text-center text-[13px] italic text-slate-700">{m.authors.join(', ')}</p>
          <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-slate-900">Abstract</h3>
          <p className="mt-1 text-justify text-[13.5px] leading-6 text-slate-800">{m.abstract}</p>
          <div className="mt-4"><BlocksView blocks={m.blocks} serif /></div>
          <p className="mt-6 border-t border-slate-200 pt-2 text-center text-[11px] text-slate-500">Page 1 of {m.pageCount}</p>
        </article>
      </div>
    </section>
  )
}
