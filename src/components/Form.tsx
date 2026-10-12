import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Label + control + hint/error wrapper. Pass the generated `id` to the control via the render prop. */
export function FormField({ label, error, hint, required, children, className }: {
  label: string; error?: string; hint?: string; required?: boolean; className?: string
  children: (a: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode
}) {
  const id = useId()
  const msgId = `${id}-msg`
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}{required && <span className="text-red-600" aria-hidden> *</span>}</label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': error || hint ? msgId : undefined })}
      {error ? <p id={msgId} role="alert" className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p id={msgId} className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4', disabled && 'cursor-not-allowed opacity-60')}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-slate-300')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

/** Character counter for SEO-style fields. */
export function CharCount({ value, max, min }: { value: string; max: number; min?: number }) {
  const n = value.length
  const bad = n > max || (min !== undefined && n < min)
  return <span className={cn('text-xs tabular-nums', bad ? 'text-red-600' : 'text-muted')}>{n} / {max}</span>
}

export function DescriptionList({ items, cols = 2 }: { items: { label: string; value: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs text-muted">{i.label}</dt>
          <dd className="mt-0.5 text-sm">{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
