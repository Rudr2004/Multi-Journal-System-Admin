import type { Channel } from '@/shared/types'
import { currentActor, newId, recordAudit } from '../actions'
import { TEMPLATE_EVENTS, type HtmlLayout, type MessageTemplate, type ReminderSequence, type TimeSlot } from '../data/communication'
import { useCommStore } from '../stores/communication'
import { ApiError, delay } from './latency'

export interface TemplateBundle {
  templates: MessageTemplate[]
  timeSlots: TimeSlot[]
  reminders: ReminderSequence[]
  channelPaused: Record<Channel, boolean>
}

export const listTemplateBundle = (): Promise<TemplateBundle> => {
  const { templates, timeSlots, reminders, channelPaused } = useCommStore.getState()
  return delay({ templates, timeSlots, reminders, channelPaused })
}

/** Only email templates can be edited; SMS (DLT) and WhatsApp (Meta) wording is fixed by the approving body. */
export async function saveEmailTemplate(id: string, input: { subject: string; body: string; format?: 'text' | 'html'; html?: string }) {
  const { templates, patch } = useCommStore.getState()
  const t = templates.find((x) => x.id === id)
  if (!t) throw new ApiError('Template not found', 'not_found')
  if (t.channel !== 'email') throw new ApiError('SMS and WhatsApp templates are approved externally and cannot be edited', 'locked')
  const label = TEMPLATE_EVENTS.find((e) => e.key === t.event)?.label ?? t.event
  patch({ templates: templates.map((x) => (x.id === id ? { ...x, ...input, updatedAt: new Date().toISOString(), updatedBy: currentActor() } : x)) })
  recordAudit({ journal: 'ALL', action: input.format === 'html' ? 'Edited email template (HTML)' : 'Edited email template', target: label, oldValue: t.subject, newValue: input.subject })
  return delay(true)
}

/** Save a reusable HTML layout (new, or update an existing one by id). */
export async function saveHtmlLayout(name: string, html: string, id?: string): Promise<HtmlLayout> {
  const { htmlLayouts, patch } = useCommStore.getState()
  const trimmed = name.trim()
  if (trimmed.length < 3) throw new ApiError('Give the layout a name of at least 3 characters.', 'invalid')
  if (!id && htmlLayouts.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) throw new ApiError('A layout with this name already exists.', 'conflict')
  const layout: HtmlLayout = { id: id ?? newId('layout'), name: trimmed, html, updatedAt: new Date().toISOString(), updatedBy: currentActor() }
  patch({ htmlLayouts: id ? htmlLayouts.map((l) => (l.id === id ? layout : l)) : [layout, ...htmlLayouts] })
  recordAudit({ journal: 'ALL', action: id ? 'Updated HTML email layout' : 'Saved HTML email layout', target: trimmed })
  return delay(layout, 250, 500)
}

export async function deleteHtmlLayout(id: string) {
  const { htmlLayouts, patch } = useCommStore.getState()
  const l = htmlLayouts.find((x) => x.id === id)
  if (!l) throw new ApiError('Layout not found', 'not_found')
  patch({ htmlLayouts: htmlLayouts.filter((x) => x.id !== id) })
  recordAudit({ journal: 'ALL', action: 'Deleted HTML email layout', target: l.name })
  return delay(true, 200, 400)
}

export async function saveTimeSlots(slots: TimeSlot[]) {
  useCommStore.getState().patch({ timeSlots: slots })
  recordAudit({ journal: 'ALL', action: 'Updated dispatch time slots', target: 'Time slots', newValue: slots.filter((s) => s.enabled).map((s) => s.time).join(', ') })
  return delay(true)
}

export async function saveReminders(reminders: ReminderSequence[]) {
  useCommStore.getState().patch({ reminders })
  recordAudit({ journal: 'ALL', action: 'Updated reminder sequences', target: 'Reminder sequences' })
  return delay(true)
}

export async function setChannelPaused(channel: Channel, paused: boolean) {
  const { channelPaused, patch } = useCommStore.getState()
  patch({ channelPaused: { ...channelPaused, [channel]: paused } })
  recordAudit({ journal: 'ALL', action: paused ? 'Paused channel' : 'Resumed channel', target: channel, oldValue: paused ? 'active' : 'paused', newValue: paused ? 'paused' : 'active' })
  return delay(true, 200, 400)
}
