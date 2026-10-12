import type { Channel } from '@/shared/types'
import { currentActor, recordAudit } from '../actions'
import { TEMPLATE_EVENTS, type MessageTemplate, type ReminderSequence, type TimeSlot } from '../data/communication'
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
export async function saveEmailTemplate(id: string, input: { subject: string; body: string }) {
  const { templates, patch } = useCommStore.getState()
  const t = templates.find((x) => x.id === id)
  if (!t) throw new ApiError('Template not found', 'not_found')
  if (t.channel !== 'email') throw new ApiError('SMS and WhatsApp templates are approved externally and cannot be edited', 'locked')
  const label = TEMPLATE_EVENTS.find((e) => e.key === t.event)?.label ?? t.event
  patch({ templates: templates.map((x) => (x.id === id ? { ...x, ...input, updatedAt: new Date().toISOString(), updatedBy: currentActor() } : x)) })
  recordAudit({ journal: 'ALL', action: 'Edited email template', target: label, oldValue: t.subject, newValue: input.subject })
  return delay(true)
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
