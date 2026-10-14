import type { JournalCode } from '@/shared/types'
import { currentActor, newId, recordAudit } from '../actions'
import type { Campaign, CampaignAudience, DeliveryReport, Subscriber } from '../data/newsletter'
import { useDataStore } from '../store'
import { useNewsletterStore } from '../stores/newsletter'
import { ApiError, delay } from './latency'

export const SUBSCRIBER_STATUS_LABEL = { confirmed: 'Confirmed', pending: 'Pending', unsubscribed: 'Unsubscribed' } as const

export const listSubscribers = (journals: JournalCode[]) =>
  delay(useNewsletterStore.getState().subscribers.filter((s) => journals.includes(s.journal)))

export const listCampaigns = () => delay(useNewsletterStore.getState().campaigns)

/** Only confirmed subscribers receive a campaign. */
export function audienceFor(audience: CampaignAudience, subscribers: Subscriber[]): Subscriber[] {
  return subscribers.filter((s) =>
    s.status === 'confirmed' &&
    (audience.journals.length === 0 || audience.journals.includes(s.journal)) &&
    (audience.sources.length === 0 || audience.sources.includes(s.source)))
}

const patchSubs = (fn: (s: Subscriber) => Subscriber, ids: Set<string>) => {
  const { subscribers, patch } = useNewsletterStore.getState()
  patch({ subscribers: subscribers.map((s) => (ids.has(s.id) ? fn(s) : s)) })
}

/** Manual unsubscribe: the person stops receiving every campaign. */
export async function unsubscribeSubscribers(ids: string[]) {
  const set = new Set(ids)
  const now = new Date().toISOString()
  const targets = useNewsletterStore.getState().subscribers.filter((s) => set.has(s.id) && s.status !== 'unsubscribed')
  patchSubs((s) => ({ ...s, status: 'unsubscribed', unsubscribedAt: now }), new Set(targets.map((s) => s.id)))
  recordAudit({ journal: 'ALL', action: 'Manually unsubscribed newsletter subscribers', target: `${targets.length} subscriber${targets.length === 1 ? '' : 's'}`, newValue: targets.slice(0, 3).map((s) => s.email).join(', ') + (targets.length > 3 ? ' and more' : '') })
  await delay(true, 300, 600)
  return targets.length
}

export async function resendConfirmation(ids: string[]) {
  const set = new Set(ids)
  const targets = useNewsletterStore.getState().subscribers.filter((s) => set.has(s.id) && s.status === 'pending')
  recordAudit({ journal: 'ALL', action: 'Resent newsletter confirmation emails', target: `${targets.length} subscriber${targets.length === 1 ? '' : 's'}` })
  await delay(true, 300, 600)
  return targets.length
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function subscribersCsv(rows: Subscriber[]): string {
  const head = ['Email', 'Journal', 'Source', 'Status', 'Subscribed on']
  const lines = rows.map((s) => [s.email, s.journal, s.source, SUBSCRIBER_STATUS_LABEL[s.status], s.subscribedAt.slice(0, 10)].map(csvCell).join(','))
  return [head.join(','), ...lines].join('\r\n')
}

/** Real client-side download of the given rows; the export is audited. */
export function exportSubscribers(rows: Subscriber[]) {
  const blob = new Blob(['﻿', subscribersCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  recordAudit({ journal: 'ALL', action: 'Exported newsletter subscribers (CSV)', target: `${rows.length} rows` })
}

/* ------------------------------ campaigns ------------------------------ */

export type CampaignInput = Pick<Campaign, 'subject' | 'body' | 'audience' | 'attachments'>

const nowIso = () => new Date().toISOString()
const patchCampaigns = (fn: (c: Campaign[]) => Campaign[]) => {
  const { campaigns, patch } = useNewsletterStore.getState()
  patch({ campaigns: fn(campaigns) })
}
const get = (id: string) => {
  const c = useNewsletterStore.getState().campaigns.find((x) => x.id === id)
  if (!c) throw new ApiError('Campaign not found', 'not_found')
  return c
}

export async function saveCampaign(id: string | undefined, input: CampaignInput): Promise<Campaign> {
  if (id) {
    const cur = get(id)
    if (cur.status === 'sent') throw new ApiError('A sent campaign cannot be edited', 'locked')
    const next: Campaign = { ...cur, ...input, updatedAt: nowIso() }
    patchCampaigns((cs) => cs.map((c) => (c.id === id ? next : c)))
    recordAudit({ journal: 'ALL', action: 'Edited newsletter campaign', target: input.subject, oldValue: cur.subject })
    await delay(true, 250, 500)
    return next
  }
  const c: Campaign = { id: newId('cmp'), ...input, status: 'draft', createdBy: currentActor(), updatedAt: nowIso() }
  patchCampaigns((cs) => [c, ...cs])
  recordAudit({ journal: 'ALL', action: 'Created newsletter campaign draft', target: input.subject })
  await delay(true, 250, 500)
  return c
}

export async function sendTestEmail(subject: string) {
  const me = useDataStore.getState().users.find((u) => u.name === currentActor())
  recordAudit({ journal: 'ALL', action: 'Sent newsletter test email', target: subject, newValue: me?.email })
  await delay(true, 400, 800)
  return me?.email ?? 'your address'
}

export async function scheduleCampaign(id: string, at: string) {
  const c = get(id)
  if (c.status === 'sent') throw new ApiError('Already sent', 'locked')
  if (new Date(at).getTime() <= Date.now()) throw new ApiError('Choose a time in the future', 'invalid')
  patchCampaigns((cs) => cs.map((x) => (x.id === id ? { ...x, status: 'scheduled', scheduledAt: at, updatedAt: nowIso() } : x)))
  recordAudit({ journal: 'ALL', action: 'Scheduled newsletter campaign', target: c.subject, newValue: at })
  return delay(true, 300, 600)
}

export async function cancelSchedule(id: string) {
  const c = get(id)
  patchCampaigns((cs) => cs.map((x) => (x.id === id ? { ...x, status: 'draft', scheduledAt: undefined, updatedAt: nowIso() } : x)))
  recordAudit({ journal: 'ALL', action: 'Cancelled newsletter schedule', target: c.subject, oldValue: c.scheduledAt })
  return delay(true, 200, 400)
}

/** Delivery numbers are simulated from the audience size (mock only). */
function simulateReport(count: number): DeliveryReport {
  const bounced = Math.round(count * 0.03)
  const delivered = count - bounced
  return { sent: count, delivered, opened: Math.round(delivered * 0.52), bounced, unsubscribed: Math.max(0, Math.round(count * 0.01)) }
}

export async function sendCampaignNow(id: string) {
  const c = get(id)
  if (c.status === 'sent') throw new ApiError('Already sent', 'locked')
  const count = audienceFor(c.audience, useNewsletterStore.getState().subscribers).length
  if (count === 0) throw new ApiError('No confirmed subscribers match this audience', 'invalid')
  patchCampaigns((cs) => cs.map((x) => (x.id === id ? { ...x, status: 'sent', sentAt: nowIso(), scheduledAt: undefined, updatedAt: nowIso(), report: simulateReport(count) } : x)))
  recordAudit({ journal: 'ALL', action: 'Sent newsletter campaign', target: c.subject, newValue: `${count} recipients` })
  await delay(true, 500, 900)
  return count
}

export async function deleteCampaign(id: string) {
  const c = get(id)
  if (c.status !== 'draft') throw new ApiError('Only drafts can be deleted', 'locked')
  patchCampaigns((cs) => cs.filter((x) => x.id !== id))
  recordAudit({ journal: 'ALL', action: 'Deleted newsletter campaign draft', target: c.subject })
  return delay(true, 200, 400)
}
