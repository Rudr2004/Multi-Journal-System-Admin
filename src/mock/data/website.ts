import type { JournalCode } from '@/shared/types'
import { JOURNAL_CODES, journalByCode } from './core'
import { NOW, buildPapers } from './papers'

const day = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * day).toISOString()
const ahead = (days: number) => new Date(NOW.getTime() + days * day).toISOString()

/* =====================================================================
 * CMS — pages and blog posts
 * ===================================================================== */
export type EntryKind = 'page' | 'post'
export type EntryStatus = 'draft' | 'published'

export const POST_CATEGORIES = ['News', 'Editorial', 'Research tips', 'Indexing', 'Events'] as const
export const COVER_TONES = ['indigo', 'sky', 'emerald', 'amber', 'rose', 'slate'] as const
export type CoverTone = (typeof COVER_TONES)[number]

/** The editable fields of a page or post (also what autosave stores). */
export interface EntryDraft {
  title: string
  slug: string
  content: string
  status: EntryStatus
  seoTitle: string
  metaDescription: string
  author: string
  category: string
  publishDate: string // yyyy-mm-dd
  cover: CoverTone
}

export interface CmsEntry extends EntryDraft {
  id: string
  journal: JournalCode
  kind: EntryKind
  updatedAt: string
  updatedBy: string
  autosave?: { values: EntryDraft; at: string }
}

const SUBJECT: Record<JournalCode, string> = {
  IJMAT: 'multidisciplinary applied technology, from smart materials and manufacturing to technology-enabled learning',
  JIMRT: 'management research and the technology that shapes organisations, markets and public institutions',
  IJCSD: 'computer science and software development, including machine learning, distributed systems and software engineering',
  IJECM: 'engineering, computing and materials, with emphasis on structures, energy systems and embedded design',
  IJFRD: 'finance research and development, covering banking, capital markets, household finance and sustainable finance',
}

interface PageDef { slug: string; title: string; seo: string; meta: (n: string, c: JournalCode) => string; body: (c: JournalCode) => string }

const PAGE_DEFS: PageDef[] = [
  {
    slug: 'about', title: 'About the Journal', seo: 'About',
    meta: (n) => `${n} is a peer-reviewed, open-access journal publishing original research, reviews and case studies.`,
    body: (c) => `## About ${c}\n\n**${journalByCode(c).name}** (ISSN ${journalByCode(c).issn}) is a peer-reviewed, open-access journal published by Edtech Publishers. It publishes original research on ${SUBJECT[c]}.\n\nEvery submission is screened by the editorial office, reviewed by at least two independent experts and, if accepted, published online under a Creative Commons Attribution licence with a permanent DOI.\n\n### At a glance\n\n- Publication frequency: quarterly (January, April, July and October)\n- Average time to first decision: 21 days\n- Article types: research articles, review articles, case studies and short communications\n- Indexing: Google Scholar, Crossref, DOAJ (application in progress)\n\n### Contact the editorial office\n\nWrite to the editorial office at editorial@${journalByCode(c).domain.replace('.example.org', '')}.example.org and we will respond within two working days.`,
  },
  {
    slug: 'aims-and-scope', title: 'Aims & Scope', seo: 'Aims & Scope',
    meta: (n) => `Aims, scope and subject areas covered by ${n}. Check fit before you submit.`,
    body: (c) => `## Aims\n\n${c} aims to provide a rigorous, accessible home for research on ${SUBJECT[c]}. We value methodological soundness and clear reporting over novelty alone, and we welcome replication studies and negative results.\n\n## Scope\n\nWe consider submissions that fall within the following areas:\n\n- Empirical studies using quantitative, qualitative or mixed methods\n- Systematic reviews and meta-analyses\n- Applied case studies from industry, government or education\n- Short communications reporting preliminary but well-supported findings\n\n## Out of scope\n\nManuscripts that are purely promotional, that have been published elsewhere, or that fall outside the subject areas above will be returned without review.`,
  },
  {
    slug: 'author-guidelines', title: 'Author Guidelines', seo: 'Author Guidelines',
    meta: (n) => `How to prepare and submit a manuscript to ${n}: formatting, references, figures and declarations.`,
    body: () => `## Preparing your manuscript\n\nSubmit your manuscript as a Word or LaTeX-exported PDF file. Use a single-column layout, 11 pt body text and numbered pages.\n\n### Structure\n\n1. Title, author names, affiliations and the corresponding author's email\n2. Abstract of 150 to 250 words and 4 to 6 keywords\n3. Introduction, methods, results, discussion and conclusion\n4. References in APA 7th edition style\n\n### Figures and tables\n\nSubmit figures at 300 dpi or higher with descriptive captions. Tables must be editable text, not images.\n\n### Declarations\n\nPlease include statements on funding, conflicts of interest, data availability and ethics approval where human participants were involved.\n\n### After acceptance\n\nOnce your paper is accepted you will receive an invoice for the article processing charge. Production begins after payment is verified.`,
  },
  {
    slug: 'peer-review-policy', title: 'Peer Review Policy', seo: 'Peer Review Policy',
    meta: (n) => `How ${n} handles double-blind peer review, reviewer selection and editorial decisions.`,
    body: () => `## Double-blind peer review\n\nAll research articles undergo double-blind peer review: reviewers do not see author identities and authors do not see reviewer identities.\n\n### Process\n\n1. **Screening** — the editorial office checks scope, formatting and similarity before assigning an editor.\n2. **Review** — at least two independent reviewers assess the manuscript. Reviewers are asked to respond within 14 days.\n3. **Decision** — the handling editor recommends accept, minor revision, major revision or reject. The final decision rests with the editor.\n4. **Revision** — authors have 21 days to submit a revised manuscript with a response to each comment.\n\n### Reviewer conduct\n\nReviewers must declare conflicts of interest, keep manuscripts confidential and must not use unpublished material for their own work.`,
  },
  {
    slug: 'publication-ethics', title: 'Publication Ethics', seo: 'Publication Ethics',
    meta: (n) => `${n} follows COPE guidelines on authorship, plagiarism, data integrity, corrections and retractions.`,
    body: () => `## Our commitments\n\nWe follow the guidelines of the Committee on Publication Ethics (COPE) and expect all authors, reviewers and editors to do the same.\n\n### Authorship\n\nAll listed authors must have made a substantial contribution and approved the final manuscript. Changes to the author list after submission require written consent from every author.\n\n### Originality and plagiarism\n\nSubmitted work must be original and not under consideration elsewhere. Text overlap is assessed during screening and reported to the handling editor.\n\n### Corrections and retractions\n\nWhere a published article contains an error that affects its interpretation we publish a correction. Articles with serious integrity concerns are retracted, with a public notice explaining the reason.\n\n### Complaints\n\nConcerns can be raised with the editorial office. We acknowledge every complaint within three working days.`,
  },
  {
    slug: 'apc-and-policies', title: 'APC & Policies', seo: 'APC & Policies',
    meta: (n) => `Article processing charges, waivers, refunds and licensing policy for ${n}.`,
    body: () => `## Article processing charge\n\nThere is no charge for submission or peer review. If your paper is accepted, an article processing charge (APC) applies to cover production, hosting and indexing.\n\n| Author location | APC |\n| --- | --- |\n| India | ₹2,950 plus applicable GST |\n| Outside India | US$49 |\n\n### Waivers\n\nWaivers of up to 100% are available for authors from low-income countries and for early-career researchers without institutional funding. Request a waiver before paying the invoice.\n\n### Refunds\n\nIf a payment is made in error, or the article is withdrawn before production starts, the APC is refunded within 10 working days.\n\n### Licence and copyright\n\nArticles are published under CC BY 4.0. Authors retain copyright.`,
  },
  {
    slug: 'contact', title: 'Contact', seo: 'Contact',
    meta: (n) => `Contact the editorial office of ${n} for submission, payment and indexing questions.`,
    body: (c) => `## Editorial office\n\nEdtech Publishers\nPlot 14, Knowledge Park, Pune 411057, India\n\n- General enquiries: editorial@${c.toLowerCase()}.example.org\n- Payments and invoices: accounts@${c.toLowerCase()}.example.org\n- Phone and WhatsApp: +91 20 4000 1100 (Monday to Friday, 10:00 to 18:00 IST)\n\n### Response times\n\nWe reply to email within two working days. Payment queries are handled within one working day.`,
  },
]

const DRAFT_PAGES = new Set(['IJFRD:apc-and-policies', 'JIMRT:peer-review-policy', 'IJECM:publication-ethics'])

const STAFF = ['Priya Menon', 'Rohan Mehta', 'Karan Shah']

interface PostSeed { journal: JournalCode; title: string; slug: string; category: string; cover: CoverTone; days: number; draft?: boolean; body: string }

const POSTS: PostSeed[] = [
  { journal: 'IJMAT', title: 'Volume 3 Issue 3 is now live', slug: 'volume-3-issue-3-now-live', category: 'News', cover: 'indigo', days: 12, body: 'We are pleased to announce that **Volume 3, Issue 3** of IJMAT is now available online.\n\nThis issue brings together eleven papers on smart-material adoption, digital twins and technology-enabled learning. Each article carries a permanent DOI and is free to read and share.\n\n### Highlights\n\n- A field study of smart-material adoption in small manufacturing units\n- A comparison of blended learning platforms across engineering colleges\n- A low-cost approach to community water purification\n\nThank you to our authors, reviewers and the production team.' },
  { journal: 'IJMAT', title: 'Five checks before you submit your manuscript', slug: 'five-checks-before-you-submit', category: 'Research tips', cover: 'emerald', days: 28, body: 'Most desk rejections are avoidable. Before you submit, run through this short list.\n\n1. **Scope** — read the Aims & Scope page and confirm your topic fits.\n2. **Abstract** — state the problem, method, main result and implication in 250 words or fewer.\n3. **References** — check that every in-text citation appears in the list and follows APA 7th edition.\n4. **Declarations** — add funding, conflict-of-interest and data availability statements.\n5. **Anonymity** — remove author names from the file properties and acknowledgements.\n\nA clean submission moves to review faster.' },
  { journal: 'JIMRT', title: 'Call for papers: Management in a hybrid world', slug: 'call-for-papers-hybrid-world', category: 'News', cover: 'sky', days: 5, body: 'JIMRT invites submissions for a special issue on **management practice in hybrid workplaces**.\n\n### Topics\n\n- Employee retention and engagement\n- Leadership and team innovation\n- Performance measurement without presence\n\nThe submission deadline is 20 December 2026. Accepted papers will appear in the January 2027 issue.' },
  { journal: 'JIMRT', title: 'Welcoming three new associate editors', slug: 'welcoming-new-associate-editors', category: 'Editorial', cover: 'amber', days: 40, body: 'The editorial board of JIMRT has grown. We welcome three new associate editors who bring expertise in operations, organisational behaviour and public policy.\n\nTheir responsibilities begin with the next issue cycle. You can find their profiles on the Editorial Board page.' },
  { journal: 'IJCSD', title: 'IJCSD accepted for DOAJ evaluation', slug: 'doaj-evaluation', category: 'Indexing', cover: 'slate', days: 19, body: 'We are glad to share that IJCSD has been accepted for **evaluation by the Directory of Open Access Journals (DOAJ)**.\n\nThe review typically takes several months. We will publish the outcome here as soon as we hear back.\n\n### What this means for authors\n\nNothing changes in how you submit. Indexing gives published work wider reach and, over time, better discoverability.' },
  { journal: 'IJCSD', title: 'Reporting reproducible machine learning results', slug: 'reproducible-machine-learning', category: 'Research tips', cover: 'indigo', days: 52, body: 'Reviewers often ask for the same details. Include them up front.\n\n- The exact dataset version and train/validation/test split\n- Hyperparameters and the search space explored\n- Random seeds and the number of runs behind each reported figure\n- Hardware and training time\n\nWhere possible, deposit code and data in a public repository and cite it in the data availability statement.' },
  { journal: 'IJECM', title: 'Conference collaboration: ICEM 2027, Pune', slug: 'icem-2027-collaboration', category: 'Events', cover: 'rose', days: 8, body: 'IJECM is the official journal partner of **ICEM 2027** (International Conference on Engineering and Materials), to be held in Pune in March 2027.\n\nSelected conference papers will be invited to submit extended versions for a fast-track review.' },
  { journal: 'IJFRD', title: 'Editorial: Why negative results matter in finance', slug: 'editorial-negative-results', category: 'Editorial', cover: 'emerald', days: 33, body: 'Finance research rewards significant effects. Yet a well-designed study that finds no effect protects readers from chasing ghosts.\n\nIJFRD welcomes **replication studies and null results** provided the design is sound and the sample is adequate. We will label them clearly so readers can find them.' },
  { journal: 'IJFRD', title: 'Fee waivers for early-career researchers', slug: 'fee-waivers-early-career', category: 'News', cover: 'amber', days: 0, draft: true, body: 'Draft announcement: we are extending APC waivers to doctoral students and researchers in their first three years after PhD.\n\nDetails and the application form will follow once the policy is approved.' },
]

export function buildEntries(): CmsEntry[] {
  const out: CmsEntry[] = []
  let n = 0
  for (const j of JOURNAL_CODES) {
    for (const d of PAGE_DEFS) {
      n++
      const draft = DRAFT_PAGES.has(`${j}:${d.slug}`)
      out.push({
        id: `cms-${n}`, journal: j, kind: 'page', title: d.title, slug: d.slug, content: d.body(j),
        status: draft ? 'draft' : 'published', seoTitle: `${d.seo} | ${j}`.slice(0, 60), metaDescription: d.meta(`${j}`, j).slice(0, 160),
        author: '', category: '', publishDate: '', cover: 'indigo',
        updatedAt: ago(3 + ((n * 7) % 60)), updatedBy: STAFF[n % 3],
      })
    }
  }
  POSTS.forEach((p, i) => {
    out.push({
      id: `post-${i + 1}`, journal: p.journal, kind: 'post', title: p.title, slug: p.slug, content: p.body,
      status: p.draft ? 'draft' : 'published', seoTitle: `${p.title} | ${p.journal}`.slice(0, 60),
      metaDescription: p.body.replace(/[#*\-\d.]+\s/g, '').replace(/\n+/g, ' ').slice(0, 155).trim(),
      author: STAFF[i % 3], category: p.category, publishDate: ago(p.days).slice(0, 10), cover: p.cover,
      updatedAt: ago(p.days), updatedBy: STAFF[i % 3],
    })
  })
  return out
}

/* =====================================================================
 * Editorial board
 * ===================================================================== */
export const BOARD_GROUPS = ['Editor-in-Chief', 'Managing Editor', 'Associate Editors', 'Editorial Board', 'Review Board'] as const
export type BoardGroup = (typeof BOARD_GROUPS)[number]

export interface BoardMember {
  id: string
  journal: JournalCode
  group: BoardGroup
  order: number
  name: string
  designation: string
  affiliation: string
  country: string
  bio: string
  orcid: string
  scholar: string
  scopus: string
  termStart: string // yyyy-mm-dd
  termEnd: string
  photo?: string // data URL when uploaded
  active: boolean
}

const POOL: [string, string, string, string][] = [
  ['Prof. Anil Deshpande', 'Professor of Mechanical Engineering', 'Indian Institute of Technology Bombay', 'India'],
  ['Dr. Meenakshi Raghavan', 'Associate Professor', 'University of Madras', 'India'],
  ['Prof. Jonathan Weller', 'Professor of Operations Research', 'University of Warwick', 'United Kingdom'],
  ['Dr. Fatima Al-Mansoori', 'Senior Lecturer', 'Khalifa University', 'United Arab Emirates'],
  ['Dr. Kenji Watanabe', 'Associate Professor', 'Kyoto Institute of Technology', 'Japan'],
  ['Prof. Sunita Choudhury', 'Dean, Faculty of Management', 'Symbiosis International University', 'India'],
  ['Dr. Lucas Fernandes', 'Research Fellow', 'University of São Paulo', 'Brazil'],
  ['Dr. Ingrid Solheim', 'Associate Professor', 'Norwegian University of Science and Technology', 'Norway'],
  ['Prof. Rajiv Malhotra', 'Professor of Finance', 'Indian Institute of Management Ahmedabad', 'India'],
  ['Dr. Chiamaka Eze', 'Senior Lecturer', 'University of Lagos', 'Nigeria'],
  ['Dr. Thomas Brandt', 'Assistant Professor', 'Technical University of Munich', 'Germany'],
  ['Prof. Nandini Krishnan', 'Professor of Computer Science', 'National Institute of Technology Calicut', 'India'],
  ['Dr. Aisha Rahman', 'Associate Professor', 'Bangladesh University of Engineering and Technology', 'Bangladesh'],
  ['Dr. Marco Bianchi', 'Associate Professor', 'Politecnico di Milano', 'Italy'],
  ['Dr. Hui Lin', 'Associate Professor', 'National University of Singapore', 'Singapore'],
  ['Prof. Deepak Sethi', 'Professor of Information Systems', 'Delhi Technological University', 'India'],
  ['Dr. Rebecca Mwangi', 'Lecturer', 'University of Nairobi', 'Kenya'],
  ['Dr. Pablo Navarro', 'Associate Professor', 'Universidad de Chile', 'Chile'],
  ['Dr. Swati Kulkarni', 'Assistant Professor', 'Savitribai Phule Pune University', 'India'],
  ['Prof. Ahmed El-Sayed', 'Professor of Civil Engineering', 'Cairo University', 'Egypt'],
  ['Dr. Priyanka Bose', 'Associate Professor', 'Jadavpur University', 'India'],
  ['Dr. Emily Hartwell', 'Senior Researcher', 'University of Melbourne', 'Australia'],
  ['Dr. Vikrant Joshi', 'Associate Professor', 'Birla Institute of Technology and Science, Pilani', 'India'],
  ['Prof. Lena Johansson', 'Professor of Economics', 'Stockholm School of Economics', 'Sweden'],
  ['Dr. Omar Haddad', 'Assistant Professor', 'American University of Beirut', 'Lebanon'],
]
const LAYOUT: BoardGroup[] = [
  'Editor-in-Chief', 'Managing Editor', 'Associate Editors', 'Associate Editors', 'Associate Editors',
  'Editorial Board', 'Editorial Board', 'Editorial Board', 'Editorial Board', 'Review Board', 'Review Board',
]
const DESIGNATION: Record<BoardGroup, string> = {
  'Editor-in-Chief': 'Editor-in-Chief', 'Managing Editor': 'Managing Editor', 'Associate Editors': 'Associate Editor',
  'Editorial Board': 'Editorial Board Member', 'Review Board': 'Review Board Member',
}

export function buildBoard(): BoardMember[] {
  const out: BoardMember[] = []
  JOURNAL_CODES.forEach((j, ji) => {
    const orders: Partial<Record<BoardGroup, number>> = {}
    LAYOUT.forEach((group, k) => {
      const [name, role, affiliation, country] = POOL[(ji * 7 + k * 3) % POOL.length]
      const order = (orders[group] = (orders[group] ?? -1) + 1)
      const h = (ji + 3) * 977 + k * 131
      const slug = name.replace(/^(Dr\.|Prof\.)\s*/, '').toLowerCase().replace(/[^a-z]+/g, '-')
      out.push({
        id: `bm-${j}-${k + 1}`, journal: j, group, order, name, designation: `${DESIGNATION[group]}, ${j}`,
        affiliation, country,
        bio: `${role} at ${affiliation}. Research interests include ${SUBJECT[j].split(',')[0].replace(/^[a-z]/, (c) => c)} and its applications. ${group === 'Review Board' ? 'Reviews for the journal on request.' : `Serves as ${DESIGNATION[group].toLowerCase()} of ${j}.`}`,
        orcid: `0000-000${(h % 3) + 1}-${1000 + (h % 8999)}-${1000 + ((h * 7) % 8999)}`,
        scholar: `https://scholar.google.com/citations?user=${slug.replace(/-/g, '').slice(0, 6)}${h % 99}`,
        scopus: `https://www.scopus.com/authid/detail.uri?authorId=${5700000000 + h * 13}`,
        termStart: '2025-01-01', termEnd: '2027-12-31',
        active: !(ji === 1 && k === 10) && !(ji === 3 && k === 8),
      })
    })
  })
  return out
}

/* =====================================================================
 * Announcements
 * ===================================================================== */
export const ANNOUNCEMENT_TYPES = ['News', 'Call for Papers', 'Special Issue', 'Deadline Extension', 'Maintenance'] as const
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number]
export const PLACEMENTS = [
  { id: 'banner', label: 'Homepage banner' },
  { id: 'topbar', label: 'Top bar' },
  { id: 'page', label: 'Announcements page' },
] as const
export type Placement = (typeof PLACEMENTS)[number]['id']

export interface Announcement {
  id: string
  /** Records created together share a batch id (multi-journal posts). */
  batchId: string
  journal: JournalCode
  title: string
  body: string
  type: AnnouncementType
  placements: Placement[]
  pinned: boolean
  startAt: string
  endAt?: string
  emailSubscribers: boolean
  createdAt: string
  createdBy: string
}
export type AnnouncementStatus = 'scheduled' | 'live' | 'expired'

export function announcementStatus(a: Pick<Announcement, 'startAt' | 'endAt'>, now = Date.now()): AnnouncementStatus {
  if (new Date(a.startAt).getTime() > now) return 'scheduled'
  if (a.endAt && new Date(a.endAt).getTime() < now) return 'expired'
  return 'live'
}

type AnnSeed = Omit<Announcement, 'id' | 'batchId' | 'createdAt' | 'createdBy'> & { batch: string; created: number }

const ANN: AnnSeed[] = [
  { batch: 'b1', created: 20, journal: 'IJMAT', type: 'Call for Papers', title: 'Call for papers: Volume 4, Issue 1 (January 2027)', body: 'IJMAT is accepting submissions for the January 2027 issue. Research articles, review articles and case studies are welcome. Submit by 20 December 2026.', placements: ['banner', 'page'], pinned: true, startAt: ago(14), endAt: ahead(70), emailSubscribers: true },
  { batch: 'b2', created: 10, journal: 'JIMRT', type: 'Special Issue', title: 'Special issue: Management in a hybrid world', body: 'JIMRT invites papers for a special issue on hybrid work, leadership and retention. Guest editors: Dr. Sunita Choudhury and Prof. Jonathan Weller.', placements: ['banner', 'topbar', 'page'], pinned: true, startAt: ago(7), endAt: ahead(80), emailSubscribers: true },
  { batch: 'b3', created: 40, journal: 'IJCSD', type: 'Deadline Extension', title: 'Deadline extended to 31 October 2026', body: 'By popular request the submission deadline for the October issue has been extended to 31 October 2026. No further extensions will be granted.', placements: ['topbar', 'page'], pinned: false, startAt: ago(25), endAt: ahead(19), emailSubscribers: false },
  { batch: 'b4', created: 12, journal: 'IJECM', type: 'Maintenance', title: 'Scheduled maintenance on Sunday, 18 October', body: 'The submission portal will be unavailable from 01:00 to 03:00 IST on Sunday, 18 October while we upgrade our servers. Existing drafts are safe.', placements: ['topbar'], pinned: false, startAt: ago(1), endAt: ahead(6), emailSubscribers: false },
  { batch: 'b5', created: 3, journal: 'IJFRD', type: 'News', title: 'IJFRD joins the Crossref Similarity programme', body: 'All new submissions are now checked for text overlap during screening. This does not change the submission process.', placements: ['page'], pinned: false, startAt: ago(2), emailSubscribers: false },
  { batch: 'b6', created: 60, journal: 'IJMAT', type: 'News', title: 'Volume 3, Issue 2 published', body: 'The July 2026 issue is available online with ten research articles and two review articles.', placements: ['page'], pinned: false, startAt: ago(75), endAt: ago(30), emailSubscribers: true },
  { batch: 'b7', created: 60, journal: 'IJCSD', type: 'Call for Papers', title: 'Call for papers: Federated learning at the edge', body: 'Special collection on federated learning on constrained devices. Submission window closed on 30 September.', placements: ['banner', 'page'], pinned: false, startAt: ago(90), endAt: ago(12), emailSubscribers: true },
  { batch: 'b8', created: 5, journal: 'JIMRT', type: 'News', title: 'New editorial board members for 2027', body: 'We welcome three new associate editors to JIMRT effective 1 January 2027.', placements: ['page'], pinned: false, startAt: ahead(12), emailSubscribers: false },
  { batch: 'b9', created: 4, journal: 'IJECM', type: 'Special Issue', title: 'Special issue: Energy storage and thermal management', body: 'IJECM is preparing a special issue on lithium-ion pack design and thermal management. Authors may submit from 1 November 2026.', placements: ['banner', 'page'], pinned: false, startAt: ahead(20), endAt: ahead(110), emailSubscribers: true },
  { batch: 'b10', created: 6, journal: 'IJFRD', type: 'Call for Papers', title: 'Call for papers: Household finance and UPI adoption', body: 'We invite studies on digital payments and household savings. Submit by 15 January 2027.', placements: ['banner', 'page'], pinned: false, startAt: ahead(3), endAt: ahead(95), emailSubscribers: true },
  // Posted together to two journals (the multi-journal scenario)
  { batch: 'b11', created: 9, journal: 'IJMAT', type: 'Deadline Extension', title: 'Joint indexing notice: DOI deposits delayed', body: 'Crossref maintenance has delayed DOI deposits by up to 48 hours. Published articles remain accessible.', placements: ['topbar', 'page'], pinned: false, startAt: ago(9), endAt: ago(6), emailSubscribers: false },
  { batch: 'b11', created: 9, journal: 'IJCSD', type: 'Deadline Extension', title: 'Joint indexing notice: DOI deposits delayed', body: 'Crossref maintenance has delayed DOI deposits by up to 48 hours. Published articles remain accessible.', placements: ['topbar', 'page'], pinned: false, startAt: ago(9), endAt: ago(6), emailSubscribers: false },
]

export function buildAnnouncements(): Announcement[] {
  return ANN.map((a, i) => {
    const { batch, created, ...rest } = a
    return { ...rest, id: `ann-${i + 1}`, batchId: batch, createdAt: ago(created), createdBy: STAFF[i % 3] }
  })
}

/* =====================================================================
 * Awards
 * ===================================================================== */
export type AwardType = 'best_paper' | 'best_mentor'
export const AWARD_TYPE_LABEL: Record<AwardType, string> = { best_paper: 'Best Paper', best_mentor: 'Best Research Mentor' }
export type CycleStatus = 'draft' | 'nominations' | 'shortlisting' | 'pending_approval' | 'approved' | 'published'
export const CYCLE_STATUSES: CycleStatus[] = ['draft', 'nominations', 'shortlisting', 'pending_approval', 'approved', 'published']
export const CYCLE_LABEL: Record<CycleStatus, string> = {
  draft: 'Draft', nominations: 'Nominations', shortlisting: 'Shortlisting', pending_approval: 'Pending approval', approved: 'Approved', published: 'Published',
}

export interface Nomination {
  id: string
  /** Paper ID for Best Paper, lower-cased author email for Best Research Mentor. */
  key: string
  name: string
  email: string
  affiliation: string
  paperId?: string
  paperTitle?: string
  winner: boolean
  note: string
}

export interface AwardCycle {
  id: string
  journal: JournalCode
  type: AwardType
  name: string
  periodStart: string // yyyy-mm-dd
  periodEnd: string
  criteria: string
  status: CycleStatus
  nominations: Nomination[]
  createdAt: string
  createdBy: string
  submittedAt?: string
  approvedAt?: string
  approvedBy?: string
  returnReason?: string
  publishedAt?: string
}

const CRITERIA: Record<AwardType, string> = {
  best_paper: 'Originality of the contribution, methodological rigour, clarity of writing and potential practical impact. Papers must be published in the period and must not have a correction or retraction notice.',
  best_mentor: 'Authors who have published the most peer-reviewed work from their supervised students during the period, with evidence of mentoring (student first-authors). Each mentor may win once per calendar year.',
}

export function buildCycles(): AwardCycle[] {
  const year = NOW.getFullYear()
  const papers = buildPapers().filter((p) => ['published', 'indexed'].includes(p.status))
  const by = (j: JournalCode) => papers.filter((p) => p.journal === j)
  const nom = (p: (typeof papers)[number], winner: boolean, note: string): Nomination => ({
    id: `nom-${p.id}`, key: p.id, name: p.author, email: p.authorEmail, affiliation: `${p.authorEmail.split('@')[1].split('.')[0].toUpperCase()} University`,
    paperId: p.id, paperTitle: p.title, winner, note,
  })
  const ijmat = by('IJMAT'), jimrt = by('JIMRT'), ijcsd = by('IJCSD')
  const full = (y: number) => ({ periodStart: `${y}-01-01`, periodEnd: `${y}-12-31` })
  const cycles: AwardCycle[] = [
    {
      id: 'cyc-1', journal: 'IJMAT', type: 'best_paper', name: `IJMAT Best Paper ${year - 1}`, ...full(year - 1), criteria: CRITERIA.best_paper,
      status: 'published', createdAt: ago(300), createdBy: 'Priya Menon', submittedAt: ago(270), approvedAt: ago(268), approvedBy: 'Priya Menon', publishedAt: ago(265),
      nominations: ijmat[0] ? [nom(ijmat[0], true, 'Strong field data and a clear practical contribution; both reviewers rated it top quartile.')] : [],
    },
    {
      id: 'cyc-2', journal: 'IJMAT', type: 'best_paper', name: `IJMAT Best Paper ${year}`, ...full(year), criteria: CRITERIA.best_paper,
      status: 'nominations', createdAt: ago(20), createdBy: 'Rohan Mehta', nominations: [],
    },
    {
      id: 'cyc-3', journal: 'JIMRT', type: 'best_paper', name: `JIMRT Best Paper ${year}`, ...full(year), criteria: CRITERIA.best_paper,
      status: 'pending_approval', createdAt: ago(35), createdBy: 'Karan Shah', submittedAt: ago(1),
      nominations: jimrt.slice(0, 3).map((p, i) => nom(p, i === 0, i === 0 ? 'Rigorous mixed-method design with unusually transparent reporting of limitations.' : 'Runner-up; shortlisted for rigour.')),
    },
    {
      id: 'cyc-4', journal: 'IJCSD', type: 'best_mentor', name: `IJCSD Best Research Mentor ${year}`, ...full(year), criteria: CRITERIA.best_mentor,
      status: 'shortlisting', createdAt: ago(18), createdBy: 'Rohan Mehta',
      nominations: ijcsd.slice(0, 2).map((p) => ({ id: `nom-m-${p.id}`, key: p.authorEmail.toLowerCase(), name: p.author, email: p.authorEmail, affiliation: `${p.authorEmail.split('@')[1].split('.')[0].toUpperCase()} University`, winner: false, note: '' })),
    },
    {
      id: 'cyc-5', journal: 'IJFRD', type: 'best_paper', name: `IJFRD Best Paper ${year}`, ...full(year), criteria: CRITERIA.best_paper,
      status: 'draft', createdAt: ago(2), createdBy: 'Priya Menon', nominations: [],
    },
  ]
  return cycles
}

/* =====================================================================
 * Forms inbox
 * ===================================================================== */
export type FormType = 'reviewer' | 'board' | 'conference' | 'enquiry'
export const FORM_TYPE_LABEL: Record<FormType, string> = {
  reviewer: 'Become a Reviewer', board: 'Editorial Board application', conference: 'Conference collaboration', enquiry: 'General enquiry',
}
export type FormStatus = 'new' | 'under_review' | 'approved' | 'rejected' | 'on_hold'
export const FORM_STATUS_LABEL: Record<FormStatus, string> = { new: 'New', under_review: 'Under review', approved: 'Approved', rejected: 'Rejected', on_hold: 'On hold' }

export interface FormNote { id: string; at: string; author: string; text: string }
export interface FormHistory { id: string; at: string; actor: string; status: FormStatus; reason?: string }
export interface FormOutcome { kind: 'account' | 'board' | 'conference' | 'ticket'; label: string; ref?: string; link?: string; at: string }

export interface FormSubmission {
  id: string
  journal: JournalCode
  type: FormType
  status: FormStatus
  name: string
  email: string
  affiliation: string
  country: string
  receivedAt: string
  subject: string
  fields: { label: string; value: string }[]
  resume?: { name: string; size: string }
  notes: FormNote[]
  history: FormHistory[]
  outcome?: FormOutcome
}

type FormSeed = Omit<FormSubmission, 'id' | 'notes' | 'history' | 'receivedAt' | 'outcome'> & { hours: number; notes?: string[]; reason?: string }

const FORMS: FormSeed[] = [
  { hours: 5, journal: 'IJECM', type: 'reviewer', status: 'new', name: 'Dr. Harini Subramanian', email: 'harini.subramanian@nitt.example', affiliation: 'National Institute of Technology Tiruchirappalli', country: 'India', subject: 'Reviewer application: structural engineering', fields: [{ label: 'Designation', value: 'Associate Professor' }, { label: 'Areas of expertise', value: 'Fibre-reinforced concrete, seismic retrofitting' }, { label: 'Publications (last 5 years)', value: '23 (Scopus indexed: 19)' }, { label: 'Reviews completed elsewhere', value: '40+ for Elsevier and Springer titles' }, { label: 'Availability', value: 'Up to 2 manuscripts a month' }, { label: 'ORCID', value: '0000-0002-4418-7731' }] },
  { hours: 20, journal: 'IJCSD', type: 'reviewer', status: 'under_review', name: 'Dr. Mateus Oliveira', email: 'mateus.oliveira@ufmg.example', affiliation: 'Federal University of Minas Gerais', country: 'Brazil', subject: 'Reviewer application: machine learning', fields: [{ label: 'Designation', value: 'Assistant Professor' }, { label: 'Areas of expertise', value: 'Federated learning, graph neural networks' }, { label: 'Publications (last 5 years)', value: '14' }, { label: 'Reviews completed elsewhere', value: '18' }, { label: 'Availability', value: '1 manuscript a month' }, { label: 'ORCID', value: '0000-0001-9012-3345' }], notes: ['Profile checked on Google Scholar; h-index 11. Looks suitable.'] },
  { hours: 70, journal: 'IJMAT', type: 'reviewer', status: 'approved', name: 'Dr. Kavita Rao', email: 'kavita.rao@bits.example', affiliation: 'BITS Pilani', country: 'India', subject: 'Reviewer application: smart materials', fields: [{ label: 'Designation', value: 'Professor' }, { label: 'Areas of expertise', value: 'Smart materials, additive manufacturing' }, { label: 'Publications (last 5 years)', value: '31' }, { label: 'Reviews completed elsewhere', value: '55' }, { label: 'Availability', value: '2 manuscripts a month' }, { label: 'ORCID', value: '0000-0003-7716-2209' }], notes: ['Strong match for IJMAT. Approved by Rohan after checking two sample reviews.'] },
  { hours: 120, journal: 'JIMRT', type: 'reviewer', status: 'rejected', name: 'Sandeep Gill', email: 'sandeep.gill@gmail.example', affiliation: 'Independent consultant', country: 'India', subject: 'Reviewer application: management', fields: [{ label: 'Designation', value: 'Consultant' }, { label: 'Areas of expertise', value: 'Marketing' }, { label: 'Publications (last 5 years)', value: '0' }, { label: 'Reviews completed elsewhere', value: 'None' }], reason: 'No peer-reviewed publication record. Invited to re-apply after publishing in an indexed journal.' },
  { hours: 8, journal: 'IJFRD', type: 'board', status: 'new', name: 'Prof. Ravi Shankar Iyer', email: 'ravi.iyer@iimb.example', affiliation: 'Indian Institute of Management Bangalore', country: 'India', subject: 'Editorial board application: Associate Editor', fields: [{ label: 'Position applied for', value: 'Associate Editor' }, { label: 'Areas of expertise', value: 'Capital markets, volatility, emerging economies' }, { label: 'Editorial experience', value: 'Associate Editor, Journal of Emerging Market Finance (2021 to date)' }, { label: 'Why do you want to join?', value: 'I would like to help build a rigorous Indian-origin finance journal that gives early-career researchers a fair review.' }, { label: 'Google Scholar', value: 'https://scholar.google.com/citations?user=rsi2024' }], resume: { name: 'CV_Ravi_Shankar_Iyer.pdf', size: '386 KB' } },
  { hours: 52, journal: 'IJCSD', type: 'board', status: 'under_review', name: 'Dr. Nisha Verma', email: 'nisha.verma@iiitd.example', affiliation: 'IIIT Delhi', country: 'India', subject: 'Editorial board application: Editorial Board Member', fields: [{ label: 'Position applied for', value: 'Editorial Board Member' }, { label: 'Areas of expertise', value: 'Software engineering, static analysis' }, { label: 'Editorial experience', value: 'Guest editor for two special issues' }, { label: 'Why do you want to join?', value: 'To contribute to software engineering coverage and mentor authors from smaller institutions.' }], resume: { name: 'Resume_Nisha_Verma.pdf', size: '298 KB' }, notes: ['Asked EiC for an opinion on fit.'] },
  { hours: 200, journal: 'IJMAT', type: 'board', status: 'on_hold', name: 'Dr. Peter Lindqvist', email: 'peter.lindqvist@kth.example', affiliation: 'KTH Royal Institute of Technology', country: 'Sweden', subject: 'Editorial board application: Editorial Board Member', fields: [{ label: 'Position applied for', value: 'Editorial Board Member' }, { label: 'Areas of expertise', value: 'Digital twins' }, { label: 'Why do you want to join?', value: 'Interested in applied technology publishing.' }], resume: { name: 'CV_Lindqvist.pdf', size: '510 KB' }, reason: 'Board is full until the January 2027 term; revisit in December.' },
  { hours: 30, journal: 'IJECM', type: 'conference', status: 'new', name: 'Prof. Deepa Kulkarni', email: 'deepa.kulkarni@coep.example', affiliation: 'College of Engineering Pune', country: 'India', subject: 'Proposal to host ICEM 2027 proceedings', fields: [{ label: 'Conference name', value: 'ICEM 2027, International Conference on Engineering and Materials' }, { label: 'Dates', value: '12 to 14 March 2027' }, { label: 'Venue', value: 'COEP Technological University, Pune' }, { label: 'Expected papers', value: '180' }, { label: 'Proposal', value: 'Publish selected papers as a proceedings issue and invite extended versions to IJECM.' }] },
  { hours: 96, journal: 'JIMRT', type: 'conference', status: 'approved', name: 'Dr. Arvind Nair', email: 'arvind.nair@iimk.example', affiliation: 'IIM Kozhikode', country: 'India', subject: 'Conference partnership: Management & Technology Summit', fields: [{ label: 'Conference name', value: 'Management & Technology Summit 2027' }, { label: 'Dates', value: '8 to 9 February 2027' }, { label: 'Venue', value: 'IIM Kozhikode' }, { label: 'Expected papers', value: '90' }, { label: 'Proposal', value: 'Journal partner with a best-paper track.' }], notes: ['Agreed in principle on a call with Priya.'] },
  { hours: 3, journal: 'IJMAT', type: 'enquiry', status: 'new', name: 'Anjali Deshmukh', email: 'anjali.d@sppu.example', affiliation: 'Savitribai Phule Pune University', country: 'India', subject: 'Is a literature survey accepted as a review article?', fields: [{ label: 'Message', value: 'I have completed a systematic literature survey on smart-material adoption. Does IJMAT accept this as a review article and is there a word limit?' }] },
  { hours: 26, journal: 'IJFRD', type: 'enquiry', status: 'under_review', name: 'Michael Okoye', email: 'm.okoye@unilag.example', affiliation: 'University of Lagos', country: 'Nigeria', subject: 'APC waiver for authors in Nigeria', fields: [{ label: 'Message', value: 'Could you confirm whether APC waivers are available for authors in Nigeria and how to apply before acceptance?' }] },
  { hours: 150, journal: 'IJCSD', type: 'enquiry', status: 'approved', name: 'Lena Fischer', email: 'lena.fischer@tum.example', affiliation: 'Technical University of Munich', country: 'Germany', subject: 'Request for sponsorship letter', fields: [{ label: 'Message', value: 'I need a letter confirming my paper is under review for my visa application.' }], notes: ['Template reply drafted; follow up through the helpdesk.'] },
  { hours: 300, journal: 'JIMRT', type: 'enquiry', status: 'rejected', name: 'Promotions Desk', email: 'seo@rankbooster.example', affiliation: '-', country: 'India', subject: 'Buy backlinks for your journal', fields: [{ label: 'Message', value: 'We sell high-quality backlinks and guaranteed Google ranking for academic websites.' }], reason: 'Unsolicited commercial email.' },
]

export function buildSubmissions(): FormSubmission[] {
  return FORMS.map((f, i) => {
    const { hours, notes, reason, ...rest } = f
    const receivedAt = new Date(NOW.getTime() - hours * 3_600_000).toISOString()
    const history: FormHistory[] = [{ id: `fh-${i}-0`, at: receivedAt, actor: 'Website form', status: 'new' }]
    if (rest.status !== 'new') history.push({ id: `fh-${i}-1`, at: new Date(NOW.getTime() - (hours - 4) * 3_600_000).toISOString(), actor: STAFF[i % 3], status: rest.status, reason })
    return {
      ...rest, id: `FRM-${3100 + i}`, receivedAt, history,
      notes: (notes ?? []).map((t, k) => ({ id: `fn-${i}-${k}`, at: new Date(NOW.getTime() - (hours - 6) * 3_600_000).toISOString(), author: STAFF[i % 3], text: t })),
    }
  })
}
