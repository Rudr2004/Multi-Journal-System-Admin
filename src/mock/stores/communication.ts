import { create } from 'zustand'
import type { Channel } from '@/shared/types'
import { registerReset } from '../reset'
import { useDataStore } from '../store'
import {
  buildBotTree, buildChannelPause, buildChatMeta, buildDispatched, buildFaqs, buildNotices, buildReminders, buildTemplates,
  buildThreads, buildTicketDetails, buildTimeSlots,
  type BotNode, type ChatMessage, type ChatMeta, type DispatchedBatch, type DispatchNotice, type Faq, type MessageTemplate,
  type ReminderSequence, type TicketDetail, type TimeSlot,
} from '../data/communication'
import { buildInboxConvos, buildStaffAlerts, type InboxConvo, type StaffAlertPrefs } from '../data/inbox'

interface CommState {
  /* dispatch */
  notices: DispatchNotice[]
  pausedItems: string[]
  pausedBatches: string[]
  dispatched: DispatchedBatch[]
  /* log */
  resolvedFailures: Record<string, { at: string; by: string; newId: string }>
  /* templates & schedule */
  templates: MessageTemplate[]
  timeSlots: TimeSlot[]
  reminders: ReminderSequence[]
  channelPaused: Record<Channel, boolean>
  /* whatsapp */
  threads: Record<string, ChatMessage[]>
  chatMeta: Record<string, ChatMeta>
  /* inbox: email and website chat conversations (WhatsApp chats live in the data store) */
  inboxConvos: InboxConvo[]
  /* staff alerts by role */
  staffAlerts: StaffAlertPrefs
  /* helpdesk */
  ticketDetails: Record<string, TicketDetail>
  /* chatbot */
  botTree: BotNode[]
  faqs: Faq[]
  reset: () => void
  patch: (p: Partial<Omit<CommState, 'reset' | 'patch'>>) => void
}

function seed() {
  const { papers, tickets, chats } = useDataStore.getState()
  const inbox = buildInboxConvos(papers)
  return {
    inboxConvos: inbox.convos,
    staffAlerts: buildStaffAlerts(),
    notices: buildNotices(papers),
    pausedItems: [] as string[],
    pausedBatches: [] as string[],
    dispatched: buildDispatched(),
    resolvedFailures: {},
    templates: buildTemplates(),
    timeSlots: buildTimeSlots(),
    reminders: buildReminders(),
    channelPaused: buildChannelPause(),
    threads: buildThreads(),
    chatMeta: { ...buildChatMeta(chats.map((c) => c.id)), ...inbox.meta },
    ticketDetails: buildTicketDetails(tickets, papers),
    botTree: buildBotTree(),
    faqs: buildFaqs(),
  }
}

export const useCommStore = create<CommState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  patch: (p) => set(p),
}))

registerReset(() => useCommStore.getState().reset())
