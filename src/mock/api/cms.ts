import type { JournalCode } from '@/shared/types'
import { currentActor, newId, recordAudit } from '../actions'
import type { CmsEntry, EntryDraft, EntryKind, EntryStatus } from '../data/website'
import { useWebsiteStore } from '../stores/website'
import { ApiError, delay } from './latency'

const wait = () => delay(null, 250, 600)
const state = () => useWebsiteStore.getState()

export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

export async function listEntries(q: { kind: EntryKind; journals: JournalCode[] }): Promise<CmsEntry[]> {
  await wait()
  return state()
    .entries.filter((e) => e.kind === q.kind && q.journals.includes(e.journal))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getEntry(id: string): Promise<CmsEntry> {
  await wait()
  const e = state().entries.find((x) => x.id === id)
  if (!e) throw new ApiError('This page or post no longer exists.', 'not_found')
  return e
}

const replace = (id: string, fn: (e: CmsEntry) => CmsEntry) =>
  useWebsiteStore.getState().set({ entries: state().entries.map((e) => (e.id === id ? fn(e) : e)) })

function assertSlugFree(journal: JournalCode, kind: EntryKind, slug: string, exceptId?: string) {
  if (state().entries.some((e) => e.journal === journal && e.kind === kind && e.slug === slug && e.id !== exceptId)) {
    throw new ApiError(`The address “/${slug}” is already used by another ${kind} in ${journal}.`, 'slug_taken')
  }
}

export async function createEntry(input: { journal: JournalCode; kind: EntryKind; title: string }): Promise<CmsEntry> {
  await wait()
  let slug = slugify(input.title) || 'untitled'
  let n = 2
  while (state().entries.some((e) => e.journal === input.journal && e.kind === input.kind && e.slug === slug)) slug = `${slugify(input.title)}-${n++}`
  const entry: CmsEntry = {
    id: newId(input.kind === 'page' ? 'cms' : 'post'), journal: input.journal, kind: input.kind, title: input.title.trim(), slug,
    content: '', status: 'draft', seoTitle: '', metaDescription: '', author: currentActor(), category: input.kind === 'post' ? 'News' : '',
    publishDate: new Date().toISOString().slice(0, 10), cover: 'indigo', updatedAt: new Date().toISOString(), updatedBy: currentActor(),
  }
  state().set({ entries: [entry, ...state().entries] })
  recordAudit({ journal: entry.journal, action: `Created ${input.kind}`, target: entry.title })
  return entry
}

export async function saveEntry(id: string, values: EntryDraft): Promise<CmsEntry> {
  await wait()
  const before = state().entries.find((e) => e.id === id)
  if (!before) throw new ApiError('This page or post no longer exists.', 'not_found')
  assertSlugFree(before.journal, before.kind, values.slug, id)
  const next: CmsEntry = { ...before, ...values, autosave: undefined, updatedAt: new Date().toISOString(), updatedBy: currentActor() }
  replace(id, () => next)
  recordAudit({
    journal: before.journal, action: before.status !== values.status ? (values.status === 'published' ? `Published ${before.kind}` : `Unpublished ${before.kind}`) : `Edited ${before.kind}`,
    target: values.title, oldValue: before.status, newValue: values.status,
  })
  return next
}

/** Silent background save of the working copy; never touches the live version. */
export async function autosaveEntry(id: string, values: EntryDraft): Promise<void> {
  await delay(null, 80, 200)
  replace(id, (e) => ({ ...e, autosave: { values, at: new Date().toISOString() } }))
}

export async function discardAutosave(id: string): Promise<void> {
  await delay(null, 80, 200)
  replace(id, (e) => ({ ...e, autosave: undefined }))
}

export async function setEntryStatus(id: string, status: EntryStatus): Promise<void> {
  await wait()
  const e = state().entries.find((x) => x.id === id)
  if (!e) throw new ApiError('This page or post no longer exists.', 'not_found')
  replace(id, (x) => ({ ...x, status, updatedAt: new Date().toISOString(), updatedBy: currentActor() }))
  recordAudit({ journal: e.journal, action: status === 'published' ? `Published ${e.kind}` : `Unpublished ${e.kind}`, target: e.title, oldValue: e.status, newValue: status })
}

export async function deleteEntry(id: string): Promise<void> {
  await wait()
  const e = state().entries.find((x) => x.id === id)
  if (!e) return
  state().set({ entries: state().entries.filter((x) => x.id !== id) })
  recordAudit({ journal: e.journal, action: `Deleted ${e.kind}`, target: e.title })
}
