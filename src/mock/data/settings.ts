import type { AuditEntry, JournalCode } from '@/shared/types'
import { formatPaperId } from '@/shared/paperId'
import { JOURNALS, journalByCode } from './core'
import { NOW } from './papers'

/* ------------------------------------------------------------------ */
/* Journal settings                                                    */
/* ------------------------------------------------------------------ */

export interface DispatchSlot { label: string; time: string }

export interface JournalSettings {
  name: string
  domain: string
  issn: string
  /** Next Paper ID sequence number (6 digits in the ID). */
  nextSequence: number
  apcInr: number
  apcUsd: number
  gstin: string
  gstState: string
  whatsapp: string
  dispatchSlots: DispatchSlot[]
  supportStart: string
  supportEnd: string
  /** Shown on the website's call for papers and submit page, e.g. "Within 24 hours". */
  firstDecision: string
  /** Shown on the website, e.g. "Within 24 hours of acceptance". */
  publicationTime: string
  /** Indexing badges shown in the website footer / journal header, by service id. */
  indexing: Record<string, boolean>
  /** Everything the journal website shows that is not a fee or an ID: contact, subjects, trust and call for papers. */
  site: SiteSettings
}

export interface LabelValue { label: string; value: string }
export interface SiteSettings {
  infoTable: LabelValue[]
  publisher: string
  emails: LabelValue[]
  phones: LabelValue[]
  address: string
  mapLink: string
  social: { linkedin: string; x: string; facebook: string; youtube: string; instagram: string }
  subjects: { name: string; branches: string[] }[]
  articleTypes: string[]
  trustBadges: string[]
  trustLedger: { title: string; detail: string; date: string }[]
  callForPapers: { enabled: boolean; text: string; deadline: string }
}

const SUBJECTS: Record<JournalCode, { name: string; branches: string[] }[]> = {
  IJMAT: [
    { name: 'Smart materials', branches: ['Shape-memory alloys', 'Composites', 'Nanomaterials'] },
    { name: 'Manufacturing', branches: ['Additive manufacturing', 'Lean production'] },
    { name: 'Technology-enabled learning', branches: ['Blended learning', 'Learning analytics'] },
  ],
  JIMRT: [
    { name: 'Management', branches: ['Operations', 'Organisational behaviour', 'Strategy'] },
    { name: 'Technology and society', branches: ['Digital governance', 'Public policy'] },
  ],
  IJCSD: [
    { name: 'Machine learning', branches: ['Federated learning', 'Computer vision', 'NLP'] },
    { name: 'Software engineering', branches: ['DevOps', 'Testing'] },
    { name: 'Distributed systems', branches: ['Edge computing', 'Cloud-native'] },
  ],
  IJECM: [
    { name: 'Structures', branches: ['Civil structures', 'Earthquake engineering'] },
    { name: 'Energy systems', branches: ['Battery packs', 'Thermal management'] },
    { name: 'Embedded design', branches: ['IoT devices', 'Control systems'] },
  ],
  IJFRD: [
    { name: 'Banking', branches: ['Credit risk', 'Digital payments'] },
    { name: 'Capital markets', branches: ['Asset pricing', 'Market microstructure'] },
    { name: 'Household finance', branches: ['Savings behaviour', 'UPI adoption'] },
  ],
}

function buildSite(code: JournalCode, i: number): SiteSettings {
  const host = code.toLowerCase()
  return {
    infoTable: [
      { label: 'Frequency', value: 'Quarterly (January, April, July, October)' },
      { label: 'Peer review', value: 'Double-blind' },
      { label: 'Access', value: 'Open access (CC BY 4.0)' },
      { label: 'Average time to first decision', value: '21 days' },
      { label: 'Language', value: 'English' },
    ],
    publisher: 'Edtech Publishers',
    emails: [
      { label: 'Editorial office', value: `editorial@${host}.example.org` },
      { label: 'Payments', value: `accounts@${host}.example.org` },
    ],
    phones: [{ label: 'Phone and WhatsApp', value: '+91 20 4000 1100' }],
    address: 'Edtech Publishers, Plot 14, Knowledge Park, Pune 411057, India',
    mapLink: 'https://maps.google.com/?q=Knowledge+Park+Pune',
    social: {
      linkedin: `https://www.linkedin.com/company/${host}`, x: `https://x.com/${host}`,
      facebook: i % 2 === 0 ? `https://facebook.com/${host}` : '', youtube: '', instagram: '',
    },
    subjects: SUBJECTS[code].map((s) => ({ name: s.name, branches: [...s.branches] })),
    articleTypes: ['Research article', 'Review article', 'Case study', 'Short communication'],
    trustBadges: ['Peer reviewed', 'Open access', 'COPE guidelines', 'Plagiarism checked'],
    trustLedger: [
      { title: 'Crossref DOI registered', detail: 'All published articles receive a permanent DOI.', date: '2025-03-12' },
      { title: 'Similarity checks on every submission', detail: 'Screening includes a text-overlap report.', date: '2025-06-01' },
    ],
    callForPapers: { enabled: i !== 3, text: `${code} is accepting original research, review articles and case studies for the next issue. All submissions are double-blind peer reviewed.`, deadline: '2026-12-20' },
  }
}

export const INDEXING_SERVICES: { id: string; label: string; description: string }[] = [
  { id: 'scholar', label: 'Google Scholar', description: 'Articles are crawled by Google Scholar.' },
  { id: 'crossref', label: 'Crossref', description: 'DOIs are registered with Crossref.' },
  { id: 'doaj', label: 'DOAJ', description: 'Listed in the Directory of Open Access Journals.' },
  { id: 'scopus', label: 'Scopus', description: 'Only enable after Elsevier confirms acceptance.' },
  { id: 'wos', label: 'Web of Science', description: 'Only enable after Clarivate confirms coverage.' },
  { id: 'ugc', label: 'UGC-CARE', description: 'Listed in the UGC-CARE reference list.' },
  { id: 'base', label: 'BASE', description: 'Harvested by Bielefeld Academic Search Engine.' },
  { id: 'openaire', label: 'OpenAIRE', description: 'Harvested by OpenAIRE.' },
]

export const INDIAN_STATES = [
  'Gujarat', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Delhi', 'Uttar Pradesh', 'Rajasthan', 'West Bengal', 'Kerala', 'Telangana', 'Madhya Pradesh', 'Punjab',
]

/** Default APC (INR, USD) per journal, used by analytics revenue maths and as settings seed. */
export const APC_DEFAULTS: Record<JournalCode, { inr: number; usd: number }> = {
  IJMAT: { inr: 2950, usd: 49 },
  JIMRT: { inr: 3500, usd: 59 },
  IJCSD: { inr: 3200, usd: 55 },
  IJECM: { inr: 2950, usd: 49 },
  IJFRD: { inr: 3800, usd: 65 },
}

const GSTIN: Record<JournalCode, string> = {
  IJMAT: '24AABCE4821F1Z5', JIMRT: '24AABCE4821F1Z5', IJCSD: '24AABCE4821F1Z5', IJECM: '24AABCE4821F1Z5', IJFRD: '24AABCE4821F1Z5',
}

const WHATSAPP: Record<JournalCode, string> = {
  IJMAT: '+91 98250 10001', JIMRT: '+91 98250 10002', IJCSD: '+91 98250 10003', IJECM: '+91 98250 10004', IJFRD: '+91 98250 10005',
}

/** Snapshot of the journal identity before any edits, so Reset demo data can restore it. */
const ORIGINAL = JOURNALS.map((j) => ({ ...j }))

export function restoreJournalIdentity() {
  for (const o of ORIGINAL) Object.assign(journalByCode(o.code), o)
}

export function buildJournalSettings(): Record<JournalCode, JournalSettings> {
  const out = {} as Record<JournalCode, JournalSettings>
  ORIGINAL.forEach((j, i) => {
    out[j.code] = {
      name: j.name,
      domain: j.domain,
      issn: j.issn,
      nextSequence: 100 + (i + 1) * 13 * 8,
      apcInr: APC_DEFAULTS[j.code].inr,
      apcUsd: APC_DEFAULTS[j.code].usd,
      gstin: GSTIN[j.code],
      gstState: 'Gujarat',
      whatsapp: WHATSAPP[j.code],
      dispatchSlots: [
        { label: 'Morning author dispatch', time: '08:45' },
        { label: 'Evening reminders', time: '17:30' },
      ],
      supportStart: '10:00',
      supportEnd: '18:00',
      firstDecision: 'Within 24 hours',
      publicationTime: 'Within 24 hours of acceptance',
      site: buildSite(j.code, i),
      indexing: { scholar: true, crossref: true, doaj: i % 2 === 0, scopus: false, wos: false, ugc: i === 2 || i === 4, base: true, openaire: i < 3 },
    }
  })
  return out
}

/* ------------------------------------------------------------------ */
/* Seeded user activity + audit history                                 */
/* ------------------------------------------------------------------ */

export interface AuditCategoryDef { id: string; label: string }
export const AUDIT_CATEGORIES: AuditCategoryDef[] = [
  { id: 'decision', label: 'Editorial decisions' },
  { id: 'status', label: 'Status changes' },
  { id: 'payment', label: 'Payments & invoices' },
  { id: 'publishing', label: 'Publishing & DOI' },
  { id: 'users', label: 'Users & roles' },
  { id: 'settings', label: 'Settings' },
  { id: 'content', label: 'Website content' },
  { id: 'export', label: 'Exports' },
  { id: 'other', label: 'Other' },
]

/** Group free-text audit actions into filterable categories. */
export function auditCategory(action: string): string {
  const a = action.toLowerCase()
  if (/export/.test(a)) return 'export'
  if (/user|role|invit|suspend|reactivat|deactivat|access reset|assignment/.test(a)) return 'users'
  if (/setting|apc|issn|gst|domain|whatsapp|indexing|paper id|time slot|public metric/.test(a)) return 'settings'
  if (/payment|invoice|refund|verification/.test(a)) return 'payment'
  if (/doi|crossref|issue|publish|retract|correction|indexed/.test(a) && !/status changed/.test(a)) return 'publishing'
  if (/reject|accept|decision|revision|reviewer|returned/.test(a)) return 'decision'
  if (/status/.test(a)) return 'status'
  if (/announcement|board|page|template|cms|faq|award|content/.test(a)) return 'content'
  return 'other'
}

type Seed = [actor: string, journal: JournalCode | 'ALL', action: string, target: string, oldValue?: string, newValue?: string]

const P = (j: JournalCode, n: number) => formatPaperId(j, 2026, 100 + n * 13)

const SEED_ENTRIES: Seed[] = [
  ['Priya Menon', 'IJMAT', 'APC updated', 'IJMAT settings', 'APC (INR): 2,800\nAPC (USD): 45', 'APC (INR): 2,950\nAPC (USD): 49'],
  ['Rohan Mehta', 'IJMAT', 'Paper accepted', P('IJMAT', 3), 'decision_pending', 'accepted'],
  ['Neha Kapoor', 'JIMRT', 'Status changed to in_production', P('JIMRT', 4), 'paid', 'in_production'],
  ['Priya Menon', 'ALL', 'User invited', 'Karan Shah', undefined, 'IJMAT: Editor\nJIMRT: Associate Editor'],
  ['Isha Desai', 'IJMAT', 'Payment verified', 'PAY-IJMAT-0212', 'pending_verification', 'verified'],
  ['Rohan Mehta', 'IJCSD', 'Paper rejected', P('IJCSD', 2), 'decision_pending', 'rejected'],
  ['Priya Menon', 'JIMRT', 'Journal settings updated: ISSN', 'JIMRT settings', 'ISSN: 2584-1020', 'ISSN: 2584-1002'],
  ['Neha Kapoor', 'JIMRT', 'DOI deposited to Crossref', P('JIMRT', 5), undefined, 'Deposit v1 — success'],
  ['Priya Menon', 'IJECM', 'Role changed', 'Dr. Sofia Alvarez', 'IJECM: Reviewer', 'IJECM: Review Panel Member'],
  ['Rohan Mehta', 'IJMAT', 'Changes requested', P('IJMAT', 6), 'under_review', 'changes_requested'],
  ['Priya Menon', 'IJFRD', 'Issue published', 'IJFRD Volume 3, Issue 2', 'in_production', 'published'],
  ['Isha Desai', 'JIMRT', 'Payment verification rejected', 'PAY-JIMRT-0188', 'pending_verification', 'rejected'],
  ['Priya Menon', 'ALL', 'Public metrics changed', 'Website metrics', 'Show acceptance rate: Off', 'Show acceptance rate: On'],
  ['Karan Shah', 'IJMAT', 'Status changed to published', P('IJMAT', 7), 'ready_for_approval', 'published'],
  ['Rohan Mehta', 'IJCSD', 'Paper accepted', P('IJCSD', 4), 'decision_pending', 'accepted'],
  ['Neha Kapoor', 'JIMRT', 'Returned to production', P('JIMRT', 6), 'ready_for_approval', 'returned_to_production'],
  ['Priya Menon', 'IJCSD', 'Template edited', 'Acceptance email', 'Subject: Your paper has been accepted', 'Subject: Accepted — next steps for your paper'],
  ['Priya Menon', 'ALL', 'User suspended', 'Dr. Ananya Iyer', 'active', 'suspended'],
  ['Priya Menon', 'ALL', 'User reactivated', 'Dr. Ananya Iyer', 'suspended', 'active'],
  ['Isha Desai', 'IJMAT', 'Refund issued', 'PAY-IJMAT-0170', 'verified', 'refunded'],
  ['Rohan Mehta', 'IJMAT', 'Reviewer assigned', P('IJMAT', 8), undefined, 'Dr. Ananya Iyer'],
  ['Priya Menon', 'IJFRD', 'Journal settings updated: GSTIN', 'IJFRD settings', 'GSTIN: 24AABCE4821F1Z0', 'GSTIN: 24AABCE4821F1Z5'],
  ['Neha Kapoor', 'JIMRT', 'Status changed to ready_for_approval', P('JIMRT', 7), 'in_production', 'ready_for_approval'],
  ['Priya Menon', 'IJECM', 'Indexing badge enabled', 'IJECM settings', 'Google Scholar badge: Off', 'Google Scholar badge: On'],
  ['Karan Shah', 'IJMAT', 'Correction published', P('IJMAT', 9), 'published', 'corrected'],
  ['Rohan Mehta', 'IJCSD', 'Paper retracted', P('IJCSD', 6), 'published', 'retracted'],
  ['Priya Menon', 'ALL', 'Exported audit log (CSV)', 'Audit log', undefined, '48 rows'],
  ['Isha Desai', 'JIMRT', 'Announcement published', 'Call for papers — Vol 3 Issue 4', 'draft', 'published'],
  ['Priya Menon', 'IJMAT', 'Journal settings updated: WhatsApp number', 'IJMAT settings', 'WhatsApp: +91 98250 10099', 'WhatsApp: +91 98250 10001'],
  ['Rohan Mehta', 'IJMAT', 'Paper rejected', P('IJMAT', 11), 'decision_pending', 'rejected'],
  ['Priya Menon', 'ALL', 'User invited', 'Isha Desai', undefined, 'IJMAT: Support Executive\nJIMRT: Support Executive'],
  ['Neha Kapoor', 'JIMRT', 'Status changed to published', P('JIMRT', 9), 'ready_for_approval', 'published'],
  ['Isha Desai', 'IJCSD', 'Payment verified', 'PAY-IJCSD-0101', 'pending_verification', 'verified'],
  ['Priya Menon', 'IJFRD', 'Journal settings updated: APC', 'IJFRD settings', 'APC (INR): 3,500\nAPC (USD): 59', 'APC (INR): 3,800\nAPC (USD): 65'],
  ['Rohan Mehta', 'IJCSD', 'Changes requested', P('IJCSD', 8), 'under_review', 'changes_requested'],
  ['Karan Shah', 'JIMRT', 'Page edited', 'Author guidelines', 'Version 4', 'Version 5'],
  ['Priya Menon', 'IJECM', 'Role changed', 'Neha Kapoor', 'IJECM: No access', 'IJECM: Associate Editor'],
  ['Priya Menon', 'IJECM', 'Role changed', 'Neha Kapoor', 'IJECM: Associate Editor', 'IJECM: No access'],
  ['Neha Kapoor', 'JIMRT', 'DOI deposited to Crossref', P('JIMRT', 10), undefined, 'Deposit v1 — success'],
  ['Isha Desai', 'IJMAT', 'Payment verified', 'PAY-IJMAT-0233', 'pending_verification', 'verified'],
  ['Priya Menon', 'IJMAT', 'Journal settings updated: Paper ID sequence', 'IJMAT settings', 'Next sequence: 100', 'Next sequence: 104'],
  ['Rohan Mehta', 'IJMAT', 'Paper accepted', P('IJMAT', 12), 'decision_pending', 'accepted'],
  ['Karan Shah', 'IJMAT', 'Status changed to in_production', P('IJMAT', 13), 'paid', 'in_production'],
  ['Priya Menon', 'ALL', 'Exported analytics (CSV)', 'Analytics', undefined, '12 months, 5 journals'],
  ['Priya Menon', 'IJCSD', 'Journal settings updated: Time slots', 'IJCSD settings', 'Dispatch: 08:45', 'Dispatch: 08:45, 17:30'],
  ['Isha Desai', 'JIMRT', 'Payment verification rejected', 'PAY-JIMRT-0204', 'pending_verification', 'rejected'],
  ['Rohan Mehta', 'IJCSD', 'Paper accepted', P('IJCSD', 10), 'decision_pending', 'accepted'],
  ['Neha Kapoor', 'JIMRT', 'Issue published', 'JIMRT Volume 3, Issue 1', 'in_production', 'published'],
  ['Priya Menon', 'ALL', 'User deactivated', 'Former contractor', 'active', 'deactivated'],
  ['Karan Shah', 'IJMAT', 'Reviewer assigned', P('IJMAT', 14), undefined, 'Dr. Ananya Iyer'],
  ['Priya Menon', 'IJECM', 'Indexing badge enabled', 'IJECM settings', 'DOAJ badge: Off', 'DOAJ badge: On'],
  ['Rohan Mehta', 'IJMAT', 'Changes requested', P('IJMAT', 15), 'under_review', 'changes_requested'],
  ['Isha Desai', 'IJMAT', 'Refund issued', 'PAY-IJMAT-0141', 'verified', 'refunded'],
  ['Priya Menon', 'IJFRD', 'Journal settings updated: Domain', 'IJFRD settings', 'Domain: ijfrd.example.net', 'Domain: ijfrd.example.org'],
  ['Neha Kapoor', 'JIMRT', 'Returned to production', P('JIMRT', 12), 'ready_for_approval', 'returned_to_production'],
  ['Rohan Mehta', 'IJCSD', 'Paper rejected', P('IJCSD', 12), 'decision_pending', 'rejected'],
  ['Priya Menon', 'ALL', 'Role changed', 'Dr. Sofia Alvarez', 'IJECM: No access', 'IJECM: Reviewer'],
  ['Karan Shah', 'IJMAT', 'Status changed to published', P('IJMAT', 16), 'ready_for_approval', 'published'],
  ['Isha Desai', 'IJCSD', 'Payment verified', 'PAY-IJCSD-0119', 'pending_verification', 'verified'],
  ['Priya Menon', 'IJMAT', 'Journal settings updated: GST details', 'IJMAT settings', 'GST state: Maharashtra', 'GST state: Gujarat'],
  ['Neha Kapoor', 'JIMRT', 'Status changed to published', P('JIMRT', 14), 'ready_for_approval', 'published'],
]

/** ~60 realistic historic entries spread over the last ~100 days, newest first. */
export function buildAuditHistory(): AuditEntry[] {
  return SEED_ENTRIES.map((s, i) => {
    // roughly 1.5 days apart with a deterministic jitter, working hours IST
    const hours = 6 + i * 36 + ((i * 7) % 11)
    const at = new Date(NOW.getTime() - hours * 3_600_000)
    return {
      id: `aud-seed-${String(i + 1).padStart(3, '0')}`,
      at: at.toISOString(),
      actor: s[0],
      journal: s[1],
      action: s[2],
      target: s[3],
      oldValue: s[4],
      newValue: s[5],
    }
  })
}

/** Subject / expertise vocabulary shared with editorial reviewer matching (mirrors the subjects used in data/editorial.ts). */
export const SUBJECT_VOCAB: string[] = [
  'Accounting', 'Agriculture', 'Automation', 'Banking', 'Capital markets', 'Civil engineering', 'Climate & development', 'Consumer behaviour',
  'Digital commerce', 'Distributed systems', 'Econometrics', 'Education technology', 'Electronics', 'Energy systems', 'Engineering education',
  'Entrepreneurship', 'Environmental engineering', 'Financial inclusion', 'Higher education', 'Human resources', 'Innovation management',
  'Machine learning', 'Manufacturing', 'Marketing', 'Materials science', 'Mechanical design', 'Natural language processing',
  'Organisational behaviour', 'Public health', 'Public policy', 'Regional development', 'Security & fraud', 'Signal processing',
  'Software engineering', 'Supply chain', 'Sustainability',
]
