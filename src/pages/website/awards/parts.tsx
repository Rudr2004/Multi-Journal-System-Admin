import { Check } from 'lucide-react'
import { Badge } from '@/components/Badges'
import { cn } from '@/lib/utils'
import type { Tone } from '@/shared/statuses'
import { CYCLE_LABEL, CYCLE_STATUSES, type CycleStatus } from '@/mock/data/website'

const TONE: Record<CycleStatus, Tone> = {
  draft: 'neutral', nominations: 'info', shortlisting: 'info', pending_approval: 'warning', approved: 'accent', published: 'success',
}

export const CycleStatusBadge = ({ status }: { status: CycleStatus }) => <Badge tone={TONE[status]}>{CYCLE_LABEL[status]}</Badge>

/** Draft → Nominations → Shortlisting → Pending approval → Approved → Published */
export function CycleStepper({ status }: { status: CycleStatus }) {
  const cur = CYCLE_STATUSES.indexOf(status)
  return (
    <ol aria-label="Award cycle progress" className="flex flex-wrap gap-x-2 gap-y-2">
      {CYCLE_STATUSES.map((s, i) => {
        const done = i < cur
        const active = i === cur
        return (
          <li key={s} aria-current={active ? 'step' : undefined} className="flex items-center gap-2">
            <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-green-600 text-white' : active ? 'bg-accent text-white' : 'bg-subtle text-muted')}>
              {done ? <Check size={14} aria-label="Completed" /> : i + 1}
            </span>
            <span className={cn('text-sm', active ? 'font-semibold text-ink' : 'text-muted')}>{CYCLE_LABEL[s]}</span>
            {i < CYCLE_STATUSES.length - 1 && <span aria-hidden className={cn('mx-1 h-px w-6', done ? 'bg-green-600' : 'bg-line')} />}
          </li>
        )
      })}
    </ol>
  )
}
