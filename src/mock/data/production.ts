import type { Author, JournalCode, Paper } from '@/shared/types'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type Block =
  | { id: string; kind: 'heading'; text: string }
  | { id: string; kind: 'paragraph'; text: string }
  | { id: string; kind: 'table'; caption: string; header: string[]; rows: string[][] }
  | { id: string; kind: 'figure'; caption: string; alt: string }

export interface FinalFile {
  name: string
  version: number
  uploadedAt: string
  uploadedBy: string
  sizeKb: number
}

export interface CertificateRecord {
  authorEmail: string
  name: string
  date: string
  version: number
  generatedAt: string
}

export interface SeoMeta {
  title: string
  description: string
  slug: string
  titleEdited: boolean
  descriptionEdited: boolean
  slugEdited: boolean
}

export interface PublicationResult {
  at: string
  by: string
  issueId: string
  issueLabel: string
  pages: string
  doi: string
  url: string
  depositVersion: number
  certificatesSent: string[]
  backdated: boolean
}

export interface ReturnNote {
  text: string
  by: string
  at: string
}

export interface ProductionRecord {
  paperId: string
  /** Immutable snapshot of the author's original Word submission. */
  manuscript: { fileName: string; version: number; pageCount: number; wordCount: number; title: string; authors: string[]; abstract: string; blocks: Block[] }
  title: string
  authors: Author[]
  abstract: string
  keywords: string[]
  references: string[]
  blocks: Block[]
  seo: SeoMeta
  finalFile: FinalFile | null
  certificates: CertificateRecord[]
  returnNote?: ReturnNote
  returnAcknowledged: boolean
  sentAt?: string
  savedAt?: string
  publication?: PublicationResult
  /** Version of the live article (bumped by post-publication changes). */
  articleVersion: number
}

export type BackdatedStatus = 'pending_approval' | 'published'

export interface BackdatedItem {
  id: string
  journal: JournalCode
  originalId: string
  /** The ID the article carries from now on (generated when the original was unavailable). */
  finalId: string
  generatedId: boolean
  title: string
  originalStatus: string
  issueId: string
  issueLabel: string
  issueDate: string
  createdAt: string
  createdBy: string
  note: string
  status: BackdatedStatus
}

export type ChangeType = 'correction' | 'author_name' | 'affiliation' | 'file_replacement' | 'erratum' | 'retraction' | 'withdrawal'

export const CHANGE_TYPE_META: Record<ChangeType, { label: string; hint: string; editsArticle: boolean }> = {
  correction: { label: 'Correction', hint: 'Fix an error in the article text, a table or a figure caption.', editsArticle: true },
  author_name: { label: 'Author name change', hint: 'Update the spelling or form of an author’s name; certificates are regenerated.', editsArticle: true },
  affiliation: { label: 'Affiliation change', hint: 'Update an author’s affiliation on the article page and in Crossref metadata.', editsArticle: true },
  file_replacement: { label: 'File replacement', hint: 'Replace the published final file with a corrected one.', editsArticle: true },
  erratum: { label: 'Erratum / corrigendum', hint: 'Publish a notice describing an error and its correction.', editsArticle: true },
  retraction: { label: 'Retraction', hint: 'Withdraw the article from the record because of serious problems. Public and permanent.', editsArticle: false },
  withdrawal: { label: 'Withdrawal', hint: 'Remove the article at the authors’ request before it is cited or indexed.', editsArticle: false },
}

export type ChangeStatus = 'requested' | 'approved' | 'rejected' | 'revision' | 'version_review' | 'completed'

export type ChangeApply =
  | { kind: 'author'; index: number; prop: 'name' | 'affiliation' }
  | { kind: 'text' }
  | { kind: 'notice' }
  | { kind: 'file' }

export interface ChangeTarget {
  key: string
  label: string
  oldValue: string
  newValue: string
  multiline?: boolean
  apply: ChangeApply
}

export interface ArticleVersion {
  n: number
  at: string
  by: string
  summary: string
  changes: { field: string; oldValue: string; newValue: string }[]
  state: 'live' | 'draft' | 'in_review' | 'approved' | 'superseded'
}

export interface ChangeResult {
  at: string
  by: string
  doi: string
  depositVersion: number
  paperStatus: string
  certificates: { authorName: string; changed: boolean }[]
  notified: string[]
}

export interface ChangeEvent {
  id: string
  at: string
  actor: string
  text: string
  note?: string
}

export interface ChangeRequest {
  id: string
  paperId: string
  journal: JournalCode
  type: ChangeType
  reason: string
  targets: ChangeTarget[]
  requestedBy: string
  requestedAt: string
  status: ChangeStatus
  assigneeId?: string
  decisionNote?: string
  baseVersion: number
  versions: ArticleVersion[]
  result?: ChangeResult
  events: ChangeEvent[]
}

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                                */
/* ------------------------------------------------------------------ */

export const hashString = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

export function slugify(s: string, max = 70): string {
  const base = s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (base.length <= max) return base
  const cut = base.slice(0, max)
  const dash = cut.lastIndexOf('-')
  return (dash > 20 ? cut.slice(0, dash) : cut).replace(/-+$/, '')
}

export const isValidSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 5 && s.length <= 80

function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s
  const slice = s.slice(0, max - 1)
  const sp = slice.lastIndexOf(' ')
  return `${(sp > max * 0.5 ? slice.slice(0, sp) : slice).replace(/[,;:\s]+$/, '')}…`
}

/** SEO title (≤60) and description (≤160) drafted from title, abstract and keywords. */
export function draftSeo(title: string, abstract: string, keywords: string[]): { title: string; description: string; slug: string } {
  const seoTitle = cutAtWord(title.trim(), 60)
  const firstSentence = abstract.trim().split(/(?<=\.)\s+/)[0] ?? ''
  let description = firstSentence
  const kw = keywords.slice(0, 3).join(', ')
  if (description.length < 110 && kw) description = `${description} Keywords: ${kw}.`.trim()
  return { title: seoTitle, description: cutAtWord(description, 160), slug: slugify(title) }
}

/** Topic phrase extracted from the generated title frames. */
export function topicOf(title: string): string {
  const m1 = /^A comparative study of (.+)$/.exec(title)
  if (m1) return m1[1]
  const m2 = /^Evaluating (.+) using mixed-method evidence$/.exec(title)
  if (m2) return m2[1]
  const m3 = /^(.+): an empirical analysis in emerging economies$/.exec(title)
  if (m3) return m3[1].charAt(0).toLowerCase() + m3[1].slice(1)
  return title.charAt(0).toLowerCase() + title.slice(1)
}

/* ------------------------------------------------------------------ */
/* Seed content                                                         */
/* ------------------------------------------------------------------ */

const FLAVOUR: Record<JournalCode, { unit: string; design: string; instrument: string; variables: string[]; keywords: string[]; setting: string }> = {
  IJMAT: {
    unit: 'manufacturing and technology units', design: 'cross-sectional survey combined with plant-level observation',
    instrument: 'a structured questionnaire and site audit checklist', setting: 'industrial clusters in western and southern India',
    variables: ['Technology readiness index', 'Process downtime (hours per month)', 'Training hours per employee', 'Capital intensity (₹ lakh per worker)'],
    keywords: ['applied technology', 'process improvement', 'manufacturing', 'technology adoption', 'industrial practice', 'multidisciplinary research', 'implementation'],
  },
  JIMRT: {
    unit: 'organisations and their employees', design: 'explanatory sequential mixed-method design',
    instrument: 'a validated five-point Likert survey followed by semi-structured interviews', setting: 'mid-size service and technology firms across five Indian cities',
    variables: ['Perceived organisational support', 'Employee engagement score', 'Intention to stay', 'Team innovation index'],
    keywords: ['management research', 'organisational behaviour', 'technology management', 'employee outcomes', 'innovation', 'mixed methods', 'emerging economies'],
  },
  IJCSD: {
    unit: 'software systems and datasets', design: 'controlled experimental evaluation with repeated runs',
    instrument: 'an open benchmark suite and instrumented test harness', setting: 'publicly available datasets and commodity cloud hardware',
    variables: ['Accuracy (%)', 'F1 score', 'Inference latency (ms)', 'Memory footprint (MB)'],
    keywords: ['machine learning', 'software engineering', 'distributed systems', 'benchmarking', 'performance evaluation', 'open source', 'reproducibility'],
  },
  IJECM: {
    unit: 'specimens, components and test rigs', design: 'laboratory experimentation supported by numerical simulation',
    instrument: 'calibrated test rigs with data-acquisition instrumentation and finite-element models', setting: 'accredited testing laboratories',
    variables: ['Peak load (kN)', 'Strain at failure (%)', 'Operating temperature (°C)', 'Efficiency (%)'],
    keywords: ['engineering materials', 'experimental testing', 'finite-element analysis', 'reliability', 'energy systems', 'signal processing', 'design optimisation'],
  },
  IJFRD: {
    unit: 'households, firms and market observations', design: 'panel-data econometric analysis with robustness checks',
    instrument: 'secondary panel data and a household financial-behaviour survey', setting: 'Indian and comparable emerging-market data from 2015 to 2025',
    variables: ['Savings rate (% of income)', 'Return volatility (annualised, %)', 'Debt-to-income ratio', 'Cost of capital (%)'],
    keywords: ['finance', 'emerging markets', 'financial inclusion', 'econometrics', 'risk', 'household behaviour', 'development economics'],
  },
}

const REF_AUTHORS = ['Rao, S.', 'Whitfield, J.', 'Banerjee, A.', 'Okonkwo, C.', 'Lindqvist, M.', 'Subramanian, K.', 'Hartmann, T.', 'Desai, P.', 'Almeida, R.', 'Yamamoto, H.', 'Chatterjee, N.', 'Oyelaran, B.', 'Marchetti, L.', 'Venkatesh, V.']
const REF_SECOND = ['Menon, R.', 'Clarke, D.', 'Ibrahim, Y.', 'Kulkarni, S.', 'Brandt, E.', 'Pillai, G.']
const REF_VENUES: Record<JournalCode, string[]> = {
  IJMAT: ['Journal of Manufacturing Systems', 'Technology in Society', 'International Journal of Production Research', 'Applied Sciences and Engineering Review'],
  JIMRT: ['Journal of Management Studies', 'Organization Science Review', 'Technovation', 'International Journal of Human Resource Management'],
  IJCSD: ['Empirical Software Engineering', 'ACM Computing Surveys', 'Journal of Systems and Software', 'IEEE Transactions on Knowledge and Data Engineering'],
  IJECM: ['Construction and Building Materials', 'Journal of Power Sources', 'Composite Structures', 'Mechanical Systems and Signal Processing'],
  IJFRD: ['Journal of Banking & Finance', 'World Development', 'Emerging Markets Review', 'Journal of Development Economics'],
}
const REF_TOPICS = ['adoption and diffusion in developing regions', 'measurement of performance under uncertainty', 'evidence from a multi-country sample', 'a systematic review of the literature', 'methodological advances and open problems', 'implications for practice and policy', 'a longitudinal perspective']

function buildReferences(paper: Paper, count: number): string[] {
  const r = rng(hashString(`${paper.id}:refs`))
  const venues = REF_VENUES[paper.journal]
  return Array.from({ length: count }, (_, i) => {
    const a = REF_AUTHORS[Math.floor(r() * REF_AUTHORS.length)]
    const b = REF_SECOND[Math.floor(r() * REF_SECOND.length)]
    const year = 2012 + Math.floor(r() * 13)
    const vol = 8 + Math.floor(r() * 40)
    const p0 = 20 + Math.floor(r() * 400)
    const venue = venues[i % venues.length]
    const t = REF_TOPICS[(i + Math.floor(r() * 7)) % REF_TOPICS.length]
    const doi = `10.${1000 + Math.floor(r() * 8999)}/${venue.split(' ').map((w) => w[0]).join('').toLowerCase()}.${year}.${100000 + Math.floor(r() * 899999)}`
    return `${a}, & ${b} (${year}). ${t.charAt(0).toUpperCase()}${t.slice(1)}. ${venue}, ${vol}(${1 + Math.floor(r() * 4)}), ${p0}–${p0 + 12 + Math.floor(r() * 14)}. https://doi.org/${doi}`
  })
}

function buildAbstract(paper: Paper, topic: string): string {
  const f = FLAVOUR[paper.journal]
  const n = 120 + (hashString(paper.id) % 380)
  return `This paper examines ${topic}, a question that has attracted growing attention but limited systematic evidence from emerging economies. Using a ${f.design}, we analyse data on ${f.unit} drawn from ${f.setting} (n = ${n}). The analysis combines descriptive statistics with multivariate estimation and a set of robustness checks. Results indicate a consistent, statistically significant association between the principal explanatory factors and the outcome of interest, with effect sizes that remain stable across alternative specifications. The findings contribute to the literature by documenting context-specific mechanisms and by offering practical guidance for practitioners and policymakers. We conclude by discussing limitations and outlining directions for future research.`
}

function buildBlocks(paper: Paper, topic: string): Block[] {
  const f = FLAVOUR[paper.journal]
  const r = rng(hashString(`${paper.id}:body`))
  const n = 120 + (hashString(paper.id) % 380)
  const rows = f.variables.map((v) => {
    const mean = (10 + r() * 80).toFixed(2)
    const sd = (2 + r() * 14).toFixed(2)
    return [v, mean, sd, String(n - Math.floor(r() * 9))]
  })
  const t = `${topic}`
  return [
    { id: 'b1', kind: 'heading', text: '1. Introduction' },
    { id: 'b2', kind: 'paragraph', text: `Research on ${t} has expanded rapidly over the last decade, yet evidence from emerging economies remains fragmented. Practitioners and policymakers continue to rely on assumptions drawn from advanced-economy settings, which may not hold where infrastructure, regulation and institutional capacity differ.` },
    { id: 'b3', kind: 'paragraph', text: `This study addresses that gap by examining ${t} across a purposively selected sample and by reporting the procedure in enough detail to be replicated. Three questions guide the work: which factors explain the observed variation, how strong are the relationships, and which of them survive alternative specifications.` },
    { id: 'b4', kind: 'heading', text: '2. Literature review and hypotheses' },
    { id: 'b5', kind: 'paragraph', text: `Earlier contributions describe ${t} mainly through single-country case evidence or small convenience samples. Comparative work is scarcer and tends to treat context as a control variable instead of a theoretical concern. We build on the strands that link organisational and technical conditions to observable outcomes, and we derive testable propositions from them.` },
    { id: 'b6', kind: 'heading', text: '3. Methodology' },
    { id: 'b7', kind: 'paragraph', text: `We adopted a ${f.design}. Data were gathered with ${f.instrument} in ${f.setting}. Instruments were piloted on a small group before full deployment, and items with ambiguous wording were revised. All participants gave informed consent and responses were anonymised before analysis.` },
    { id: 'b8', kind: 'heading', text: '4. Results and discussion' },
    { id: 'b9', kind: 'paragraph', text: `Table 1 reports descriptive statistics for the principal variables. Distributions were inspected for outliers and missing values; cases with more than 10% missing data were excluded, leaving the effective sample sizes shown.` },
    { id: 'b10', kind: 'table', caption: 'Table 1. Descriptive statistics of the principal variables', header: ['Variable', 'Mean', 'SD', 'N'], rows },
    { id: 'b11', kind: 'paragraph', text: `Figure 1 summarises the conceptual model that guided estimation. The pattern in the estimates is consistent with the hypothesised mechanisms, and the direction of every coefficient is unchanged when alternative controls and sub-samples are used.` },
    { id: 'b12', kind: 'figure', caption: `Figure 1. Conceptual model linking the main explanatory factors to outcomes in the study of ${t}`, alt: `Diagram of the conceptual model: three explanatory factors feeding into a single outcome, with context as a moderating variable.` },
    { id: 'b13', kind: 'paragraph', text: `These results extend earlier findings by showing that the relationships are not merely artefacts of sample selection. At the same time, the magnitude of the estimates differs across sub-groups, which suggests that local conditions shape how strongly the factors operate.` },
    { id: 'b14', kind: 'heading', text: '5. Conclusion' },
    { id: 'b15', kind: 'paragraph', text: `The evidence reported here supports a more context-sensitive account of ${t}. Limitations include the cross-sectional character of part of the data and the reliance on self-reported measures. Future work should test the proposed mechanisms with longer panels and in additional regions.` },
  ]
}

const FLAWED = new Set(['paid', 'in_production'])
const RETURN_NOTES = [
  'Table 1 is missing units for two variables and the figure caption does not match the numbering in the text. Please correct both and re-check that every in-text citation appears in the reference list before sending this back for approval.',
  'The affiliation of the second author does not match the department listed in the submission form, and reference 5 is incomplete (no volume or pages). Please fix the metadata and re-validate.',
]

export function buildRecord(paper: Paper, authors: Author[], now = new Date()): ProductionRecord {
  const h = hashString(paper.id)
  const topic = topicOf(paper.title)
  const flawed = FLAWED.has(paper.status)
  const abstract = buildAbstract(paper, topic)
  const keywords = [...FLAVOUR[paper.journal].keywords].sort((a, b) => hashString(a + paper.id) - hashString(b + paper.id)).slice(0, 4 + (h % 3))
  const references = buildReferences(paper, 8 + (h % 5))
  const blocks = buildBlocks(paper, topic)
  const flaw = h % 3
  const recordAuthors = authors.map((a) => ({ ...a }))
  let recKeywords = keywords
  let recReferences = references
  if (flawed) {
    if (flaw === 0 && recordAuthors.length > 0) recordAuthors[recordAuthors.length - 1].affiliation = ''
    if (flaw === 1) recKeywords = keywords.slice(0, 2)
    if (flaw === 2) recReferences = references.slice(0, 4)
  }
  const seo = draftSeo(paper.title, abstract, recKeywords)
  const complete = !flawed
  const iso = now.toISOString()
  const wc = wordCount([abstract, ...blocks.map((b) => (b.kind === 'paragraph' ? b.text : ''))].join(' '))
  const record: ProductionRecord = {
    paperId: paper.id,
    manuscript: {
      fileName: `${paper.id}_manuscript_v1.docx`, version: 1, pageCount: 9 + (h % 8), wordCount: wc,
      title: paper.title, authors: authors.map((a) => a.name), abstract, blocks: structuredClone(blocks),
    },
    title: paper.title,
    authors: recordAuthors,
    abstract,
    keywords: recKeywords,
    references: recReferences,
    blocks,
    seo: { ...seo, titleEdited: false, descriptionEdited: false, slugEdited: false },
    finalFile: complete ? { name: `${paper.id}_final_v1.pdf`, version: 1, uploadedAt: iso, uploadedBy: 'Production team', sizeKb: 480 + (h % 900) } : null,
    certificates: complete ? authors.map((a) => ({ authorEmail: a.email, name: a.name, date: iso, version: 1, generatedAt: iso })) : [],
    returnAcknowledged: false,
    articleVersion: paper.status === 'corrected' ? 2 : 1,
  }
  if (paper.status === 'returned_to_production') {
    record.returnNote = { text: RETURN_NOTES[h % RETURN_NOTES.length], by: 'Rohan Mehta', at: new Date(now.getTime() - 20 * 3_600_000).toISOString() }
  }
  return record
}

/* ------------------------------------------------------------------ */
/* Validation                                                           */
/* ------------------------------------------------------------------ */

export interface CheckItem {
  key: 'title' | 'authors' | 'affiliations' | 'abstract' | 'keywords' | 'references'
  label: string
  pass: boolean
  detail: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateMetadata(r: Pick<ProductionRecord, 'title' | 'authors' | 'abstract' | 'keywords' | 'references'>): CheckItem[] {
  const words = wordCount(r.abstract)
  const blankAff = r.authors.filter((a) => a.affiliation.trim().length < 3)
  const badAuthors = r.authors.filter((a) => a.name.trim().length < 3 || !EMAIL_RE.test(a.email))
  const emptyRefs = r.references.filter((x) => x.trim().length < 20)
  const kws = r.keywords.filter((k) => k.trim())
  return [
    { key: 'title', label: 'Title', pass: r.title.trim().length >= 10 && r.title.trim().length <= 200, detail: `${r.title.trim().length} characters (10–200 required)` },
    { key: 'authors', label: 'Authors', pass: r.authors.length > 0 && badAuthors.length === 0, detail: r.authors.length === 0 ? 'At least one author is required' : badAuthors.length ? `${badAuthors.length} author(s) need a full name and valid email` : `${r.authors.length} author(s) with valid names and emails` },
    { key: 'affiliations', label: 'Affiliations', pass: r.authors.length > 0 && blankAff.length === 0, detail: blankAff.length ? `Missing for ${blankAff.map((a) => a.name || 'unnamed author').join(', ')}` : 'Every author has an affiliation' },
    { key: 'abstract', label: 'Abstract', pass: words >= 100 && words <= 300, detail: `${words} words (100–300 required)` },
    { key: 'keywords', label: 'Keywords', pass: kws.length >= 3 && kws.length <= 8, detail: `${kws.length} keyword(s) (3–8 required)` },
    { key: 'references', label: 'References', pass: r.references.length >= 5 && emptyRefs.length === 0, detail: r.references.length < 5 ? `${r.references.length} reference(s); at least 5 are required` : emptyRefs.length ? `${emptyRefs.length} reference(s) are empty or incomplete` : `${r.references.length} references complete` },
  ]
}

export interface Readiness {
  missing: string[]
  ready: boolean
}

export function readiness(r: ProductionRecord, requireAck: boolean): Readiness {
  const missing: string[] = []
  for (const c of validateMetadata(r)) if (!c.pass) missing.push(`${c.label}: ${c.detail}`)
  if (!r.seo.title.trim()) missing.push('SEO title is empty')
  else if (r.seo.title.length > 60) missing.push('SEO title is over 60 characters')
  if (!r.seo.description.trim()) missing.push('SEO description is empty')
  else if (r.seo.description.length > 160) missing.push('SEO description is over 160 characters')
  if (!isValidSlug(r.seo.slug)) missing.push('Slug is invalid (lowercase letters, numbers and hyphens, 5–80 characters)')
  if (!r.finalFile) missing.push('Final paper file has not been uploaded')
  const stale = r.authors.filter((a) => {
    const c = r.certificates.find((x) => x.authorEmail === a.email)
    return !c || c.name !== a.name
  })
  if (stale.length) missing.push(`Certificates ${r.certificates.length === 0 ? 'have not been generated' : 'are out of date'} for ${stale.map((a) => a.name || 'unnamed author').join(', ')}`)
  if (requireAck && !r.returnAcknowledged) missing.push('Confirm that the Editor’s return note has been addressed')
  return { missing, ready: missing.length === 0 }
}

/* ------------------------------------------------------------------ */
/* Seed backdated + post-publication data                               */
/* ------------------------------------------------------------------ */

const daysAgoIso = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

export function seedBackdated(): BackdatedItem[] {
  const mk = (journal: JournalCode, v: number, n: number, seq: number, title: string, label: string, date: string, ago: number, by: string, note: string): BackdatedItem => ({
    id: `bd-seed-${journal}-${seq}`, journal, originalId: `${journal}2025000${seq + 20}`, finalId: `${journal}.V${v}I${n}.${seq}`, generatedId: true, title,
    originalStatus: 'Rejected', issueId: `${journal}-V${v}I${n}`, issueLabel: label, issueDate: date, createdAt: daysAgoIso(ago), createdBy: by, note, status: 'published',
  })
  return [
    mk('IJCSD', 2, 1, 100, 'Static analysis of open-source Python packages: an empirical analysis in emerging economies', 'Volume 2, Issue 1', '2025-01-28', 41, 'Rohan Mehta', 'Original rejection was issued in error after a reviewer mix-up; paper re-accepted by the Editor and placed in the issue it was originally submitted for.'),
    mk('IJFRD', 1, 2, 100, 'A comparative study of microfinance repayment under climate shocks', 'Volume 1, Issue 2', '2024-04-28', 63, 'Priya Menon', 'Authors completed the revision after the issue closed; original ID was already reserved for another submission.'),
  ]
}

const eventsFor = (items: [number, string, string, string?][]): ChangeEvent[] =>
  items.map(([ago, actor, text, note], i) => ({ id: `cev-${i}-${ago}`, at: daysAgoIso(ago), actor, text, note }))

/** Seeds a handful of change requests against real published papers. */
export function seedChangeRequests(papers: Paper[], authorsOf: (p: Paper) => Author[]): ChangeRequest[] {
  const pub = (j: JournalCode, skip = 0) => papers.filter((p) => p.journal === j && ['published', 'indexed'].includes(p.status))[skip]
  const out: ChangeRequest[] = []
  const add = (r: ChangeRequest | undefined) => { if (r) out.push(r) }

  const p1 = pub('IJMAT', 0)
  if (p1) {
    const a = authorsOf(p1)[0]
    add({
      id: 'PPC-0001', paperId: p1.id, journal: p1.journal, type: 'author_name',
      reason: 'The corresponding author’s name was published with the surname and given name transposed. The passport and ORCID record both show the corrected form.',
      targets: [{ key: 'author-0-name', label: 'Author 1 · Name', oldValue: a.name, newValue: `${a.name.split(' ').slice(-1)[0]} ${a.name.split(' ').slice(0, -1).join(' ')}`.trim(), apply: { kind: 'author', index: 0, prop: 'name' } }],
      requestedBy: 'Isha Desai', requestedAt: daysAgo(2), status: 'requested', baseVersion: 1, versions: [],
      events: eventsFor([[2, 'Isha Desai', 'raised a change request', 'Author emailed support with a copy of the passport page.']]),
    })
  }
  const p2 = pub('JIMRT', 0)
  if (p2) {
    out.push({
      id: 'PPC-0002', paperId: p2.id, journal: p2.journal, type: 'correction',
      reason: 'The sample size in the Methodology section was reported as n = 214 but the analysis used 241 respondents (a digit transposition).',
      targets: [{ key: 'text-0', label: 'Corrected text (Section 3, paragraph 1)', oldValue: 'Data were gathered from 214 respondents', newValue: 'Data were gathered from 241 respondents', multiline: true, apply: { kind: 'text' } }],
      requestedBy: 'Neha Kapoor', requestedAt: daysAgo(5), status: 'approved', assigneeId: 'u-ae', baseVersion: 1, versions: [],
      events: eventsFor([[5, 'Neha Kapoor', 'raised a change request'], [4, 'Rohan Mehta', 'approved the change request', 'Confirmed against the author’s dataset.']]),
    })
  }
  const p3 = pub('IJCSD', 0)
  if (p3) {
    const a = authorsOf(p3)[0]
    out.push({
      id: 'PPC-0003', paperId: p3.id, journal: p3.journal, type: 'affiliation',
      reason: 'The author moved institutions before publication; the affiliation on the article page is outdated.',
      targets: [{ key: 'author-0-affiliation', label: 'Author 1 · Affiliation', oldValue: a.affiliation, newValue: 'Department of Computer Science, Indian Institute of Technology Madras', apply: { kind: 'author', index: 0, prop: 'affiliation' } }],
      requestedBy: 'Isha Desai', requestedAt: daysAgo(7), status: 'version_review', assigneeId: 'u-ae', baseVersion: 1,
      versions: [{ n: 2, at: daysAgoIso(1), by: 'Neha Kapoor', summary: 'Updated affiliation as requested', state: 'in_review', changes: [{ field: 'Author 1 · Affiliation', oldValue: a.affiliation, newValue: 'Department of Computer Science, Indian Institute of Technology Madras' }] }],
      events: eventsFor([[7, 'Isha Desai', 'raised a change request'], [6, 'Rohan Mehta', 'approved the change request'], [1, 'Neha Kapoor', 'submitted version 2 for approval']]),
    })
  }
  const p4 = pub('IJFRD', 0)
  if (p4) {
    out.push({
      id: 'PPC-0004', paperId: p4.id, journal: p4.journal, type: 'retraction',
      reason: 'A duplicate-publication complaint was substantiated: the same dataset and conclusions appear in a paper published earlier elsewhere without disclosure.',
      targets: [{ key: 'notice', label: 'Retraction notice', oldValue: '', newValue: 'This article has been retracted at the request of the Editor because substantial overlap with a previously published work was identified after publication.', multiline: true, apply: { kind: 'notice' } }],
      requestedBy: 'Priya Menon', requestedAt: daysAgo(3), status: 'rejected', baseVersion: 1, versions: [],
      decisionNote: 'Overlap is limited to the dataset description, which the authors cite correctly. A corrigendum is more proportionate than a retraction.',
      events: eventsFor([[3, 'Priya Menon', 'raised a change request'], [2, 'Rohan Mehta', 'rejected the change request', 'Overlap is limited to the dataset description, which the authors cite correctly. A corrigendum is more proportionate than a retraction.']]),
    })
  }
  const done = papers.find((p) => p.status === 'corrected')
  if (done) {
    const a = authorsOf(done)[0]
    out.push({
      id: 'PPC-0005', paperId: done.id, journal: done.journal, type: 'affiliation',
      reason: 'Department name was omitted from the first author’s affiliation.',
      targets: [{ key: 'author-0-affiliation', label: 'Author 1 · Affiliation', oldValue: 'Department omitted', newValue: a.affiliation, apply: { kind: 'author', index: 0, prop: 'affiliation' } }],
      requestedBy: 'Isha Desai', requestedAt: daysAgo(30), status: 'completed', assigneeId: 'u-ae', baseVersion: 1,
      versions: [{ n: 2, at: daysAgoIso(27), by: 'Neha Kapoor', summary: 'Added department to affiliation', state: 'live', changes: [{ field: 'Author 1 · Affiliation', oldValue: 'Department omitted', newValue: a.affiliation }] }],
      result: { at: daysAgoIso(26), by: 'Rohan Mehta', doi: `10.55041/${done.id}`, depositVersion: 2, paperStatus: 'corrected', certificates: [{ authorName: a.name, changed: false }], notified: [a.email] },
      events: eventsFor([[30, 'Isha Desai', 'raised a change request'], [29, 'Rohan Mehta', 'approved the change request'], [27, 'Neha Kapoor', 'submitted version 2 for approval'], [26, 'Rohan Mehta', 'approved version 2 and applied the change']]),
    })
  }
  return out
}

function daysAgo(d: number) {
  return daysAgoIso(d)
}
