import type { JournalCode, Paper } from '@/shared/types'
import { currentActor, recordAudit } from '../actions'
import type { Announcement } from '../data/website'
import type { HomeSections, PageBlock, PageGroup, PageSeo, SeoRule, StaticPage } from '../data/pageMgmt'
import { useDataStore } from '../store'
import { useWebsiteStore } from '../stores/website'
import { ApiError, delay } from './latency'

/* Page Management API: static pages, home page sections and SEO auto-link rules. */

const wait = () => delay(null, 250, 600)
const state = () => useWebsiteStore.getState()

export async function listStaticPages(journals: JournalCode[]): Promise<StaticPage[]> {
  await wait()
  return state().staticPages.filter((p) => journals.includes(p.journal)).sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title))
}

export async function getStaticPage(id: string): Promise<StaticPage> {
  await wait()
  const p = state().staticPages.find((x) => x.id === id)
  if (!p) throw new ApiError('This page no longer exists.', 'not_found')
  return structuredClone(p)
}

export interface StaticPageInput { title: string; group: PageGroup; blocks: PageBlock[]; seo: PageSeo; status: StaticPage['status'] }

export async function saveStaticPage(id: string, v: StaticPageInput): Promise<StaticPage> {
  await wait()
  const before = state().staticPages.find((x) => x.id === id)
  if (!before) throw new ApiError('This page no longer exists.', 'not_found')
  const next: StaticPage = { ...before, ...v, updatedAt: new Date().toISOString(), updatedBy: currentActor() }
  state().set({ staticPages: state().staticPages.map((p) => (p.id === id ? next : p)) })
  const statusChanged = before.status !== v.status
  recordAudit({
    journal: before.journal,
    action: statusChanged ? (v.status === 'published' ? 'Published page' : 'Unpublished page') : 'Edited page',
    target: `${v.title} (/${before.slug})`, oldValue: before.status, newValue: v.status,
  })
  return next
}

export async function setStaticPageStatus(id: string, status: StaticPage['status']): Promise<void> {
  await wait()
  const before = state().staticPages.find((x) => x.id === id)
  if (!before) throw new ApiError('This page no longer exists.', 'not_found')
  state().set({ staticPages: state().staticPages.map((p) => (p.id === id ? { ...p, status, updatedAt: new Date().toISOString(), updatedBy: currentActor() } : p)) })
  recordAudit({ journal: before.journal, action: status === 'published' ? 'Published page' : 'Unpublished page', target: before.title, oldValue: before.status, newValue: status })
}

/* ---------- Home page sections ---------- */

export interface HomeSectionsData { sections: HomeSections; papers: Paper[]; notices: Announcement[] }

export async function getHomeSections(journal: JournalCode): Promise<HomeSectionsData> {
  await wait()
  const sections = structuredClone(state().homeSections[journal])
  const papers = useDataStore.getState().papers.filter((p) => p.journal === journal && (p.status === 'published' || p.status === 'indexed'))
  const notices = state().announcements.filter((a) => a.journal === journal && a.channel === 'tab')
  return { sections, papers, notices }
}

export async function saveHomeSections(journal: JournalCode, v: HomeSections): Promise<void> {
  await wait()
  const before = state().homeSections[journal]
  const shown = (s: HomeSections) => `${s.editorsChoice.filter((x) => x.show).length} Editor's Choice, ${s.highlights.filter((x) => x.show).length} highlights, ${s.testimonials.filter((x) => x.show).length} testimonials, ${s.notices.filter((x) => x.show).length} notices shown`
  state().set({ homeSections: { ...state().homeSections, [journal]: { ...v, updatedAt: new Date().toISOString(), updatedBy: currentActor() } } })
  recordAudit({ journal, action: 'Home page sections updated', target: `${journal} home page`, oldValue: shown(before), newValue: shown(v) })
}

/* ---------- SEO keyword auto-linking ---------- */

export interface SeoData { rules: SeoRule[]; papers: Paper[] }

export async function getSeoRules(journal: JournalCode): Promise<SeoData> {
  await wait()
  return {
    rules: structuredClone(state().seoRules.filter((r) => r.journal === journal)),
    papers: useDataStore.getState().papers.filter((p) => p.journal === journal && (p.status === 'published' || p.status === 'indexed')),
  }
}

export async function saveSeoRules(journal: JournalCode, rules: SeoRule[]): Promise<void> {
  await wait()
  const before = state().seoRules.filter((r) => r.journal === journal)
  state().set({ seoRules: [...state().seoRules.filter((r) => r.journal !== journal), ...rules.map((r) => ({ ...r, journal }))] })
  recordAudit({ journal, action: 'SEO content auto-link rules updated', target: `${journal} SEO settings`, oldValue: `${before.filter((r) => r.on).length} active of ${before.length} rules`, newValue: `${rules.filter((r) => r.on).length} active of ${rules.length} rules` })
}
