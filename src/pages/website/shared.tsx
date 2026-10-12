import { useMemo } from 'react'
import type { JournalCode } from '@/shared/types'
import { useScopeJournals } from '@/lib/scope'
import { cn, initials } from '@/lib/utils'
import { JournalBadge } from '@/components/Badges'

/** Stable key for useAsync deps from a journal list. */
export const useJournalKey = () => {
  const journals = useScopeJournals()
  return { journals, key: journals.join(',') }
}

export function Avatar({ name, photo, size = 40, muted }: { name: string; photo?: string; size?: number; muted?: boolean }) {
  return photo ? (
    <img src={photo} alt="" width={size} height={size} className={cn('shrink-0 rounded-full object-cover', muted && 'opacity-50 grayscale')} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700', muted && 'bg-slate-100 text-slate-500')}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>
  )
}

/** Segmented single-journal chooser for screens that operate on one journal at a time. */
export function JournalTabs({ journals, value, onChange, label = 'Journal' }: { journals: JournalCode[]; value: JournalCode; onChange: (j: JournalCode) => void; label?: string }) {
  if (journals.length <= 1) return value ? <JournalBadge code={value} /> : null
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-subtle p-1">
      {journals.map((j) => (
        <button key={j} role="radio" aria-checked={j === value} onClick={() => onChange(j)}
          className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors', j === value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>{j}</button>
      ))}
    </div>
  )
}

/** The effective journal for single-journal screens: the user's pick if still in scope, else the first in scope. */
export function useActiveJournal(pick: JournalCode | undefined): JournalCode | undefined {
  const journals = useScopeJournals()
  return useMemo(() => (pick && journals.includes(pick) ? pick : journals[0]), [pick, journals])
}

/** yyyy-mm-dd → date input friendly, and datetime-local helpers (browser-local time). */
export const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = (v: string) => new Date(v).toISOString()

export const COVER_CLASS: Record<string, string> = {
  indigo: 'from-indigo-500 to-violet-500',
  sky: 'from-sky-500 to-cyan-400',
  emerald: 'from-emerald-500 to-teal-400',
  amber: 'from-amber-400 to-orange-400',
  rose: 'from-rose-500 to-pink-400',
  slate: 'from-slate-600 to-slate-400',
}
