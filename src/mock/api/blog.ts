import type { JournalCode } from '@/shared/types'
import { formatDateTime } from '@/shared/formatters'
import { currentActor, newId, recordAudit } from '../actions'
import { useSession } from '../store'
import type { BlogDraft, BlogPost, BlogResource, BlogStatus, ResourceCategory } from '../data/blog'
import { useBlogStore } from '../stores/blog'
import { ApiError, delay } from './latency'

const wait = () => delay(null, 250, 600)
const state = () => useBlogStore.getState()

export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

const replacePost = (id: string, fn: (p: BlogPost) => BlogPost) =>
  state().set({ posts: state().posts.map((p) => (p.id === id ? fn(p) : p)) })

const find = (id: string) => {
  const p = state().posts.find((x) => x.id === id)
  if (!p) throw new ApiError('This blog post no longer exists.', 'not_found')
  return p
}

const stamp = () => ({ updatedAt: new Date().toISOString(), updatedBy: currentActor() })

function assertSlugFree(journal: JournalCode, slug: string, exceptId?: string) {
  if (state().posts.some((p) => p.journal === journal && p.slug === slug && p.id !== exceptId)) {
    throw new ApiError(`The address "/blog/${slug}" is already used by another post in ${journal}.`, 'slug_taken')
  }
}

/* ---------------- Posts ---------------- */
/** `authorId` limits the list to one person's posts (Reviewers only see their own). */
export async function listPosts(q: { journals: JournalCode[]; authorId?: string }): Promise<BlogPost[]> {
  await wait()
  return state().posts
    .filter((p) => q.journals.includes(p.journal) && (!q.authorId || p.authorId === q.authorId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getPost(id: string): Promise<BlogPost> {
  await wait()
  return find(id)
}

export async function createPost(input: { journal: JournalCode; title: string }): Promise<BlogPost> {
  await wait()
  const base = slugify(input.title) || 'untitled'
  let slug = base
  let n = 2
  while (state().posts.some((p) => p.journal === input.journal && p.slug === slug)) slug = `${base}-${n++}`
  const { userId } = useSession.getState()
  const post: BlogPost = {
    id: newId('blog'), journal: input.journal, title: input.title.trim(), slug, content: '', excerpt: '', seoTitle: '', metaDescription: '', keywords: '', cover: 'indigo',
    authorId: userId ?? '', authorName: currentActor(), status: 'draft', ...stamp(),
  }
  state().set({ posts: [post, ...state().posts] })
  recordAudit({ journal: post.journal, action: 'Created blog post', target: post.title })
  return post
}

export async function savePost(id: string, values: BlogDraft): Promise<BlogPost> {
  await wait()
  const before = find(id)
  if (before.status === 'published') throw new ApiError('A published post cannot be edited here.', 'invalid')
  assertSlugFree(before.journal, values.slug, id)
  const next: BlogPost = { ...before, ...values, autosave: undefined, ...stamp() }
  replacePost(id, () => next)
  recordAudit({ journal: before.journal, action: 'Edited blog post', target: values.title })
  return next
}

/** Silent background save of the working copy; the saved version is untouched. */
export async function autosavePost(id: string, values: BlogDraft): Promise<void> {
  await delay(null, 80, 200)
  replacePost(id, (p) => ({ ...p, autosave: { values, at: new Date().toISOString() } }))
}

export async function discardAutosave(id: string): Promise<void> {
  await delay(null, 80, 200)
  replacePost(id, (p) => ({ ...p, autosave: undefined }))
}

function transition(p: BlogPost, from: BlogStatus[], to: BlogStatus, extra: Partial<BlogPost>, action: string, newValue?: string) {
  if (!from.includes(p.status)) throw new ApiError(`This post is ${p.status}; it cannot move to ${to}.`, 'invalid')
  replacePost(p.id, (x) => ({ ...x, status: to, ...extra, ...stamp() }))
  recordAudit({ journal: p.journal, action, target: p.title, oldValue: p.status, newValue: newValue ?? to })
}

export async function submitForApproval(id: string): Promise<void> {
  await wait()
  const p = find(id)
  if (!p.content.trim() || !p.title.trim()) throw new ApiError('Add a title and some content before submitting.', 'invalid')
  transition(p, ['draft', 'rejected'], 'pending', { submittedAt: new Date().toISOString(), rejectionReason: undefined }, 'Blog post submitted for approval')
}

export async function approvePost(id: string): Promise<void> {
  await wait()
  transition(find(id), ['pending'], 'approved', { rejectionReason: undefined }, 'Blog post approved')
}

export async function rejectPost(id: string, reason: string): Promise<void> {
  await wait()
  if (reason.trim().length < 10) throw new ApiError('A reason of at least 10 characters is required.', 'invalid')
  transition(find(id), ['pending'], 'rejected', { rejectionReason: reason.trim() }, 'Blog post rejected', reason.trim())
}

export async function publishPost(id: string): Promise<void> {
  await wait()
  transition(find(id), ['approved', 'scheduled'], 'published', { publishedAt: new Date().toISOString(), scheduledAt: undefined }, 'Blog post published')
}

export async function schedulePost(id: string, at: string): Promise<void> {
  await wait()
  if (new Date(at).getTime() <= Date.now()) throw new ApiError('Choose a date and time in the future.', 'invalid')
  transition(find(id), ['approved', 'scheduled'], 'scheduled', { scheduledAt: new Date(at).toISOString() }, 'Blog post scheduled', formatDateTime(at))
}

export async function deletePost(id: string): Promise<void> {
  await wait()
  const p = find(id)
  if (p.status === 'published') throw new ApiError('Unpublish is not available for published posts yet; ask a Super Admin.', 'invalid')
  state().set({ posts: state().posts.filter((x) => x.id !== id) })
  recordAudit({ journal: p.journal, action: 'Deleted blog post', target: p.title })
}

/* ---------------- Resources ---------------- */
export interface ResourceInput {
  journal: JournalCode
  title: string
  description: string
  category: ResourceCategory
  fileName: string
  sizeKb: number
}

export async function listResources(q: { journals: JournalCode[]; publishedOnly?: boolean }): Promise<BlogResource[]> {
  await wait()
  return state().resources
    .filter((r) => q.journals.includes(r.journal) && (!q.publishedOnly || r.published))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function saveResource(id: string | undefined, input: ResourceInput): Promise<BlogResource> {
  await wait()
  const { resources, set } = state()
  if (id) {
    const before = resources.find((r) => r.id === id)
    if (!before) throw new ApiError('This resource no longer exists.', 'not_found')
    const next = { ...before, ...input, ...stamp() }
    set({ resources: resources.map((r) => (r.id === id ? next : r)) })
    recordAudit({ journal: next.journal, action: 'Edited resource', target: next.title })
    return next
  }
  const res: BlogResource = { id: newId('res'), ...input, published: false, downloads: 0, ...stamp() }
  set({ resources: [res, ...resources] })
  recordAudit({ journal: res.journal, action: 'Added resource', target: res.title })
  return res
}

export async function setResourcePublished(id: string, published: boolean): Promise<void> {
  await wait()
  const { resources, set } = state()
  const r = resources.find((x) => x.id === id)
  if (!r) throw new ApiError('This resource no longer exists.', 'not_found')
  set({ resources: resources.map((x) => (x.id === id ? { ...x, published, ...stamp() } : x)) })
  recordAudit({ journal: r.journal, action: published ? 'Published resource' : 'Unpublished resource', target: r.title, oldValue: r.published ? 'published' : 'hidden', newValue: published ? 'published' : 'hidden' })
}

export async function recordDownload(id: string): Promise<void> {
  await delay(null, 80, 200)
  const { resources, set } = state()
  set({ resources: resources.map((x) => (x.id === id ? { ...x, downloads: x.downloads + 1 } : x)) })
}

export async function deleteResource(id: string): Promise<void> {
  await wait()
  const { resources, set } = state()
  const r = resources.find((x) => x.id === id)
  if (!r) return
  set({ resources: resources.filter((x) => x.id !== id) })
  recordAudit({ journal: r.journal, action: 'Deleted resource', target: r.title })
}
