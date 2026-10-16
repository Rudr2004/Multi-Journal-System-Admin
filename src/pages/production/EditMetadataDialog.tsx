import { useState } from 'react'
import { FileUp } from 'lucide-react'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import type { MetadataEdit } from '@/mock/data/production'
import { AuthorCards } from './workspace/MetadataChecklist'

/** Edit every detail of a published paper for a post-publication correction: title, abstract, authors and documents. */
export function EditMetadataDialog({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: MetadataEdit; onSave: (m: MetadataEdit) => void }) {
  return (
    <Dialog open={open} onClose={onClose} width={760} title="Edit metadata" description="Change any paper detail. Your edits go into the new version the Editor approves; the live article is not touched until then."
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" form="edit-meta-form">Save metadata changes</button></>}>
      {open && <Form initial={initial} onClose={onClose} onSave={onSave} />}
    </Dialog>
  )
}

function Form({ initial, onClose, onSave }: { initial: MetadataEdit; onClose: () => void; onSave: (m: MetadataEdit) => void }) {
  const [m, setM] = useState<MetadataEdit>(initial)
  const [touched, setTouched] = useState(false)
  const kw = m.keywords.join(', ')
  const errors = {
    title: m.title.trim().length < 10 ? 'The title needs at least 10 characters.' : '',
    abstract: m.abstract.trim().length < 50 ? 'The abstract needs at least 50 characters.' : '',
    authors: m.authors.some((a) => a.name.trim().length < 3 || !/^\S+@\S+\.\S+$/.test(a.email) || !a.affiliation.trim()) ? 'Every author needs a name, a valid email and an affiliation.' : '',
  }
  const bad = Object.values(errors).some(Boolean)
  return (
    <form id="edit-meta-form" noValidate className="space-y-5" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (bad) return; onSave({ ...m, keywords: m.keywords.map((k) => k.trim()).filter(Boolean) }); onClose() }}>
      <FormField label="Title" required error={touched ? errors.title : undefined}>{(a) => <textarea {...a} rows={2} className="input !h-auto py-2" value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} />}</FormField>
      <FormField label="Abstract" required error={touched ? errors.abstract : undefined}>{(a) => <textarea {...a} rows={6} className="input !h-auto py-2 leading-6" value={m.abstract} onChange={(e) => setM({ ...m, abstract: e.target.value })} />}</FormField>
      <FormField label="Keywords (comma separated)">{(a) => <input {...a} className="input" value={kw} onChange={(e) => setM({ ...m, keywords: e.target.value.split(',').map((k) => k.trimStart()) })} />}</FormField>
      <div>
        <p className="label">Authors</p>
        {touched && errors.authors && <p role="alert" className="mb-2 text-xs text-red-600">{errors.authors}</p>}
        <AuthorCards authors={m.authors} onChange={(authors) => setM({ ...m, authors })} />
      </div>
      <fieldset className="space-y-3">
        <legend className="label">Documents</legend>
        <FileRow label="Final typeset paper (PDF)" accept=".pdf" name={m.finalFileName} original={initial.finalFileName} onPick={(n) => setM({ ...m, finalFileName: n })} />
        <FileRow label="Original submission (Word)" accept=".doc,.docx" name={m.manuscriptName} original={initial.manuscriptName} onPick={(n) => setM({ ...m, manuscriptName: n })} />
      </fieldset>
    </form>
  )
}

function FileRow({ label, accept, name, original, onPick }: { label: string; accept: string; name?: string; original?: string; onPick: (n: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted">{name ?? 'No file'}{name && name !== original ? ' · replaced' : ''}</p>
      </div>
      <label className="btn-secondary !h-8 cursor-pointer"><FileUp size={14} aria-hidden /> Replace
        <input type="file" accept={accept} className="sr-only" aria-label={`Replace ${label}`} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f.name); e.target.value = '' }} /></label>
    </div>
  )
}
