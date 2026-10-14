import type { JournalCode } from '@/shared/types'
import { currentActor, newId, recordAudit, sendMessage } from '../actions'
import type { Announcement, AnnouncementChannel, AnnouncementType, Placement } from '../data/website'
import { useWebsiteStore } from '../stores/website'
import { ApiError, delay } from './latency'

const wait = () => delay(null, 250, 600)
const state = () => useWebsiteStore.getState()

export interface AnnouncementInput {
  channel: AnnouncementChannel
  link: string
  highlight: boolean
  title: string
  body: string
  type: AnnouncementType
  placements: Placement[]
  pinned: boolean
  startAt: string
  endAt?: string
  emailSubscribers: boolean
}

export async function listAnnouncements(journals: JournalCode[]): Promise<Announcement[]> {
  await wait()
  return state().announcements.filter((a) => journals.includes(a.journal)).sort((a, b) => b.startAt.localeCompare(a.startAt))
}

/** One announcement record is created per selected journal; they share a batch id. */
export async function createAnnouncements(journals: JournalCode[], input: AnnouncementInput): Promise<Announcement[]> {
  await wait()
  if (journals.length === 0) throw new ApiError('Choose at least one journal.', 'validation')
  const batchId = newId('batch')
  const now = new Date().toISOString()
  const created: Announcement[] = journals.map((journal) => ({ ...input, id: newId('ann'), batchId, journal, createdAt: now, createdBy: currentActor() }))
  state().set({ announcements: [...created, ...state().announcements] })
  const scheduled = new Date(input.startAt).getTime() > Date.now()
  for (const a of created) {
    recordAudit({ journal: a.journal, action: `${scheduled ? 'Scheduled' : 'Published'} ${input.channel === 'tab' ? 'tab notification' : 'scrolling notification'} (announcement)`, target: a.title, newValue: input.startAt })
    if (a.emailSubscribers) sendMessage({ journal: a.journal, recipient: `${a.journal} subscribers`, channel: 'email', template: `Announcement: ${a.title}` })
  }
  return created
}

export async function updateAnnouncement(id: string, input: AnnouncementInput): Promise<Announcement> {
  await wait()
  const before = state().announcements.find((a) => a.id === id)
  if (!before) throw new ApiError('This announcement no longer exists.', 'not_found')
  const next = { ...before, ...input }
  state().set({ announcements: state().announcements.map((a) => (a.id === id ? next : a)) })
  recordAudit({ journal: before.journal, action: 'Edited announcement', target: next.title })
  return next
}

/** Take a live announcement off the website now by ending it. */
export async function endAnnouncement(id: string): Promise<void> {
  await wait()
  const a = state().announcements.find((x) => x.id === id)
  if (!a) throw new ApiError('This announcement no longer exists.', 'not_found')
  state().set({ announcements: state().announcements.map((x) => (x.id === id ? { ...x, endAt: new Date().toISOString() } : x)) })
  recordAudit({ journal: a.journal, action: 'Ended announcement early', target: a.title })
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await wait()
  const a = state().announcements.find((x) => x.id === id)
  if (!a) return
  state().set({ announcements: state().announcements.filter((x) => x.id !== id) })
  recordAudit({ journal: a.journal, action: 'Deleted announcement', target: a.title })
}
