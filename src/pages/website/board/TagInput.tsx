import { useId, useState } from 'react'
import { X } from 'lucide-react'

/** Free-text tags: type and press Enter or comma to add, Backspace on an empty box removes the last one. */
export function TagInput({ label, value, onChange, placeholder, hint, max = 10, disabled }: {
  label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; hint?: string; max?: number; disabled?: boolean
}) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, ' ')
    if (!t) return
    if (value.length >= max || value.some((v) => v.toLowerCase() === t.toLowerCase())) { setDraft(''); return }
    onChange([...value, t])
    setDraft('')
  }
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="flex min-h-[var(--control-h)] flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-accent">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
            {t}
            {!disabled && <button type="button" aria-label={`Remove ${t}`} className="rounded-full hover:bg-white/60" onClick={() => onChange(value.filter((v) => v !== t))}><X size={12} aria-hidden /></button>}
          </span>
        ))}
        <input id={id} value={draft} disabled={disabled || value.length >= max} placeholder={value.length ? '' : placeholder} className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-faint"
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(draft) }
            else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => add(draft)} />
      </div>
      <p className="mt-1 text-xs text-muted">{hint ?? `Type an area and press Enter. Up to ${max}.`}</p>
    </div>
  )
}
