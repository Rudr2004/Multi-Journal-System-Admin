import { useRef } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { Badge } from '@/components/Badges'
import { toast } from '@/components/Toasts'
import { ISSUE_STATUS_META } from '@/mock/data/publishing'
import type { IssueStatus } from '@/shared/types'
import { cn } from '@/lib/utils'

export const IssueStatusBadge = ({ status }: { status: IssueStatus }) => {
  const m = ISSUE_STATUS_META[status]
  return <Badge tone={m.tone}>{m.label}</Badge>
}

export interface ImageValue { name: string; data?: string }

/** Placeholder image upload: reads the file locally (no upload) and shows a preview. */
export function ImageField({ label, value, onChange, disabled, aspect = 'aspect-[3/4]', width = 'w-36', hint }: {
  label: string; value?: ImageValue | null; onChange: (v: ImageValue | null) => void
  disabled?: boolean; aspect?: string; width?: string; hint?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const pick = (file?: File) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return toast.error('Please choose a PNG, JPG, WebP or SVG image.')
    if (file.size > 2 * 1024 * 1024) return toast.error('Image is larger than 2 MB. Please choose a smaller file.')
    const r = new FileReader()
    r.onload = () => onChange({ name: file.name, data: typeof r.result === 'string' ? r.result : undefined })
    r.readAsDataURL(file)
  }
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-start gap-3">
        <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-subtle', aspect, width)}>
          {value?.data
            ? <img src={value.data} alt={`${label} preview`} className="h-full w-full object-cover" />
            : <div className="px-2 text-center text-xs text-muted"><ImagePlus size={20} strokeWidth={1.5} className="mx-auto mb-1 text-faint" aria-hidden />{value ? value.name : 'No image'}</div>}
        </div>
        <div className="min-w-0 space-y-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-label={`Upload ${label}`} tabIndex={-1}
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={disabled} onClick={() => input.current?.click()}><Upload size={15} strokeWidth={1.5} aria-hidden /> {value ? 'Replace' : 'Upload'}</button>
            {value && <button type="button" className="btn-ghost" disabled={disabled} onClick={() => onChange(null)}><Trash2 size={15} strokeWidth={1.5} aria-hidden /> Remove</button>}
          </div>
          {value && <p className="truncate text-xs text-muted" title={value.name}>{value.name}</p>}
          <p className="text-xs text-muted">{hint ?? 'PNG, JPG, WebP or SVG up to 2 MB.'}</p>
        </div>
      </div>
    </div>
  )
}

/** "2026-10-01" → "2026-10" for <input type="month">. */
export const toMonthValue = (iso: string) => iso.slice(0, 7)
export const fromMonthValue = (v: string) => `${v}-01`
