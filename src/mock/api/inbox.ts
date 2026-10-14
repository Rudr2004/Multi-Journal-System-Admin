import type { JournalCode, Paper, WhatsAppChat } from '@/shared/types'
import { currentActor, newId, recordAudit, sendMessage } from '../actions'
import type { ChatMessage, ChatMeta, TicketSource } from '../data/communication'
import type { InboxConvo } from '../data/inbox'
import { useDataStore } from '../store'
import { useCommStore } from '../stores/communication'
import { buildChatViews, markChatRead, sendChatMessage } from './whatsapp'
import { createTicket } from './helpdesk'
import { delay } from './latency'

export type InboxChannel = 'whatsapp' | 'email' | 'chat'
export const INBOX_CHANNEL_LABEL: Record<InboxChannel, string> = { whatsapp: 'WhatsApp', email: 'Email', chat: 'Chat' }
export const WINDOW_MS = 24 * 3_600_000

export interface InboxView {
  id: string
  channel: InboxChannel
  journal: JournalCode
  name: string
  contact: string
  subject?: string
  paperId?: string
  paper?: Paper
  unread: number
  thread: ChatMessage[]
  meta: ChatMeta
  preview: string
  lastAt: string
  lastInboundAt?: string
  /** WhatsApp only: end of the 24-hour customer-service window */
  windowEndsAt?: string
}

export interface ChannelAccess { email: boolean; chat: boolean }

const defaultMeta: ChatMeta = { resolved: false }

export function buildInboxViews(
  chats: WhatsAppChat[], convos: InboxConvo[], papers: Paper[],
  threads: Record<string, ChatMessage[]>, metas: Record<string, ChatMeta>, access: ChannelAccess,
): InboxView[] {
  const wa: InboxView[] = buildChatViews(chats, papers, threads, metas).map((v) => ({
    id: v.chat.id, channel: 'whatsapp', journal: v.chat.journal, name: v.name, contact: v.chat.contact, paperId: v.chat.paperId, paper: v.paper,
    unread: v.chat.unread, thread: v.thread, meta: v.meta, preview: v.preview, lastAt: v.lastAt, lastInboundAt: v.lastInboundAt, windowEndsAt: v.windowEndsAt,
  }))
  const other: InboxView[] = convos
    .filter((c) => (c.channel === 'email' ? access.email : access.chat))
    .map((c) => {
      const last = c.thread[c.thread.length - 1]
      const inbound = [...c.thread].reverse().find((m) => m.direction === 'in')
      return {
        id: c.id, channel: c.channel, journal: c.journal, name: c.name, contact: c.contact, subject: c.subject, paperId: c.paperId,
        paper: papers.find((p) => p.id === c.paperId), unread: c.unread, thread: c.thread, meta: metas[c.id] ?? defaultMeta,
        preview: c.subject ?? last?.text ?? '', lastAt: last?.at ?? '', lastInboundAt: inbound?.at,
      }
    })
  return [...wa, ...other].sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

export const listInbox = (journals: JournalCode[]) => {
  const { chats, papers } = useDataStore.getState()
  const { threads, chatMeta, inboxConvos } = useCommStore.getState()
  return delay(buildInboxViews(chats.filter((c) => journals.includes(c.journal)), inboxConvos.filter((c) => journals.includes(c.journal)), papers, threads, chatMeta, { email: true, chat: true }))
}

const patchConvo = (id: string, fn: (c: InboxConvo) => InboxConvo) => {
  const { inboxConvos, patch } = useCommStore.getState()
  patch({ inboxConvos: inboxConvos.map((c) => (c.id === id ? fn(c) : c)) })
}
const patchMeta = (id: string, p: Partial<ChatMeta>) => {
  const { chatMeta, patch } = useCommStore.getState()
  patch({ chatMeta: { ...chatMeta, [id]: { ...(chatMeta[id] ?? defaultMeta), ...p } } })
}
const journalOf = (id: string): JournalCode | 'ALL' =>
  useDataStore.getState().chats.find((c) => c.id === id)?.journal ?? useCommStore.getState().inboxConvos.find((c) => c.id === id)?.journal ?? 'ALL'

export function markInboxRead(v: Pick<InboxView, 'id' | 'channel'>) {
  if (v.channel === 'whatsapp') markChatRead(v.id)
  else patchConvo(v.id, (c) => (c.unread ? { ...c, unread: 0 } : c))
}

/** Sends a reply on any channel. WhatsApp uses the existing window/template logic; email replies are written to the communication log. */
export async function sendInboxMessage(v: InboxView, text: string, opts: { template?: string } = {}) {
  if (v.channel === 'whatsapp') return sendChatMessage(v.id, text, opts)
  const now = new Date().toISOString()
  const msg: ChatMessage = { id: newId('im'), direction: 'out', text, at: now, by: currentActor() }
  patchConvo(v.id, (c) => ({ ...c, thread: [...c.thread, msg] }))
  if (v.channel === 'email') sendMessage({ journal: v.journal, paperId: v.paperId, recipient: v.contact, channel: 'email', template: 'Inbox reply (free-form)', status: 'sent' })
  return delay(true, 200, 450)
}

export async function assignInbox(v: Pick<InboxView, 'id' | 'channel'>, assigneeId: string | undefined) {
  patchMeta(v.id, { assigneeId })
  recordAudit({ journal: journalOf(v.id), action: `Assigned ${INBOX_CHANNEL_LABEL[v.channel]} conversation`, target: v.id, newValue: assigneeId ?? 'Unassigned' })
  return delay(true, 150, 300)
}

export async function resolveInbox(v: Pick<InboxView, 'id' | 'channel'>, resolved: boolean) {
  patchMeta(v.id, { resolved })
  recordAudit({ journal: journalOf(v.id), action: `${resolved ? 'Resolved' : 'Reopened'} ${INBOX_CHANNEL_LABEL[v.channel]} conversation`, target: v.id })
  return delay(true, 150, 300)
}

export async function linkInboxPaper(v: Pick<InboxView, 'id' | 'channel'>, paperId: string) {
  const paper = useDataStore.getState().papers.find((p) => p.id === paperId.trim().toUpperCase())
  if (!paper) return delay(false, 200, 400)
  if (v.channel === 'whatsapp') {
    const { chats, patch } = useDataStore.getState()
    patch({ chats: chats.map((c) => (c.id === v.id ? { ...c, paperId: paper.id } : c)) })
  } else patchConvo(v.id, (c) => ({ ...c, paperId: paper.id }))
  recordAudit({ journal: paper.journal, action: `Linked ${INBOX_CHANNEL_LABEL[v.channel]} conversation to paper`, target: v.id, newValue: paper.id })
  return delay(true, 200, 400)
}

const SOURCE: Record<InboxChannel, TicketSource> = { whatsapp: 'WhatsApp', email: 'Email', chat: 'Chat' }

/** Creates a ticket from a conversation (source channel + linked Paper ID) and remembers the link on the conversation. */
export async function convertToTicket(v: InboxView): Promise<string> {
  const me = useDataStore.getState().users.find((u) => u.name === currentActor())
  const first = v.thread.find((m) => m.direction === 'in') ?? v.thread[0]
  const subject = v.subject ?? (first?.text.length > 70 ? `${first.text.slice(0, 67)}...` : first?.text) ?? 'Enquiry from the inbox'
  const id = await createTicket({
    journal: v.journal,
    subject: subject.length >= 8 ? subject : `${INBOX_CHANNEL_LABEL[v.channel]} enquiry: ${subject}`,
    requester: v.name,
    requesterEmail: v.channel === 'whatsapp' ? (v.paper?.authorEmail ?? '') : v.contact,
    priority: 'normal',
    category: 'General enquiry',
    message: v.thread.filter((m) => m.direction === 'in').map((m) => m.text).join('\n\n') || subject,
    paperId: v.paperId,
    source: SOURCE[v.channel],
    assigneeId: me?.id,
  })
  patchMeta(v.id, { ticketId: id })
  recordAudit({ journal: v.journal, action: `Converted ${INBOX_CHANNEL_LABEL[v.channel]} conversation to ticket`, target: v.id, newValue: id })
  return id
}
