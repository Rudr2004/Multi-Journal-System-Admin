import type { JournalCode, Ticket } from '@/shared/types'
import { currentActor, newId, recordAudit } from '../actions'
import { SLA_HOURS, type TicketDetail, type TicketSource } from '../data/communication'
import { useDataStore } from '../store'
import { useCommStore } from '../stores/communication'
import { ApiError, delay } from './latency'

export interface HelpTicket extends Ticket {
  detail: TicketDetail
}

export const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 } as const

export function mergeTickets(tickets: Ticket[], details: Record<string, TicketDetail>): HelpTicket[] {
  const empty: TicketDetail = { requesterEmail: '', source: 'Portal form', category: 'General', messages: [], notes: [] }
  return tickets.map((t) => ({ ...t, detail: details[t.id] ?? empty }))
}

export function listTickets(journals: JournalCode[]) {
  const { tickets } = useDataStore.getState()
  const { ticketDetails } = useCommStore.getState()
  return delay(mergeTickets(tickets.filter((t) => journals.includes(t.journal)), ticketDetails))
}

export interface ResponseTimer {
  label: string
  tone: 'neutral' | 'warning' | 'danger' | 'success'
  /** ms remaining (negative = breached); undefined when the timer does not run */
  remainingMs?: number
}

/** SLA state: the clock runs while the ticket is open; pending (waiting on requester) pauses it. */
export function responseTimer(t: Ticket, now = Date.now()): ResponseTimer {
  if (t.status === 'resolved') return { label: 'Resolved', tone: 'success' }
  if (t.status === 'pending') return { label: 'Waiting on requester', tone: 'neutral' }
  const ms = new Date(t.dueAt).getTime() - now
  const abs = Math.abs(ms)
  const h = Math.floor(abs / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  const text = h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : h > 0 ? `${h} h ${m} min` : `${m} min`
  if (ms < 0) return { label: `Overdue ${text}`, tone: 'danger', remainingMs: ms }
  return { label: `${text} left`, tone: ms < 2 * 3_600_000 ? 'warning' : 'neutral', remainingMs: ms }
}

const dueFor = (priority: Ticket['priority'], from = Date.now()) => new Date(from + SLA_HOURS[priority] * 3_600_000).toISOString()

const nextTicketNo = () => {
  const nums = useDataStore.getState().tickets.map((t) => Number(t.id.replace('TKT-', '')) || 0)
  return `TKT-${Math.max(2399, ...nums) + 1}`
}

export interface NewTicketInput {
  journal: JournalCode
  subject: string
  requester: string
  requesterEmail: string
  priority: Ticket['priority']
  category: string
  message: string
  paperId?: string
  source?: TicketSource
  assigneeId?: string
}

export async function createTicket(input: NewTicketInput): Promise<string> {
  const id = nextTicketNo()
  const now = new Date().toISOString()
  const { tickets, patch } = useDataStore.getState()
  const ticket: Ticket = { id, journal: input.journal, subject: input.subject, requester: input.requester, status: 'open', priority: input.priority, assigneeId: input.assigneeId, createdAt: now, dueAt: dueFor(input.priority) }
  patch({ tickets: [ticket, ...tickets] })
  const { ticketDetails, patch: set } = useCommStore.getState()
  set({
    ticketDetails: {
      ...ticketDetails,
      [id]: {
        requesterEmail: input.requesterEmail, source: input.source ?? 'Portal form', category: input.category, paperId: input.paperId, notes: [],
        messages: [{ id: newId('tm'), from: 'requester', author: input.requester, text: input.message, at: now }],
      },
    },
  })
  recordAudit({ journal: input.journal, action: 'Created helpdesk ticket', target: id, newValue: input.subject })
  await delay(true, 300, 600)
  return id
}

/** Called by the forms inbox when a general enquiry is converted into a ticket. */
export const convertEnquiryToTicket = (e: { journal: JournalCode; name: string; email: string; subject: string; message: string; paperId?: string }) =>
  createTicket({ journal: e.journal, subject: e.subject, requester: e.name, requesterEmail: e.email, priority: 'normal', category: 'General enquiry', message: e.message, paperId: e.paperId, source: 'Enquiry form' })

function patchTicket(id: string, p: Partial<Ticket>) {
  const { tickets, patch } = useDataStore.getState()
  patch({ tickets: tickets.map((t) => (t.id === id ? { ...t, ...p } : t)) })
}
function patchDetail(id: string, fn: (d: TicketDetail) => TicketDetail) {
  const { ticketDetails, patch } = useCommStore.getState()
  const cur = ticketDetails[id]
  if (cur) patch({ ticketDetails: { ...ticketDetails, [id]: fn(cur) } })
}
const ticketOrThrow = (id: string) => {
  const t = useDataStore.getState().tickets.find((x) => x.id === id)
  if (!t) throw new ApiError('Ticket not found', 'not_found')
  return t
}

export async function replyToTicket(id: string, text: string, opts: { resolve?: boolean } = {}) {
  const t = ticketOrThrow(id)
  const now = new Date().toISOString()
  patchDetail(id, (d) => ({
    ...d,
    firstResponseAt: d.firstResponseAt ?? now,
    messages: [...d.messages, { id: newId('tm'), from: 'agent', author: currentActor(), text, at: now }],
  }))
  patchTicket(id, { status: opts.resolve ? 'resolved' : 'pending' })
  recordAudit({ journal: t.journal, action: opts.resolve ? 'Replied and resolved ticket' : 'Replied to ticket', target: id })
  return delay(true, 250, 500)
}

export async function addTicketNote(id: string, text: string) {
  const t = ticketOrThrow(id)
  patchDetail(id, (d) => ({ ...d, notes: [...d.notes, { id: newId('tn'), author: currentActor(), text, at: new Date().toISOString() }] }))
  recordAudit({ journal: t.journal, action: 'Added internal note', target: id })
  return delay(true, 150, 300)
}

export async function updateTicket(id: string, p: Partial<Pick<Ticket, 'priority' | 'status' | 'assigneeId'>>) {
  const t = ticketOrThrow(id)
  const extra: Partial<Ticket> = {}
  if (p.priority && p.priority !== t.priority && t.status !== 'resolved') extra.dueAt = dueFor(p.priority, new Date(t.createdAt).getTime())
  if (p.status === 'open' && t.status === 'resolved') extra.dueAt = dueFor(p.priority ?? t.priority)
  patchTicket(id, { ...p, ...extra })
  const what = p.priority ? `priority ${t.priority} to ${p.priority}` : p.status ? `status ${t.status} to ${p.status}` : 'assignee'
  recordAudit({ journal: t.journal, action: `Changed ticket ${what}`, target: id, oldValue: p.priority ? t.priority : p.status ? t.status : t.assigneeId, newValue: p.priority ?? p.status ?? p.assigneeId })
  return delay(true, 150, 350)
}
