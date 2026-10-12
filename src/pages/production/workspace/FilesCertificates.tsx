import { useRef, useState } from 'react'
import { AlertTriangle, Award, Eye, FileUp, Pencil } from 'lucide-react'
import { Dialog } from '@/components/Dialog'
import { FileRow } from '@/components/Viewers'
import { CertificatePreview } from '@/components/CertificatePreview'
import { Badge } from '@/components/Badges'
import { RelativeTime } from '@/components/Time'
import { formatDate } from '@/shared/formatters'
import { doiFor } from '@/shared/paperId'
import type { Author, JournalCode } from '@/shared/types'
import type { CertificateRecord, ProductionRecord } from '@/mock/data/production'

export function FinalFilePanel({ record, readOnly, busy, onUpload }: { record: ProductionRecord; readOnly: boolean; busy: boolean; onUpload: (name: string, sizeKb: number) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const f = record.finalFile
  return (
    <div className="space-y-4">
      <div>
        <p className="label">Original submission</p>
        <FileRow name={record.manuscript.fileName} meta={`Word document · version ${record.manuscript.version} · ${record.manuscript.pageCount} pages`} />
      </div>
      <div>
        <p className="label">Final paper (typeset PDF) <span className="text-red-600" aria-hidden>*</span></p>
        {f ? (
          <FileRow name={f.name} meta={`Version ${f.version} · ${(f.sizeKb / 1024).toFixed(1)} MB · uploaded by ${f.uploadedBy}`} action={<span className="text-xs text-muted"><RelativeTime value={f.uploadedAt} /></span>} />
        ) : (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> No final file uploaded yet. Upload the typeset PDF to continue.
          </div>
        )}
        <input ref={input} type="file" accept=".pdf,.docx" className="sr-only" tabIndex={-1} aria-label="Choose final paper file"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(file.name, Math.max(1, Math.round(file.size / 1024))); e.target.value = '' }} />
        <button type="button" className="btn-secondary mt-3" disabled={readOnly || busy} onClick={() => input.current?.click()}>
          <FileUp size={15} aria-hidden /> {busy ? 'Uploading…' : f ? 'Upload a new version' : 'Upload final file'}
        </button>
        <p className="mt-1.5 text-xs text-muted">Accepted: PDF or Word, up to 25 MB. Each upload is recorded as a new version.</p>
      </div>
    </div>
  )
}

const toInputDate = (iso: string) => new Date(iso).toISOString().slice(0, 10)

export function CertificatesPanel({ record, authors, journal, paperId, title, readOnly, busy, onGenerate, onRegenerate }: {
  record: ProductionRecord; authors: Author[]; journal: JournalCode; paperId: string; title: string; readOnly: boolean; busy: boolean
  onGenerate: () => void; onRegenerate: (email: string, name: string, dateIso: string) => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [edit, setEdit] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [touched, setTouched] = useState(false)
  const certFor = (a: Author): CertificateRecord | undefined => record.certificates.find((c) => c.authorEmail === a.email)
  const missing = authors.filter((a) => !certFor(a))
  const stale = authors.filter((a) => { const c = certFor(a); return c && c.name !== a.name })
  const previewAuthor = authors.find((a) => a.email === preview)
  const previewCert = previewAuthor && certFor(previewAuthor)
  const editAuthor = authors.find((a) => a.email === edit)
  const nameErr = touched && name.trim().length < 3 ? 'Enter the author’s full name.' : undefined
  const openEdit = (a: Author) => { const c = certFor(a); setName(c?.name ?? a.name); setDate(toInputDate(c?.date ?? new Date().toISOString())); setTouched(false); setEdit(a.email) }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">One certificate of publication per author, generated from the author list and today’s date.</p>
        <button type="button" className="btn-primary" disabled={readOnly || busy || (missing.length === 0 && stale.length === 0)} onClick={onGenerate}>
          <Award size={15} aria-hidden /> {record.certificates.length === 0 ? 'Generate certificates' : missing.length || stale.length ? 'Regenerate outdated' : 'All certificates up to date'}
        </button>
      </div>
      {authors.length === 0 ? <p className="text-sm text-muted">Add at least one author in the metadata checklist first.</p> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {authors.map((a, i) => {
            const c = certFor(a)
            const isStale = !!c && c.name !== a.name
            return (
              <li key={a.email + i} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{a.name || `Author ${i + 1}`}</p>
                  {!c ? <Badge tone="warning">Not generated</Badge> : isStale ? <Badge tone="warning">Out of date</Badge> : <Badge tone="success">Version {c.version}</Badge>}
                </div>
                {c ? (
                  <div className="pointer-events-none origin-top-left"><CertificatePreview authorName={c.name} paperTitle={title} paperId={paperId} journal={journal} date={c.date} doi={doiFor(paperId)} /></div>
                ) : (
                  <div className="flex aspect-[1.414/1] items-center justify-center rounded-lg border border-dashed border-line bg-page text-sm text-muted">Certificate will appear here</div>
                )}
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn-secondary !h-8" disabled={!c} onClick={() => setPreview(a.email)}><Eye size={14} aria-hidden /> Preview</button>
                  <button type="button" className="btn-secondary !h-8" disabled={readOnly || busy} onClick={() => openEdit(a)}><Pencil size={14} aria-hidden /> Edit & regenerate</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={!!previewCert} onClose={() => setPreview(null)} title="Certificate preview" description={previewCert ? `${previewCert.name} · version ${previewCert.version} · ${formatDate(previewCert.date)}` : undefined} width={760}
        footer={<button className="btn-secondary" onClick={() => setPreview(null)}>Close</button>}>
        {previewCert && <CertificatePreview authorName={previewCert.name} paperTitle={title} paperId={paperId} journal={journal} date={previewCert.date} doi={doiFor(paperId)} />}
      </Dialog>

      <Dialog open={!!editAuthor} onClose={() => setEdit(null)} title="Edit certificate details" description="The certificate is regenerated with these details. The author’s name is updated in the metadata too." width={720}
        footer={<>
          <button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn-primary" onClick={() => { setTouched(true); if (name.trim().length >= 3 && date && edit) { onRegenerate(edit, name.trim(), new Date(`${date}T00:00:00`).toISOString()); setEdit(null) } }}>Regenerate certificate</button>
        </>}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label htmlFor="cert-name" className="label">Author name</label>
              <input id="cert-name" className="input" value={name} aria-invalid={!!nameErr} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} />
              {nameErr && <p role="alert" className="mt-1 text-xs text-red-600">{nameErr}</p>}
            </div>
            <div>
              <label htmlFor="cert-date" className="label">Certificate date</label>
              <input id="cert-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {editAuthor && <CertificatePreview authorName={name || '—'} paperTitle={title} paperId={paperId} journal={journal} date={date ? new Date(`${date}T00:00:00`).toISOString() : new Date().toISOString()} doi={doiFor(paperId)} />}
        </div>
      </Dialog>
    </div>
  )
}
