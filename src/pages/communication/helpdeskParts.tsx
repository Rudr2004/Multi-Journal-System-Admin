import { Link } from 'react-router-dom'
import { Badge } from '@/components/Badges'
import { cn } from '@/lib/utils'
import type { Ticket } from '@/shared/types'
import type { Tone } from '@/shared/statuses'
import { responseTimer } from '@/mock/api/helpdesk'

const PRIORITY_TONE: Record<Ticket['priority'], Tone> = { urgent: 'danger', high: 'warning', normal: 'neutral', low: 'info' }
export const PriorityBadge = ({ priority }: { priority: Ticket['priority'] }) => <Badge tone={PRIORITY_TONE[priority]} className="capitalize">{priority}</Badge>

const STATUS: Record<Ticket['status'], { tone: Tone; label: string }> = { open: { tone: 'info', label: 'Open' }, pending: { tone: 'warning', label: 'Pending' }, resolved: { tone: 'success', label: 'Resolved' } }
export const TicketStatusBadge = ({ status }: { status: Ticket['status'] }) => <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>

const TIMER_CLASS = { neutral: 'text-muted', warning: 'bg-amber-50 text-amber-800 ring-amber-200', danger: 'bg-red-50 text-red-700 ring-red-200', success: 'text-green-700' }

/** SLA response timer: grey while healthy, amber under 2 h, red once breached. */
export function SlaChip({ ticket, now }: { ticket: Ticket; now: number }) {
  const t = responseTimer(ticket, now)
  const chip = t.tone === 'warning' || t.tone === 'danger'
  return <span className={cn('whitespace-nowrap text-xs font-medium tabular-nums', chip ? `rounded-full px-2 py-0.5 ring-1 ring-inset ${TIMER_CLASS[t.tone]}` : TIMER_CLASS[t.tone])}>{t.label}</span>
}

export const TicketLink = ({ id }: { id: string }) => <Link to={`/helpdesk/${id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{id}</Link>
