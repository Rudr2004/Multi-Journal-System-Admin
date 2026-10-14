import type { JournalCode } from '@/shared/types'
import { NOW } from './papers'

const day = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * day).toISOString()
const ahead = (days: number) => new Date(NOW.getTime() + days * day).toISOString()

/* ------------------------------------------------------------------ */
/* Blog posts                                                           */
/* ------------------------------------------------------------------ */
export type BlogStatus = 'draft' | 'pending' | 'approved' | 'scheduled' | 'published' | 'rejected'

export const BLOG_STATUS_META: Record<BlogStatus, { label: string; tone: 'neutral' | 'warning' | 'info' | 'accent' | 'success' | 'danger'; order: number }> = {
  draft: { label: 'Draft', tone: 'neutral', order: 0 },
  pending: { label: 'Pending approval', tone: 'warning', order: 1 },
  approved: { label: 'Approved', tone: 'info', order: 2 },
  scheduled: { label: 'Scheduled', tone: 'accent', order: 3 },
  published: { label: 'Published', tone: 'success', order: 4 },
  rejected: { label: 'Rejected', tone: 'danger', order: 5 },
}
export const BLOG_STATUSES = Object.keys(BLOG_STATUS_META) as BlogStatus[]

export const COVER_TONES = ['indigo', 'sky', 'emerald', 'amber', 'rose', 'slate'] as const
export type CoverTone = (typeof COVER_TONES)[number]

/** The editable fields of a post (also what autosave stores). */
export interface BlogDraft {
  title: string
  slug: string
  content: string
  excerpt: string
  seoTitle: string
  metaDescription: string
  /** comma separated */
  keywords: string
  cover: CoverTone
}

export interface BlogPost extends BlogDraft {
  id: string
  journal: JournalCode
  authorId: string
  authorName: string
  status: BlogStatus
  rejectionReason?: string
  scheduledAt?: string
  publishedAt?: string
  submittedAt?: string
  updatedAt: string
  updatedBy: string
  autosave?: { values: BlogDraft; at: string }
}

const post = (p: Omit<BlogPost, 'excerpt' | 'seoTitle' | 'metaDescription' | 'keywords' | 'cover' | 'updatedBy'> & Partial<BlogDraft> & { updatedBy?: string }): BlogPost => ({
  excerpt: '', seoTitle: '', metaDescription: '', keywords: '', cover: 'indigo', updatedBy: p.authorName, ...p,
})

export function buildPosts(): BlogPost[] {
  return [
    post({
      id: 'blog-1', journal: 'IJMAT', title: 'How to prepare your manuscript for double-blind review', slug: 'prepare-manuscript-double-blind-review',
      authorId: 'u-reviewer', authorName: 'Dr. Ananya Iyer', status: 'draft', updatedAt: ago(1), cover: 'sky',
      excerpt: 'Five practical checks that keep author identity out of your file before you submit.',
      content: '## Why anonymity matters\n\nIJMAT reviews every paper double-blind. A single author name in the file properties can undo that.\n\n## Before you upload\n\n- Remove author names and affiliations from the title page\n- Replace self-citations with *Author (Year)*\n- Strip document properties and tracked-change names\n- Keep acknowledgements for the revised version\n\n> Tip: use the manuscript template in Resources, it already has an anonymous title page.\n',
      seoTitle: 'Prepare your manuscript for double-blind review', metaDescription: 'Five practical checks to keep author identity out of your manuscript before submitting to a double-blind journal.', keywords: 'double-blind review, manuscript preparation, anonymisation',
    }),
    post({
      id: 'blog-2', journal: 'IJMAT', title: 'What reviewers look for in a methodology section', slug: 'what-reviewers-look-for-methodology',
      authorId: 'u-reviewer', authorName: 'Dr. Ananya Iyer', status: 'pending', updatedAt: ago(2), submittedAt: ago(2), cover: 'emerald',
      excerpt: 'A reviewer-side view of the questions a good methods section answers before they are asked.',
      content: '## The reviewer’s checklist\n\n1. Is the sampling frame described?\n2. Can the analysis be reproduced from the text?\n3. Are limitations stated honestly?\n\nA methods section that answers these three questions usually moves through review faster.\n',
      seoTitle: 'What reviewers look for in a methodology section', metaDescription: 'The three questions every reviewer asks of a methods section, and how to answer them in advance.', keywords: 'methodology, peer review, research methods',
    }),
    post({
      id: 'blog-3', journal: 'IJMAT', title: 'Volume 4, Issue 2 call for papers', slug: 'volume-4-issue-2-call-for-papers',
      authorId: 'u-editor', authorName: 'Rohan Mehta', status: 'approved', updatedAt: ago(3), submittedAt: ago(5), cover: 'indigo',
      excerpt: 'Submissions for the next issue close on 30 November.',
      content: '## Call for papers\n\nThe International Journal of Multidisciplinary Applied Technology invites original research for Volume 4, Issue 2.\n\n- Submission deadline: **30 November**\n- Decision within 21 days\n- Open access, no embargo\n',
      seoTitle: 'IJMAT Volume 4 Issue 2 call for papers', metaDescription: 'IJMAT invites original research for Volume 4, Issue 2. Submissions close on 30 November.', keywords: 'call for papers, IJMAT, volume 4',
    }),
    post({
      id: 'blog-4', journal: 'IJMAT', title: 'Understanding article processing charges and GST', slug: 'article-processing-charges-and-gst',
      authorId: 'u-reviewer', authorName: 'Dr. Ananya Iyer', status: 'scheduled', updatedAt: ago(4), submittedAt: ago(7), scheduledAt: ahead(2), cover: 'amber',
      excerpt: 'What the charge covers, when it is due and how your GST invoice is issued.',
      content: '## What the charge covers\n\nThe fee is payable only after acceptance and covers editing, DOI registration and hosting.\n\n## GST\n\nA GST invoice is generated once an offline payment is verified.\n',
      seoTitle: 'Article processing charges and GST explained', metaDescription: 'What the article processing charge covers, when it is due and how GST invoices are issued after payment.', keywords: 'APC, GST invoice, publication fee',
    }),
    post({
      id: 'blog-5', journal: 'IJMAT', title: 'Why we adopted ORCID for all corresponding authors', slug: 'orcid-for-corresponding-authors',
      authorId: 'u-editor', authorName: 'Rohan Mehta', status: 'published', updatedAt: ago(12), publishedAt: ago(10), submittedAt: ago(15), cover: 'slate',
      excerpt: 'Persistent identifiers reduce misattribution and speed up indexing.',
      content: '## A persistent identity\n\nFrom this year every corresponding author is asked for an ORCID iD at submission.\n\n- Fewer name-matching errors\n- Cleaner Crossref metadata\n- Easier indexing in Google Scholar\n',
      seoTitle: 'ORCID for corresponding authors', metaDescription: 'Why IJMAT now asks every corresponding author for an ORCID iD at submission.', keywords: 'ORCID, author identity, indexing',
    }),
    post({
      id: 'blog-6', journal: 'IJMAT', title: 'Top ten reasons manuscripts are desk rejected', slug: 'reasons-manuscripts-are-desk-rejected',
      authorId: 'u-reviewer', authorName: 'Dr. Ananya Iyer', status: 'rejected', updatedAt: ago(6), submittedAt: ago(8), cover: 'rose',
      rejectionReason: 'The post reads like a list of complaints. Please reframe each point as advice to authors and cite the journal’s scope statement before resubmitting.',
      content: '## Desk rejection\n\n1. Out of scope\n2. Missing ethics statement\n3. No data availability statement\n',
      keywords: 'desk rejection',
    }),
    post({
      id: 'blog-7', journal: 'IJCSD', title: 'Reproducible machine-learning papers: our new checklist', slug: 'reproducible-machine-learning-checklist',
      authorId: 'u-editor', authorName: 'Rohan Mehta', status: 'pending', updatedAt: ago(1), submittedAt: ago(1), cover: 'sky',
      excerpt: 'From this issue every ML submission to IJCSD must state its code, data and seed policy.',
      content: '## What changes\n\nSubmissions that report experimental results must now include:\n\n- A link to the code repository\n- Dataset versions and licences\n- Random seeds used\n',
      seoTitle: 'IJCSD reproducibility checklist for ML papers', metaDescription: 'IJCSD now requires a code, data and seed statement for machine-learning submissions. See the checklist.', keywords: 'reproducibility, machine learning, checklist',
    }),
    post({
      id: 'blog-8', journal: 'JIMRT', title: 'Indexing update: JIMRT accepted into two new directories', slug: 'indexing-update-two-new-directories',
      authorId: 'u-super', authorName: 'Priya Menon', status: 'published', updatedAt: ago(20), publishedAt: ago(19), cover: 'emerald',
      excerpt: 'What the new listings mean for authors and how they affect article discoverability.',
      content: '## Good news\n\nJIMRT has been accepted into two additional abstracting directories.\n\nArticles published from this issue onward are included automatically.\n',
      seoTitle: 'JIMRT indexing update', metaDescription: 'JIMRT is now listed in two new directories. Learn what this means for the discoverability of your article.', keywords: 'indexing, JIMRT, discoverability',
    }),
  ]
}

/* ------------------------------------------------------------------ */
/* Resources                                                            */
/* ------------------------------------------------------------------ */
export const RESOURCE_CATEGORIES = ['Templates', 'Guides', 'Checklists', 'Policies'] as const
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]

export interface BlogResource {
  id: string
  journal: JournalCode
  title: string
  description: string
  category: ResourceCategory
  fileName: string
  sizeKb: number
  published: boolean
  downloads: number
  updatedAt: string
  updatedBy: string
}

export function buildResources(): BlogResource[] {
  const r = (id: string, journal: JournalCode, title: string, category: ResourceCategory, fileName: string, sizeKb: number, downloads: number, published: boolean, days: number, description: string): BlogResource => ({
    id, journal, title, category, fileName, sizeKb, downloads, published, description, updatedAt: ago(days), updatedBy: 'Rohan Mehta',
  })
  return [
    r('res-1', 'IJMAT', 'Author guidelines template', 'Templates', 'IJMAT_Author_Guidelines_Template.docx', 142, 1284, true, 14, 'Formatting rules for headings, tables, figures and references.'),
    r('res-2', 'IJMAT', 'Manuscript template (Word)', 'Templates', 'IJMAT_Manuscript_Template.docx', 96, 2310, true, 30, 'Anonymous title page, abstract, body and reference styles pre-configured.'),
    r('res-3', 'IJMAT', 'Research ethics checklist', 'Checklists', 'Research_Ethics_Checklist.pdf', 78, 842, true, 21, 'Confirm consent, approvals and data-protection steps before submission.'),
    r('res-4', 'IJMAT', 'APC and GST payment guide', 'Guides', 'APC_and_GST_Guide.pdf', 210, 655, true, 9, 'When the charge is due, accepted payment modes and how invoices are issued.'),
    r('res-5', 'IJCSD', 'Reproducibility checklist for ML submissions', 'Checklists', 'IJCSD_Reproducibility_Checklist.pdf', 64, 318, true, 3, 'Code, data and random-seed statements required for machine-learning papers.'),
    r('res-6', 'JIMRT', 'Reviewer guide: writing a constructive report', 'Guides', 'Reviewer_Guide.pdf', 188, 412, false, 6, 'Scoring criteria, tone and how to structure comments to the author.'),
    r('res-7', 'IJFRD', 'Data availability statement template', 'Templates', 'Data_Availability_Statement.docx', 38, 190, true, 40, 'Ready-to-use wording for open, restricted and proprietary data.'),
    r('res-8', 'IJECM', 'Copyright and licence policy', 'Policies', 'IJECM_Copyright_Licence_Policy.pdf', 120, 276, true, 55, 'CC BY 4.0 licence terms and author rights after publication.'),
  ]
}
