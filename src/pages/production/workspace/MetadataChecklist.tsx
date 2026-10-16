import { useState } from 'react'
import { CheckCircle2, ImagePlus, Pencil, Plus, Trash2, XCircle } from 'lucide-react'
import { toast } from '@/components/Toasts'
import { UserAvatar } from '@/components/UserAvatar'
import { cn } from '@/lib/utils'
import { wordCount, type CheckItem, type ProductionRecord } from '@/mock/data/production'

export type Draft = Pick<ProductionRecord, 'title' | 'authors' | 'abstract' | 'keywords' | 'references' | 'blocks' | 'seo' | 'returnAcknowledged' | 'citeInPrint'>

type Original = ProductionRecord['manuscript']
type Patch = (p: Partial<Draft>) => void

function CopyOriginal({ label, text, onUse }: { label: string; text: string; onUse: () => void }) {
  return (
    <div className="mb-2 rounded-md border border-dashed border-line bg-subtle px-3 py-2 text-xs">
      <p className="font-medium text-muted">{label}</p>
      <p className="mt-0.5 line-clamp-3 text-ink">{text}</p>
      <button type="button" className="mt-1 text-accent hover:underline" onClick={onUse}>Copy into the field below</button>
    </div>
  )
}

function readPhoto(file: File, done: (url: string) => void) {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast.error('Choose a PNG, JPG or WebP image.'); return }
  if (file.size > 2 * 1024 * 1024) { toast.error('The photo must be under 2 MB.'); return }
  const r = new FileReader()
  r.onload = () => done(String(r.result))
  r.readAsDataURL(file)
}

export function AuthorCards({ authors, onChange }: { authors: Draft['authors']; onChange: (a: Draft['authors']) => void }) {
  const set = (i: number, p: Partial<Draft['authors'][number]>) => onChange(authors.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="space-y-3">
      {authors.map((a, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface p-3">
          <div className="flex items-start gap-3">
            <UserAvatar name={a.name || `Author ${i + 1}`} photo={a.photo} size={52} />
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <input aria-label={`Author ${i + 1} full name`} placeholder="Full name" className="input" value={a.name} onChange={(e) => set(i, { name: e.target.value })} />
              <input aria-label={`Author ${i + 1} email`} placeholder="Email" type="email" className="input" value={a.email} onChange={(e) => set(i, { email: e.target.value })} />
              <input aria-label={`Author ${i + 1} affiliation`} placeholder="Department, institution, city" className="input sm:col-span-2" value={a.affiliation} onChange={(e) => set(i, { affiliation: e.target.value })} />
              <input aria-label={`Author ${i + 1} country`} placeholder="Country" className="input" value={a.country} onChange={(e) => set(i, { country: e.target.value })} />
              <input aria-label={`Author ${i + 1} ORCID iD`} placeholder="ORCID iD (0000-0000-0000-0000)" className="input font-mono" value={a.orcid ?? ''} onChange={(e) => set(i, { orcid: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <label className="btn-secondary !h-8 cursor-pointer"><ImagePlus size={14} aria-hidden /> {a.photo ? 'Change photo' : 'Add photo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Author ${i + 1} profile photo`} onChange={(e) => { const f = e.target.files?.[0]; if (f) readPhoto(f, (url) => set(i, { photo: url })); e.target.value = '' }} /></label>
                {a.photo && <button type="button" className="btn-ghost !h-8 hover:!text-red-600" onClick={() => set(i, { photo: undefined })}><Trash2 size={14} aria-hidden /> Delete photo</button>}
                <button type="button" aria-label={`Remove author ${i + 1}`} className="btn-ghost !h-8 ml-auto hover:!text-red-600" disabled={authors.length <= 1} onClick={() => onChange(authors.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden /> Remove author</button>
              </div>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary !h-8" onClick={() => onChange([...authors, { name: '', email: '', affiliation: '', country: '' }])}><Plus size={14} aria-hidden /> Add author</button>
    </div>
  )
}

function Editor({ item, draft, update, original }: { item: CheckItem; draft: Draft; update: Patch; original?: Original }) {
  switch (item.key) {
    case 'title':
      return (
        <div>
          {original && original.title !== draft.title && <CopyOriginal label="Title in the original document" text={original.title} onUse={() => update({ title: original.title })} />}
          <label className="block"><span className="label">Article title</span>
            <textarea rows={2} className="input !h-auto py-2" value={draft.title} onChange={(e) => update({ title: e.target.value })} /></label>
        </div>
      )
    case 'authors':
      return (
        <div>
          {original && <p className="mb-2 text-xs text-muted">Authors in the original document: <span className="text-ink">{original.authors.join(', ')}</span></p>}
          <AuthorCards authors={draft.authors} onChange={(authors) => update({ authors })} />
        </div>
      )
    case 'affiliations':
      return <AuthorCards authors={draft.authors} onChange={(authors) => update({ authors })} />
    case 'abstract':
      return (
        <div>
          {original && original.abstract !== draft.abstract && <CopyOriginal label="Abstract in the original document" text={original.abstract} onUse={() => update({ abstract: original.abstract })} />}
          <label className="block"><span className="label">Abstract</span>
            <textarea rows={7} className="input !h-auto py-2 leading-6" value={draft.abstract} onChange={(e) => update({ abstract: e.target.value })} />
            <span className="mt-0.5 block text-right text-xs tabular-nums text-muted">{wordCount(draft.abstract)} words</span></label>
        </div>
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
export function MetadataChecklist({ items, draft, update, readOnly, original, initialOpen }: { items: CheckItem[]; draft: Draft; update: (p: Partial<Draft>) => void; readOnly: boolean; original?: Original; initialOpen?: string }) {
  const [open, setOpen] = useState<string | null>(() => initialOpen ?? items.find((i) => !i.pass)?.key ?? null)
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
              {expanded && <div id={`chk-${it.key}`} className="mt-3 pl-7"><fieldset disabled={readOnly} className="min-w-0"><Editor item={it} draft={draft} update={update} original={original} /></fieldset></div>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
