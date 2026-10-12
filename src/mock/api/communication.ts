import type { JournalCode, MessageLogEntry } from '@/shared/types'
import { currentActor, logEvent, recordAudit, sendMessage } from '../actions'
import { eventByLabel, paperVars, renderText, sampleVars } from '../data/communication'
import { useDataStore } from '../store'
import { useCommStore } from '../stores/communication'
import { ApiError, delay } from './latency'

export interface LogRow extends MessageLogEntry {
  paperTitle?: string
  resolved?: { at: string; by: string; newId: string }
}

export async function listMessageLog(journals: JournalCode[]): Promise<LogRow[]> {
  const { messages, papers } = useDataStore.getState()
  const { resolvedFailures } = useCommStore.getState()
  const titles = new Map(papers.map((p) => [p.id, p.title]))
  return delay(
    messages
      .filter((m) => journals.includes(m.journal))
      .map((m) => ({ ...m, paperTitle: m.paperId ? titles.get(m.paperId) : undefined, resolved: resolvedFailures[m.id] }))
      .sort((a, b) => b.at.localeCompare(a.at)),
  )
}

export interface RenderedMessage {
  subject?: string
  body: string
  from: string
  to: string
  /** SMS / WhatsApp template identifiers, when relevant. */
  meta?: string
}

/** Builds the content a message had from its template and the paper's data. */
export function renderLoggedMessage(m: MessageLogEntry): RenderedMessage {
  const { templates } = useCommStore.getState()
  const paper = useDataStore.getState().papers.find((p) => p.id === m.paperId)
  const vars = paper ? paperVars(paper) : sampleVars()
  const event = eventByLabel(m.template)
  const tpl = templates.find((t) => t.event === event?.key && t.channel === m.channel)
  if (!tpl) {
    return { body: `Free-form reply sent from the WhatsApp inbox (${m.template}).`, from: 'EdTech Publishers', to: m.recipient }
  }
  return {
    subject: tpl.subject ? renderText(tpl.subject, vars) : undefined,
    body: renderText(tpl.body, vars),
    from: m.channel === 'email' ? 'editorial@edtechpublishers.in' : m.channel === 'sms' ? (tpl.senderId ?? 'EDTPUB') : '+91 98765 00045 (EdTech Publishers)',
    to: m.recipient,
    meta: m.channel === 'sms' ? `DLT template ${tpl.dltId}` : m.channel === 'whatsapp' ? `Meta template ${tpl.metaName}` : undefined,
  }
}

/** Re-sends a failed message: logs a new entry and marks the failure resolved. */
export async function resendMessage(id: string): Promise<{ newId: string }> {
  const { messages } = useDataStore.getState()
  const original = messages.find((m) => m.id === id)
  if (!original) throw new ApiError('Message not found', 'not_found')
  if (original.status !== 'failed') throw new ApiError('Only failed messages can be re-sent', 'invalid')
  if (useCommStore.getState().channelPaused[original.channel]) throw new ApiError(`${original.channel.toUpperCase()} sending is paused in Templates & schedule`, 'paused')
  sendMessage({ journal: original.journal, paperId: original.paperId, recipient: original.recipient, channel: original.channel, template: original.template, status: 'sent' })
  const newId = useDataStore.getState().messages[0].id
  const { resolvedFailures, patch } = useCommStore.getState()
  const by = currentActor()
  patch({ resolvedFailures: { ...resolvedFailures, [id]: { at: new Date().toISOString(), by, newId } } })
  recordAudit({ journal: original.journal, action: `Re-sent failed ${original.channel} message`, target: original.paperId ?? original.id, oldValue: 'failed', newValue: 'sent' })
  if (original.paperId) logEvent(original.paperId, `re-sent the "${original.template}" ${original.channel} message to ${original.recipient}`)
  return delay({ newId }, 500, 900)
}
