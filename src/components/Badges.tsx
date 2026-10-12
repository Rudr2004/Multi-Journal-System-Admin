import type { JournalCode, PaperStatus } from '@/shared/types'
import { STATUS_META, type Tone } from '@/shared/statuses'
import { JOURNAL_COLORS } from '@/styles/tokens'
import { cn } from '@/lib/utils'

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  success: 'bg-green-50 text-green-700 ring-green-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  accent: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE_CLASS[tone], className)}>
      {children}
    </span>
  )
}

/** Shared status badge used identically across every screen. */
export function StatusBadge({ status }: { status: PaperStatus }) {
  const m = STATUS_META[status]
  return <Badge tone={m.tone}>{m.label}</Badge>
}

/** Small coloured dot + code, used in the switcher, tables and headers. */
export function JournalBadge({ code, className }: { code: JournalCode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-subtle px-1.5 py-0.5 text-xs font-semibold text-ink', className)}>
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: JOURNAL_COLORS[code] }} />
      {code}
    </span>
  )
}

export function JournalDot({ code, size = 8 }: { code: JournalCode; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ background: JOURNAL_COLORS[code], width: size, height: size }} />
}
