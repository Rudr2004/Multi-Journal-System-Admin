import type { JournalCode, Paper, WhatsAppChat } from '@/shared/types'
import { newId, recordAudit, sendMessage } from '../actions'
import type { ChatMessage, ChatMeta } from '../data/communication'
import { useDataStore } from '../store'
import { useCommStore } from '../stores/communication'
import { delay } from './latency'

export const WINDOW_MS = 24 * 3_600_000

export interface ChatView {
  chat: WhatsAppChat
  name: string
  thread: ChatMessage[]
  meta: ChatMeta
  paper?: Paper
  lastInboundAt?: string
  /** end of the 24-hour customer-service window (undefined if the customer never wrote) */
  windowEndsAt?: string
  preview: string
  lastAt: string
}

export function buildChatViews(chats: WhatsAppChat[], papers: Paper[], threads: Record<string, ChatMessage[]>, metas: Record<string, ChatMeta>): ChatView[] {
  return chats.map((chat) => {
    const thread = threads[chat.id] ?? []
    const paper = papers.find((p) => p.id === chat.paperId)
    const inbound = [...thread].reverse().find((m) => m.direction === 'in')
    const last = thread[thread.length - 1]
    return {
      chat, thread, paper,
      name: paper?.author ?? chat.contact,
      meta: metas[chat.id] ?? { resolved: false },
      lastInboundAt: inbound?.at,
      windowEndsAt: inbound ? new Date(new Date(inbound.at).getTime() + WINDOW_MS).toISOString() : undefined,
      preview: last?.text ?? chat.lastMessage,
      lastAt: last?.at ?? chat.lastAt,
    }
  }).sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

export const listChats = (journals: JournalCode[]) => {
  const { chats, papers } = useDataStore.getState()
  const { threads, chatMeta } = useCommStore.getState()
  return delay(buildChatViews(chats.filter((c) => journals.includes(c.journal)), papers, threads, chatMeta))
}

const patchChat = (id: string, p: Partial<WhatsAppChat>) => {
  const { chats, patch } = useDataStore.getState()
  patch({ chats: chats.map((c) => (c.id === id ? { ...c, ...p } : c)) })
}

export function markChatRead(id: string) {
  const chat = useDataStore.getState().chats.find((c) => c.id === id)
  if (chat && chat.unread > 0) patchChat(id, { unread: 0 })
}

/** Sends a free-form reply (window open) or an approved template (window closed) and logs it in the communication log. */
export async function sendChatMessage(chatId: string, text: string, opts: { template?: string } = {}) {
  const { chats } = useDataStore.getState()
  const chat = chats.find((c) => c.id === chatId)
  if (!chat) return delay(false)
  const { threads, patch } = useCommStore.getState()
  const now = new Date().toISOString()
  const msg: ChatMessage = { id: newId('wm'), direction: 'out', text, at: now, by: useDataStore.getState().users.find((u) => u.id === 'u-support')?.name, template: !!opts.template }
  patch({ threads: { ...threads, [chatId]: [...(threads[chatId] ?? []), msg] } })
  patchChat(chatId, { lastMessage: text, lastAt: now })
  sendMessage({ journal: chat.journal, paperId: chat.paperId, recipient: chat.contact, channel: 'whatsapp', template: opts.template ?? 'Inbox reply (free-form)', status: 'sent' })
  return delay(true, 200, 450)
}

export async function assignChat(chatId: string, assigneeId: string | undefined) {
  const { chatMeta, patch } = useCommStore.getState()
  patch({ chatMeta: { ...chatMeta, [chatId]: { ...(chatMeta[chatId] ?? { resolved: false }), assigneeId } } })
  recordAudit({ journal: useDataStore.getState().chats.find((c) => c.id === chatId)?.journal ?? 'ALL', action: 'Assigned WhatsApp chat', target: chatId, newValue: assigneeId })
  return delay(true, 150, 300)
}

export async function setChatResolved(chatId: string, resolved: boolean) {
  const { chatMeta, patch } = useCommStore.getState()
  patch({ chatMeta: { ...chatMeta, [chatId]: { ...(chatMeta[chatId] ?? {}), resolved } } })
  recordAudit({ journal: useDataStore.getState().chats.find((c) => c.id === chatId)?.journal ?? 'ALL', action: resolved ? 'Resolved WhatsApp chat' : 'Reopened WhatsApp chat', target: chatId })
  return delay(true, 150, 300)
}

export async function linkChatPaper(chatId: string, paperId: string) {
  const paper = useDataStore.getState().papers.find((p) => p.id === paperId.trim().toUpperCase())
  if (!paper) return delay(false, 200, 400)
  patchChat(chatId, { paperId: paper.id })
  return delay(true, 200, 400)
}
