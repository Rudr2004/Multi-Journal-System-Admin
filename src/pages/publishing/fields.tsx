import { useRef, useState } from 'react'
import { Bold, Download, Eye, FileText, Italic, Link2, List, Trash2, Upload } from 'lucide-react'
import { FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { Markdown } from '@/pages/website/Markdown'
import { cn } from '@/lib/utils'
import type { Duration, FileRef } from '@/shared/types'

/* ---------- Files ---------- */

const MB = 1024 * 1024
export const formatBytes = (n: number) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** Reads a File into a FileRef (bytes kept as a data URL so Download works in the prototype). */
export function readFileRef(file: File, accept: RegExp, maxMb: number, what: string): Promise<FileRef | null> {
  if (!accept.test(file.name) && !accept.test(file.type)) {
    toast.error(`Please choose ${what}.`)
    return Promise.resolve(null)
  }
  if (file.size > maxMb * MB) {
    toast.error(`${file.name} is larger than ${maxMb} MB.`)
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve({ name: file.name, size: file.size, uploadedAt: new Date().toISOString(), data: typeof r.result === 'string' ? r.result : undefined })
    r.onerror = () => {
      toast.error(`Could not read ${file.name}.`)
      resolve(null)
    }
    r.readAsDataURL(file)
  })
}

export function downloadFileRef(f: FileRef) {
  if (!f.data) {
    toast.info(`${f.name} is a seeded placeholder with no stored file in this prototype.`)
    return
  }
  const a = document.createElement('a')
  a.href = f.data
  a.download = f.name
  a.click()
}

export const PDF_ACCEPT = { accept: /\.pdf$|application\/pdf/i, acceptAttr: '.pdf,application/pdf', what: 'a PDF file' }
export const DOC_ACCEPT = { accept: /\.docx?$|msword|wordprocessingml/i, acceptAttr: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', what: 'a DOC or DOCX file' }
export const IMAGE_ACCEPT = { accept: /\.(png|jpe?g|webp)$|^image\//i, acceptAttr: 'image/png,image/jpeg,image/webp', what: 'a PNG, JPG or WebP image' }

interface FileFieldProps {
  label: string
  value?: FileRef | null
  onChange: (v: FileRef | null) => void | Promise<void>
  disabled?: boolean
  accept?: RegExp
  acceptAttr?: string
  what?: string
  maxMb?: number
  hint?: string
  busy?: boolean
}

/** One uploadable document with Download / Replace / Remove. */
export function FileField({ label, value, onChange, disabled, accept = PDF_ACCEPT.accept, acceptAttr = PDF_ACCEPT.acceptAttr, what = PDF_ACCEPT.what, maxMb = 25, hint, busy }: FileFieldProps) {
  const input = useRef<HTMLInputElement>(null)
  const pick = async (file?: File) => {
    if (!file) return
    const ref = await readFileRef(file, accept, maxMb, what)
    if (ref) await onChange(ref)
  }
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><FileText size={18} strokeWidth={1.5} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          {value
            ? <p className="truncate text-xs text-muted" title={value.name}>{value.name} · {formatBytes(value.size)}</p>
            : <p className="text-xs text-muted">{hint ?? `Not uploaded yet. Choose ${what}, up to ${maxMb} MB.`}</p>}
        </div>
      </div>
      <input ref={input} type="file" accept={acceptAttr} className="sr-only" aria-label={`Upload ${label}`} tabIndex={-1} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary !h-8" disabled={disabled || busy} onClick={() => input.current?.click()}><Upload size={14} strokeWidth={1.5} aria-hidden /> {value ? 'Replace' : 'Upload'}</button>
        {value && <button type="button" className="btn-secondary !h-8" onClick={() => downloadFileRef(value)}><Download size={14} strokeWidth={1.5} aria-hidden /> Download</button>}
        {value && <button type="button" className="btn-ghost !h-8" disabled={disabled || busy} onClick={() => void onChange(null)}><Trash2 size={14} strokeWidth={1.5} aria-hidden /> Remove</button>}
      </div>
    </div>
  )
}

/** Several images (e.g. conference photos): grid of thumbnails with remove, plus an upload button. */
export function PhotosField({ label, value, onChange, disabled, maxMb = 5 }: { label: string; value: FileRef[]; onChange: (v: FileRef[]) => void | Promise<void>; disabled?: boolean; maxMb?: number }) {
  const input = useRef<HTMLInputElement>(null)
  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    const added: FileRef[] = []
    for (const f of Array.from(files)) {
      const ref = await readFileRef(f, IMAGE_ACCEPT.accept, maxMb, IMAGE_ACCEPT.what)
      if (ref) added.push(ref)
    }
    if (added.length) await onChange([...value, ...added])
  }
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label} <span className="text-muted">({value.length})</span></p>
          <p className="text-xs text-muted">Select several images at once. PNG, JPG or WebP up to {maxMb} MB each.</p>
        </div>
        <input ref={input} type="file" multiple accept={IMAGE_ACCEPT.acceptAttr} className="sr-only" aria-label={`Upload ${label}`} tabIndex={-1} onChange={(e) => { void pick(e.target.files); e.target.value = '' }} />
        <button type="button" className="btn-secondary !h-8 shrink-0" disabled={disabled} onClick={() => input.current?.click()}><Upload size={14} strokeWidth={1.5} aria-hidden /> Add photos</button>
      </div>
      {value.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((p, i) => (
            <li key={`${p.name}-${i}`} className="group relative aspect-square overflow-hidden rounded-md border border-line bg-subtle">
              {p.data ? <img src={p.data} alt={p.name} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center p-1 text-center text-[11px] text-muted">{p.name}</span>}
              {!disabled && (
                <button type="button" aria-label={`Remove photo ${p.name}`} className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100" onClick={() => void onChange(value.filter((_, k) => k !== i))}>
                  <Trash2 size={12} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ---------- Durations ("2 days", "36 hours") ---------- */

export const formatDuration = (d?: Duration) => (d && d.value > 0 ? `${d.value} ${d.value === 1 ? d.unit.slice(0, -1) : d.unit}` : '—')

interface DurationFieldProps {
  label: string
  hint?: string
  error?: string
  valueProps: React.InputHTMLAttributes<HTMLInputElement>
  unitProps: React.SelectHTMLAttributes<HTMLSelectElement>
}

/** Editable length of time: a number box plus an hours/days unit. Pass react-hook-form register() results. */
export function DurationField({ label, hint, error, valueProps, unitProps }: DurationFieldProps) {
  return (
    <FormField label={label} required error={error} hint={hint}>
      {(a) => (
        <div className="flex gap-2">
          <input {...a} type="number" min={1} step={1} inputMode="numeric" className="input min-w-0 flex-1" placeholder="2" {...valueProps} />
          <select aria-label={`${label} unit`} className="input !w-28 shrink-0" {...unitProps}>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
      )}
    </FormField>
  )
}

/* ---------- Rich text (Markdown with a small toolbar and a preview) ---------- */

export function RichTextField({ label, value, onChange, disabled, max = 5000, error, rows = 8 }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; max?: number; error?: string; rows?: number }) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)
  const labelId = `rt-${label.replace(/\s+/g, '-')}`
  const wrap = (before: string, after = before, placeholder = 'text') => {
    const el = area.current
    const s = el?.selectionStart ?? value.length
    const e = el?.selectionEnd ?? value.length
    const sel = value.slice(s, e) || placeholder
    onChange(`${value.slice(0, s)}${before}${sel}${after}${value.slice(e)}`)
    setTimeout(() => {
      el?.focus()
      el?.setSelectionRange(s + before.length, s + before.length + sel.length)
    }, 0)
  }
  const bullet = () => {
    const el = area.current
    const s = el?.selectionStart ?? value.length
    const start = value.lastIndexOf('\n', s - 1) + 1
    onChange(`${value.slice(0, start)}- ${value.slice(start)}`)
    setTimeout(() => el?.focus(), 0)
  }
  const runTool = (id: string) => {
    if (id === 'bold') wrap('**')
    else if (id === 'italic') wrap('*')
    else if (id === 'list') bullet()
    else wrap('[', '](https://)', 'link text')
  }
  const TOOLS = [
    { id: 'bold', label: 'Bold', icon: Bold },
    { id: 'italic', label: 'Italic', icon: Italic },
    { id: 'list', label: 'Bulleted list', icon: List },
    { id: 'link', label: 'Link', icon: Link2 },
  ]
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label !mb-0" id={labelId}>{label}</span>
        <button type="button" className="btn-ghost !h-7 text-xs" aria-pressed={preview} onClick={() => setPreview((p) => !p)}><Eye size={14} strokeWidth={1.5} aria-hidden /> {preview ? 'Edit' : 'Preview'}</button>
      </div>
      {preview ? (
        <div className="min-h-[10rem] rounded-lg border border-line bg-surface p-4" aria-label={`${label} preview`}>
          {value.trim() ? <Markdown source={value} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
        </div>
      ) : (
        <div className={cn('rounded-lg border focus-within:ring-2 focus-within:ring-accent', error ? 'border-red-400' : 'border-line')}>
          <div role="toolbar" aria-label={`${label} formatting`} className="flex gap-0.5 border-b border-line bg-page px-1.5 py-1">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" title={t.label} aria-label={t.label} disabled={disabled} className="btn-ghost !h-8 !w-8 !px-0" onClick={() => runTool(t.id)}><t.icon size={15} strokeWidth={1.5} /></button>
            ))}
          </div>
          <textarea ref={area} aria-labelledby={labelId} rows={rows} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
            className="block w-full resize-y rounded-b-lg bg-surface p-3 text-sm leading-6 outline-none disabled:opacity-70" />
        </div>
      )}
      <div className="mt-1 flex justify-between gap-3 text-xs">
        <span role={error ? 'alert' : undefined} className={error ? 'text-red-600' : 'text-muted'}>{error ?? 'Supports **bold**, *italic*, lists and links.'}</span>
        <span className={cn('tabular-nums', value.length > max ? 'text-red-600' : 'text-muted')}>{value.length} / {max}</span>
      </div>
    </div>
  )
}
