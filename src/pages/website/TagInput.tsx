import { useState } from 'react'
import { X } from 'lucide-react'

/** Chip editor for short lists (keywords, article types, badges). Enter or comma adds, Backspace on empty removes the last. */
export function TagInput({ id, value, onChange, placeholder, disabled, max = 30, 'aria-label': ariaLabel }: {
  id?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean; max?: number; 'aria-label'?: string
}) {
  const [text, setText] = useState('')
  const commit = (raw: string) => {
    const t = raw.trim()
    if (t && !value.some((x) => x.toLowerCase() === t.toLowerCase()) && value.length < max) onChange([...value, t])
    setText('')
  }
  const add = () => commit(text)
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-accent/40">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
          {t}
          {!disabled && <button type="button" aria-label={`Remove ${t}`} className="rounded-full hover:text-ink" onClick={() => onChange(value.filter((x) => x !== t))}><X size={12} strokeWidth={2} aria-hidden /></button>}
        </span>
      ))}
      <input id={id} aria-label={ariaLabel} disabled={disabled} value={text} placeholder={value.length ? '' : placeholder} className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none"
        onChange={(e) => (e.target.value.endsWith(',') ? commit(e.target.value.slice(0, -1)) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add() }
          if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={add} />
    </div>
  )
}
