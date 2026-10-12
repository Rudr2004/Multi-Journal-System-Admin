import { useState } from 'react'
import { CheckCircle2, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { wordCount, type CheckItem, type ProductionRecord } from '@/mock/data/production'

export type Draft = Pick<ProductionRecord, 'title' | 'authors' | 'abstract' | 'keywords' | 'references' | 'blocks' | 'seo' | 'returnAcknowledged'>

function Editor({ item, draft, update }: { item: CheckItem; draft: Draft; update: (p: Partial<Draft>) => void }) {
  switch (item.key) {
    case 'title':
      return (
        <label className="block"><span className="label">Article title</span>
          <textarea rows={2} className="input !h-auto py-2" value={draft.title} onChange={(e) => update({ title: e.target.value })} /></label>
      )
    case 'authors':
      return (
        <div className="space-y-2">
          {draft.authors.map((a, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input aria-label={`Author ${i + 1} full name`} placeholder="Full name" className="input" value={a.name} onChange={(e) => update({ authors: draft.authors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input aria-label={`Author ${i + 1} email`} placeholder="Email" type="email" className="input" value={a.email} onChange={(e) => update({ authors: draft.authors.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)) })} />
              <button type="button" aria-label={`Remove author ${i + 1}`} className="btn-ghost !w-9 !px-0 hover:!text-red-600" disabled={draft.authors.length <= 1} onClick={() => update({ authors: draft.authors.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
            </div>
          ))}
          <button type="button" className="btn-secondary !h-8" onClick={() => update({ authors: [...draft.authors, { name: '', email: '', affiliation: '', country: '' }] })}><Plus size={14} aria-hidden /> Add author</button>
        </div>
      )
    case 'affiliations':
      return (
        <div className="space-y-2">
          {draft.authors.map((a, i) => (
            <label key={i} className="block"><span className="label">{a.name || `Author ${i + 1}`}</span>
              <input className="input" placeholder="Department, institution, city" value={a.affiliation} onChange={(e) => update({ authors: draft.authors.map((x, j) => (j === i ? { ...x, affiliation: e.target.value } : x)) })} /></label>
          ))}
        </div>
      )
    case 'abstract':
      return (
        <label className="block"><span className="label">Abstract</span>
          <textarea rows={7} className="input !h-auto py-2 leading-6" value={draft.abstract} onChange={(e) => update({ abstract: e.target.value })} />
          <span className="mt-0.5 block text-right text-xs tabular-nums text-muted">{wordCount(draft.abstract)} words</span></label>
      )
    case 'keywords':
      return (
        <label className="block"><span className="label">Keywords (comma separated, 3–8)</span>
          <input className="input" value={draft.keywords.join(', ')} onChange={(e) => update({ keywords: e.target.value.split(',').map((k) => k.trimStart()) })} onBlur={() => update({ keywords: draft.keywords.map((k) => k.trim()).filter(Boolean) })} />
          <span className="mt-1 flex flex-wrap gap-1">{draft.keywords.filter((k) => k.trim()).map((k) => <span key={k} className="rounded-full bg-subtle px-2 py-0.5 text-xs">{k.trim()}</span>)}</span></label>
      )
    case 'references':
      return (
        <label className="block"><span className="label">References (one per line)</span>
          <textarea rows={9} className="input !h-auto py-2 text-sm leading-5" value={draft.references.join('\n')} onChange={(e) => update({ references: e.target.value.split('\n') })} onBlur={() => update({ references: draft.references.filter((r) => r.trim()) })} />
          <span className="mt-0.5 block text-right text-xs tabular-nums text-muted">{draft.references.filter((r) => r.trim()).length} references</span></label>
      )
  }
}

/** Pass/fail checklist; every row can be fixed inline. */
export function MetadataChecklist({ items, draft, update, readOnly }: { items: CheckItem[]; draft: Draft; update: (p: Partial<Draft>) => void; readOnly: boolean }) {
  const [open, setOpen] = useState<string | null>(() => items.find((i) => !i.pass)?.key ?? null)
  const failing = items.filter((i) => !i.pass).length
  return (
    <div>
      <p role="status" className={cn('mb-3 text-sm', failing ? 'text-amber-800' : 'text-green-700')}>
        {failing ? `${failing} of ${items.length} checks need attention before this paper can be sent for approval.` : 'All metadata checks pass.'}
      </p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {items.map((it) => {
          const expanded = open === it.key
          return (
            <li key={it.key} className={cn('p-3', !it.pass && 'bg-red-50/40')}>
              <div className="flex items-start gap-3">
                {it.pass ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-600" aria-label="Pass" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-red-600" aria-label="Fail" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{it.label}</p>
                  <p className={cn('text-xs', it.pass ? 'text-muted' : 'text-red-700')}>{it.detail}</p>
                </div>
                <button type="button" className="btn-secondary !h-8" aria-expanded={expanded} aria-controls={`chk-${it.key}`} disabled={readOnly && !expanded} onClick={() => setOpen(expanded ? null : it.key)}>
                  <Pencil size={13} aria-hidden /> {expanded ? 'Done' : readOnly ? 'View' : 'Edit'}
                </button>
              </div>
              {expanded && <div id={`chk-${it.key}`} className="mt-3 pl-7"><fieldset disabled={readOnly} className="min-w-0"><Editor item={it} draft={draft} update={update} /></fieldset></div>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
