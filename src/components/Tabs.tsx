import { useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TabDef { id: string; label: string; badge?: number | string; content: ReactNode }

/** Accessible tabs: arrow keys, Home/End, roving tabindex. */
export function Tabs({ tabs, value, onChange, className }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; className?: string }) {
  const uid = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const idx = Math.max(0, tabs.findIndex((t) => t.id === value))
  const move = (to: number) => {
    const n = (to + tabs.length) % tabs.length
    onChange(tabs[n].id)
    refs.current[n]?.focus()
  }
  return (
    <div className={className}>
      <div role="tablist" aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-line"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); move(idx + 1) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); move(idx - 1) }
          if (e.key === 'Home') { e.preventDefault(); move(0) }
          if (e.key === 'End') { e.preventDefault(); move(tabs.length - 1) }
        }}>
        {tabs.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el }} role="tab" id={`${uid}-t-${t.id}`} aria-selected={i === idx} aria-controls={`${uid}-p-${t.id}`}
            tabIndex={i === idx ? 0 : -1} onClick={() => onChange(t.id)}
            className={cn('-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              i === idx ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink')}>
            {t.label}
            {t.badge !== undefined && <span className="rounded-full bg-subtle px-1.5 text-xs text-muted">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${uid}-p-${tabs[idx].id}`} aria-labelledby={`${uid}-t-${tabs[idx].id}`} className="pt-5">{tabs[idx].content}</div>
    </div>
  )
}
