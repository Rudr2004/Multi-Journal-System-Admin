import type { JournalCode } from '@/shared/types'
import { JOURNAL_CODES, journalByCode } from './core'
import { NOW, buildPapers } from './papers'
import { buildAnnouncements, buildEntries, type EntryStatus } from './website'

/* Page Management data: static pages (block editor), home sections and SEO auto-link rules. */

const day = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * day).toISOString()
const STAFF = ['Priya Menon', 'Rohan Mehta', 'Karan Shah']

export type BlockType = 'heading' | 'paragraph' | 'list' | 'callout' | 'link'
export const BLOCK_LABEL: Record<BlockType, string> = { heading: 'Heading', paragraph: 'Paragraph', list: 'List', callout: 'Callout', link: 'Link' }

/** Flat on purpose so it works with react-hook-form field arrays. `text` is the heading / paragraph / callout / link label; list items are one per line. */
export interface PageBlock {
  type: BlockType
  text: string
  level: '2' | '3'
  ordered: boolean
  tone: 'info' | 'warning'
  url: string
}
export const newBlock = (type: BlockType): PageBlock => ({ type, text: '', level: '2', ordered: false, tone: 'info', url: '' })

export const PAGE_GROUPS = ['About', 'For Authors', 'Policies'] as const
export type PageGroup = (typeof PAGE_GROUPS)[number]

export interface PageSeo { title: string; description: string; keywords: string[]; canonical: string; ogImage: string }

export interface StaticPage {
  id: string
  journal: JournalCode
  slug: string
  title: string
  group: PageGroup
  blocks: PageBlock[]
  seo: PageSeo
  status: EntryStatus
  updatedAt: string
  updatedBy: string
}

const GROUP_OF: Record<string, PageGroup> = {
  about: 'About', contact: 'About', 'aims-and-scope': 'About',
  'author-guidelines': 'For Authors', 'apc-and-policies': 'For Authors',
  'peer-review-policy': 'Policies', 'publication-ethics': 'Policies',
}

const plain = (s: string) => s.replace(/\*\*/g, '').replace(/\*/g, '').trim()

/** Convert the seed markdown into blocks (headings, paragraphs, lists; tables become lists). */
export function markdownToBlocks(md: string): PageBlock[] {
  const out: PageBlock[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (list) out.push({ ...newBlock('list'), ordered: list.ordered, text: list.items.join('\n') })
    list = null
  }
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const h = /^(#{2,3})\s+(.*)$/.exec(line)
    if (h) { flush(); out.push({ ...newBlock('heading'), level: h[1].length === 2 ? '2' : '3', text: plain(h[2]) }); continue }
    const li = /^(?:[-*]|(\d+)\.)\s+(.*)$/.exec(line)
    if (li) {
      const ordered = !!li[1]
      if (list && list.ordered !== ordered) flush()
      if (!list) list = { ordered, items: [] }
      list.items.push(plain(li[2]))
      continue
    }
    if (line.startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
      if (/^[-: ]+$/.test(cells.join('')) || cells[0] === 'Author location') continue
      if (!list || list.ordered) { flush(); list = { ordered: false, items: [] } }
      list.items.push(cells.map(plain).join(': '))
      continue
    }
    flush()
    out.push({ ...newBlock('paragraph'), text: plain(line) })
  }
  flush()
  return out
}

export function buildStaticPages(): StaticPage[] {
  return buildEntries()
    .filter((e) => e.kind === 'page')
    .map((e) => {
      const blocks = markdownToBlocks(e.content)
      const domain = journalByCode(e.journal).domain
      if (e.slug === 'author-guidelines') {
        blocks.push(
          { ...newBlock('callout'), tone: 'info', text: 'Use the manuscript template to avoid formatting delays during screening.' },
          { ...newBlock('link'), text: 'Download the manuscript template', url: `https://${domain}/downloads/manuscript-template.docx` },
        )
      }
      if (e.slug === 'apc-and-policies') blocks.push({ ...newBlock('callout'), tone: 'warning', text: 'Request a waiver before paying the invoice. Waivers cannot be applied afterwards.' })
      return {
        id: `sp-${e.id}`, journal: e.journal, slug: e.slug, title: e.title, group: GROUP_OF[e.slug] ?? 'About', blocks,
        seo: {
          title: e.seoTitle, description: e.metaDescription,
          keywords: [e.title.toLowerCase(), e.journal.toLowerCase(), e.slug.includes('review') ? 'peer review' : 'open access'],
          canonical: `https://${domain}/${e.slug}`, ogImage: '',
        },
        status: e.status, updatedAt: e.updatedAt, updatedBy: e.updatedBy,
      }
    })
}

export interface EditorsChoiceItem { paperId: string; show: boolean }
export interface HighlightItem { id: string; kind: 'Highlight' | 'Perspective'; title: string; text: string; show: boolean }
export interface Testimonial { id: string; name: string; role: string; quote: string; show: boolean }
export interface NoticeOrderItem { id: string; show: boolean }
export interface HomeSections {
  editorsChoice: EditorsChoiceItem[]
  highlights: HighlightItem[]
  testimonials: Testimonial[]
  notices: NoticeOrderItem[]
  updatedAt: string
  updatedBy: string
}

const TESTIMONIALS: [string, string, string][] = [
  ['Dr. Meera Nambiar', 'Associate Professor, NIT Calicut', 'The review feedback was specific and fair. Our revised paper was stronger, and the whole process took five weeks.'],
  ['Arjun Kulkarni', 'PhD scholar, IIT Bombay', 'Clear status updates at every step. I always knew what was pending and who was handling my manuscript.'],
  ['Prof. Helen Okafor', 'University of Lagos', 'A professional editorial office. Invoice, DOI and certificate arrived within days of acceptance.'],
]

export function buildHomeSections(): Record<JournalCode, HomeSections> {
  const papers = buildPapers()
  const anns = buildAnnouncements()
  const out = {} as Record<JournalCode, HomeSections>
  JOURNAL_CODES.forEach((j, i) => {
    const pub = papers.filter((p) => p.journal === j && (p.status === 'published' || p.status === 'indexed')).slice(0, 4)
    out[j] = {
      editorsChoice: pub.map((p, k) => ({ paperId: p.id, show: k < 3 })),
      highlights: [
        { id: `hl-${j}-1`, kind: 'Highlight', title: 'Most read this quarter', text: `Readers of ${j} spent the most time on practical, method-focused articles. See the full list on the Current Issue page.`, show: true },
        { id: `hl-${j}-2`, kind: 'Perspective', title: 'Perspective: reporting standards in practice', text: 'Our editors reflect on the most common reporting gaps found during screening and how to avoid them.', show: true },
        { id: `hl-${j}-3`, kind: 'Highlight', title: 'Fast-track for special issues', text: 'Papers submitted to an open special issue receive a first decision within 14 days.', show: i % 2 === 0 },
      ],
      testimonials: TESTIMONIALS.map(([name, role, quote], k) => ({ id: `ts-${j}-${k + 1}`, name, role, quote, show: k < 2 || i % 2 === 1 })),
      notices: anns.filter((a) => a.journal === j && a.channel === 'tab').map((a) => ({ id: a.id, show: true })),
      updatedAt: ago(4 + i), updatedBy: STAFF[i % 3],
    }
  })
  return out
}

export type SeoTargetType = 'article' | 'subject' | 'search'
export const SEO_TARGET_LABEL: Record<SeoTargetType, string> = { article: 'Article', subject: 'Subject page', search: 'Search results' }
export interface SeoRule {
  id: string
  journal: JournalCode
  keyword: string
  targetType: SeoTargetType
  /** Paper ID, subject name or search query, depending on the type. */
  target: string
  maxPerPage: number
  on: boolean
}

export function buildSeoRules(): SeoRule[] {
  const papers = buildPapers()
  const out: SeoRule[] = []
  for (const j of JOURNAL_CODES) {
    const first = papers.find((p) => p.journal === j && p.status === 'published')
    out.push({ id: `seo-${j}-1`, journal: j, keyword: 'peer review', targetType: 'search', target: 'peer review', maxPerPage: 2, on: true })
    out.push({ id: `seo-${j}-2`, journal: j, keyword: 'open access', targetType: 'subject', target: 'Open access publishing', maxPerPage: 1, on: true })
    if (first) out.push({ id: `seo-${j}-3`, journal: j, keyword: 'article processing charge', targetType: 'article', target: first.id, maxPerPage: 1, on: j !== 'IJFRD' })
  }
  return out
}
