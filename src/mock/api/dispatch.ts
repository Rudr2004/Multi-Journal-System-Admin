import type { Channel, JournalCode } from '@/shared/types'
import { formatDate, formatTime } from '@/shared/formatters'
import { newId, recordAudit, sendMessage, updatePaper } from '../actions'
import { batchTime } from '../data/communication'
import { useDataStore } from '../store'
import { useCommStore } from '../stores/communication'
import { delay } from './latency'

export type HeldReason = 'item' | 'batch' | 'channel'

export interface DispatchQueueItem {
  id: string
  kind: 'paper' | 'notice'
  journal: JournalCode
  paperId: string
  paperTitle: string
  recipient: string
  template: string
  channel: Channel
  batchKey: string
  /** Why the item will be skipped when the batch goes out (undefined = will send). */
  held?: HeldReason
}

export interface DispatchBatchView {
  key: string
  at: string
  paused: boolean
  items: DispatchQueueItem[]
}

export interface DispatchOverview {
  batches: DispatchBatchView[]
  history: { id: string; batchAt: string; sentAt: string; count: number; by: string }[]
  channelPaused: Record<Channel, boolean>
}

const dayKey = (iso: string) => new Date(iso).toDateString()

function collect(): DispatchQueueItem[] {
  const { papers } = useDataStore.getState()
  const { notices, pausedItems, pausedBatches, channelPaused } = useCommStore.getState()
  const byId = new Map(papers.map((p) => [p.id, p]))
  const items: DispatchQueueItem[] = []
  for (const p of papers) {
    if (!p.dispatchAt) continue
    items.push({ id: `dq-${p.id}`, kind: 'paper', journal: p.journal, paperId: p.id, paperTitle: p.title, recipient: p.authorEmail, template: 'Decision: accepted', channel: 'email', batchKey: dayKey(p.dispatchAt) })
  }
  for (const n of notices) {
    items.push({ id: n.id, kind: 'notice', journal: n.journal, paperId: n.paperId, paperTitle: byId.get(n.paperId)?.title ?? '', recipient: n.recipient, template: n.template, channel: n.channel, batchKey: dayKey(n.batchAt) })
  }
  return items.map((i) => ({
    ...i,
    held: pausedItems.includes(i.id) ? 'item' : pausedBatches.includes(i.batchKey) ? 'batch' : channelPaused[i.channel] ? 'channel' : undefined,
  }))
}

export async function listDispatchQueue(journals: JournalCode[]): Promise<DispatchOverview> {
  const { pausedBatches, dispatched, channelPaused } = useCommStore.getState()
  const items = collect().filter((i) => journals.includes(i.journal))
  const batches: DispatchBatchView[] = [0, 1, 2].map((offset) => {
    const at = batchTime(offset)
    const key = at.toDateString()
    return { key, at: at.toISOString(), paused: pausedBatches.includes(key), items: items.filter((i) => i.batchKey === key).sort((a, b) => a.template.localeCompare(b.template) || a.paperId.localeCompare(b.paperId)) }
  })
  return delay({ batches, history: [...dispatched].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 5), channelPaused })
}

export async function setItemPaused(itemId: string, paused: boolean) {
  const { pausedItems, patch } = useCommStore.getState()
  patch({ pausedItems: paused ? [...new Set([...pausedItems, itemId])] : pausedItems.filter((x) => x !== itemId) })
  recordAudit({ journal: 'ALL', action: paused ? 'Paused dispatch item' : 'Resumed dispatch item', target: itemId })
  return delay(true, 150, 300)
}

export async function setBatchPaused(batchKey: string, batchAt: string, paused: boolean) {
  const { pausedBatches, patch } = useCommStore.getState()
  patch({ pausedBatches: paused ? [...new Set([...pausedBatches, batchKey])] : pausedBatches.filter((x) => x !== batchKey) })
  recordAudit({ journal: 'ALL', action: paused ? 'Paused dispatch batch' : 'Resumed dispatch batch', target: `${formatDate(batchAt)} ${formatTime(batchAt)}` })
  return delay(true, 150, 300)
}

/** Sends the given queue items immediately: writes them to the communication log and removes them from the queue. */
function dispatchItems(items: DispatchQueueItem[]) {
  const { notices, dispatched, patch } = useCommStore.getState()
  for (const i of items) {
    sendMessage({ journal: i.journal, paperId: i.paperId, recipient: i.recipient, channel: i.channel, template: i.template, status: i.channel === 'email' ? 'delivered' : 'sent' })
    if (i.kind === 'paper') updatePaper(i.paperId, { dispatchAt: undefined }, { event: `${i.template} email dispatched to ${i.recipient}` })
  }
  const noticeIds = new Set(items.filter((i) => i.kind === 'notice').map((i) => i.id))
  const ids = new Set(items.map((i) => i.id))
  patch({
    notices: notices.filter((n) => !noticeIds.has(n.id)),
    pausedItems: useCommStore.getState().pausedItems.filter((x) => !ids.has(x)),
  })
  return dispatched
}

/** Send now for a whole batch. Held (paused) items stay queued. */
export async function sendBatchNow(batchKey: string, batchAt: string, journals: JournalCode[]) {
  const all = collect().filter((i) => i.batchKey === batchKey && journals.includes(i.journal))
  const send = all.filter((i) => !i.held)
  if (send.length === 0) return delay({ sent: 0, held: all.length }, 200, 400)
  const prior = dispatchItems(send)
  useCommStore.getState().patch({
    dispatched: [{ id: newId('db'), batchAt, sentAt: new Date().toISOString(), count: send.length, by: 'Manual send' }, ...prior],
  })
  recordAudit({ journal: 'ALL', action: 'Sent dispatch batch now', target: `${formatDate(batchAt)} ${formatTime(batchAt)}`, newValue: `${send.length} message${send.length === 1 ? '' : 's'}` })
  return delay({ sent: send.length, held: all.length - send.length }, 500, 900)
}

export async function sendItemNow(itemId: string) {
  const item = collect().find((i) => i.id === itemId)
  if (!item) return delay({ sent: 0 }, 150, 300)
  dispatchItems([item])
  recordAudit({ journal: item.journal, action: 'Sent queued message now', target: item.paperId, newValue: `${item.template} · ${item.channel}` })
  return delay({ sent: 1 }, 300, 600)
}
