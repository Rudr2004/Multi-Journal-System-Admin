import { differenceInCalendarDays, parseISO } from 'date-fns'
import { formatDate, formatDateTime } from '@/shared/formatters'
import { Badge } from './Badges'

/** Due date with overdue / due-today emphasis. */
export function DueChip({ value }: { value?: string }) {
  if (!value) return <span className="text-faint">—</span>
  const days = differenceInCalendarDays(parseISO(value), new Date())
  const tone = days < 0 ? 'danger' : days === 0 ? 'warning' : 'neutral'
  const text = days < 0 ? `Overdue ${-days} d` : days === 0 ? 'Due today' : `${formatDate(value)}`
  return <span title={formatDateTime(value)}><Badge tone={tone}>{text}</Badge></span>
}
