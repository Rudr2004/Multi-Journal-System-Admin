import type { Issue, JournalCode, Paper, PaperStatus } from '@/shared/types'
import type { Tone } from '@/shared/statuses'
import { NOW } from './papers'

/** Statuses of papers that are live on the journal website and can be placed in an issue / get a certificate. */
export const PUBLISHED_STATUSES: PaperStatus[] = ['published', 'indexed', 'corrected']
export const isPublished = (p: Paper) => PUBLISHED_STATUSES.includes(p.status)

export interface Conference {
  id: string
  /** Journal that publishes the proceedings. */
  journal: JournalCode
  name: string
  shortName: string
  startDate: string // ISO date
  endDate: string
  venue: string
  city: string
  organiser: string
  theme: string
  logoName?: string
  logoData?: string
  organiserLogoName?: string
  organiserLogoData?: string
  submissionDeadline: string
  cameraReadyDeadline: string
  /** Optional conference-specific article processing charge. */
  apc?: { currency: 'INR' | 'USD'; amount: number }
  proceedingsIssueId?: string
  createdAt: string
}

export interface CertificateRecord {
  version: number
  issuedAt: string
  lastSentAt?: string
  sendCount: number
}

export interface CoverImage { name: string; data?: string }

export function buildConferences(): Conference[] {
  const at = (d: string) => `${d}T09:00:00.000Z`
  return [
    {
      id: 'conf-icamt-2026', journal: 'IJMAT', name: 'International Conference on Applied Materials & Technology', shortName: 'ICAMT 2026',
      startDate: '2026-12-11', endDate: '2026-12-12', venue: 'Gujarat University Convention Centre', city: 'Ahmedabad, India',
      organiser: 'Department of Mechanical Engineering, Gujarat University',
      theme: 'Smart materials and digital manufacturing for resilient industry',
      submissionDeadline: '2026-11-10', cameraReadyDeadline: '2026-11-25', apc: { currency: 'INR', amount: 2500 }, createdAt: at('2026-06-02'),
    },
    {
      id: 'conf-ncmrt-2027', journal: 'JIMRT', name: 'National Conference on Management Research & Technology', shortName: 'NCMRT 2027',
      startDate: '2027-01-22', endDate: '2027-01-23', venue: 'Symbiosis Institute of Business Management', city: 'Pune, India',
      organiser: 'Symbiosis Institute of Business Management',
      theme: 'Leadership and innovation in a hybrid, technology-led economy',
      submissionDeadline: '2026-12-05', cameraReadyDeadline: '2026-12-28', apc: { currency: 'INR', amount: 2000 }, createdAt: at('2026-07-14'),
    },
    {
      id: 'conf-iccsd-2026', journal: 'IJCSD', name: 'International Conference on Computing, Software & Data', shortName: 'ICCSD 2026',
      startDate: '2026-09-18', endDate: '2026-09-19', venue: 'PES University Auditorium', city: 'Bengaluru, India',
      organiser: 'School of Computer Science, PES University',
      theme: 'Trustworthy software and data systems at scale',
      submissionDeadline: '2026-07-31', cameraReadyDeadline: '2026-08-30', apc: { currency: 'USD', amount: 49 }, createdAt: at('2026-03-18'),
      proceedingsIssueId: 'IJCSD-P-ICCSD2026',
    },
    {
      id: 'conf-gcem-2027', journal: 'IJECM', name: 'Global Conference on Engineering, Computing & Materials', shortName: 'GCEM 2027',
      startDate: '2027-04-08', endDate: '2027-04-10', venue: 'Nanyang Technological University', city: 'Singapore',
      organiser: 'College of Engineering, Nanyang Technological University',
      theme: 'Sustainable materials and energy-efficient computing',
      submissionDeadline: '2027-02-15', cameraReadyDeadline: '2027-03-15', apc: { currency: 'USD', amount: 120 }, createdAt: at('2026-08-21'),
    },
    {
      id: 'conf-findev-2026', journal: 'IJFRD', name: 'Finance Research & Development Symposium', shortName: 'FINDEV 2026',
      startDate: '2026-08-07', endDate: '2026-08-08', venue: 'NSE Knowledge Hub', city: 'Mumbai, India',
      organiser: 'Centre for Financial Studies, Mumbai',
      theme: 'Digital payments, credit access and household finance',
      submissionDeadline: '2026-06-10', cameraReadyDeadline: '2026-07-05', createdAt: at('2026-01-27'),
      proceedingsIssueId: 'IJFRD-P-FINDEV2026',
    },
  ]
}

/** Papers linked to each conference (the conference ↔ submission mapping). */
export function buildConferenceLinks(papers: Paper[], conferences: Conference[]): Record<string, string[]> {
  const eligible = (p: Paper) => !['rejected', 'withdrawn'].includes(p.status)
  const links: Record<string, string[]> = {}
  conferences.forEach((c, ci) => {
    const pool = papers.filter((p) => p.journal === c.journal && eligible(p))
    const take = 4 + (ci % 3)
    links[c.id] = pool.slice(ci, ci + take).map((p) => p.id)
  })
  return links
}

/** Proceedings issues that already exist for concluded conferences. */
export function buildProceedingsIssues(conferences: Conference[], published: Record<string, string[]>): Issue[] {
  return conferences.filter((c) => c.proceedingsIssueId).map((c) => {
    const done = c.id === 'conf-findev-2026'
    const articleIds = published[c.id] ?? []
    return {
      id: c.proceedingsIssueId!, journal: c.journal, volume: 3, number: 5, label: `Proceedings: ${c.shortName}`,
      month: c.startDate.slice(0, 8) + '01', submissionDeadline: c.submissionDeadline,
      publicationDate: done ? '2026-09-25' : c.cameraReadyDeadline.slice(0, 8) + '28',
      status: done ? 'published' : 'in_production',
      callForPapers: `Peer-reviewed proceedings of ${c.name} (${c.shortName}), ${c.city}.`,
      articleIds, pages: Object.fromEntries(articleIds.map((id, i) => [id, `${i * 8 + 1}–${i * 8 + 8}`])),
      conferenceId: c.id, actualOnlineDate: done ? '2026-09-25' : undefined,
    } satisfies Issue
  })
}

export function conferenceStatus(c: Conference, issue?: Issue): { label: string; tone: Tone } {
  if (issue?.status === 'published') return { label: 'Proceedings published', tone: 'success' }
  if (issue) return { label: 'Proceedings in progress', tone: 'accent' }
  const today = NOW.toISOString().slice(0, 10)
  if (today > c.endDate) return { label: 'Concluded', tone: 'neutral' }
  if (today > c.submissionDeadline) return { label: 'Submissions closed', tone: 'warning' }
  return { label: 'Open for submissions', tone: 'info' }
}

export const ISSUE_STATUS_META: Record<Issue['status'], { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  open: { label: 'Open for submissions', tone: 'info' },
  in_production: { label: 'In production', tone: 'accent' },
  published: { label: 'Published', tone: 'success' },
}
export const ISSUE_FLOW: Issue['status'][] = ['draft', 'open', 'in_production', 'published']
