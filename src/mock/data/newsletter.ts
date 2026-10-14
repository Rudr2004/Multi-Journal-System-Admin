import type { JournalCode } from '@/shared/types'
import { JOURNAL_CODES } from './core'
import { NOW } from './papers'

const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString()
const ahead = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

export type SubscriberStatus = 'confirmed' | 'pending' | 'unsubscribed'
export const SUBSCRIBER_SOURCES = ['Website footer', 'Article page', 'Blog post', 'Conference page', 'Author thank-you page'] as const
export type SubscriberSource = (typeof SUBSCRIBER_SOURCES)[number]

export interface Subscriber {
  id: string
  email: string
  journal: JournalCode
  source: SubscriberSource
  status: SubscriberStatus
  subscribedAt: string
  confirmedAt?: string
  unsubscribedAt?: string
}

const FIRST = ['aditi', 'rahul', 'meera', 'sanjay', 'fatima', 'arjun', 'kavya', 'vikram', 'lakshmi', 'imran', 'neelam', 'rohit', 'sunita', 'pranav', 'divya', 'harsh', 'ananya', 'tarun', 'zoya', 'manish', 'shruti', 'deepak', 'pooja', 'nikhil', 'ritu']
const LAST = ['nair', 'sharma', 'iyer', 'khan', 'patel', 'reddy', 'das', 'mehta', 'gupta', 'joshi', 'menon', 'singh']
const DOMAINS = ['iitm.example.edu', 'du.example.ac.in', 'gmail.com', 'outlook.com', 'vit.example.edu', 'nitk.example.ac.in', 'yahoo.in', 'bits.example.edu', 'jnu.example.ac.in', 'uni-hamburg.example.de', 'ntu.example.edu.sg', 'unilag.example.edu.ng']

export function buildSubscribers(): Subscriber[] {
  const out: Subscriber[] = []
  for (let n = 0; n < 60; n++) {
    const first = FIRST[(n * 7) % FIRST.length]
    const last = LAST[(n * 5 + 3) % LAST.length]
    const status: SubscriberStatus = n % 9 === 4 || n % 9 === 7 ? 'pending' : n % 7 === 3 ? 'unsubscribed' : 'confirmed'
    const subscribed = 2 + ((n * 17) % 330)
    out.push({
      id: `sub-${1000 + n}`,
      email: `${first}.${last}${n % 4 === 0 ? n : ''}@${DOMAINS[(n * 3) % DOMAINS.length]}`,
      journal: JOURNAL_CODES[(n * 2 + (n >> 2)) % JOURNAL_CODES.length],
      source: SUBSCRIBER_SOURCES[(n * 3 + 1) % SUBSCRIBER_SOURCES.length],
      status,
      subscribedAt: ago(subscribed, n % 11),
      confirmedAt: status === 'pending' ? undefined : ago(subscribed, (n % 11) - 1),
      unsubscribedAt: status === 'unsubscribed' ? ago(Math.max(1, subscribed - 12)) : undefined,
    })
  }
  return out.sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt))
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                            */
/* ------------------------------------------------------------------ */

export type CampaignStatus = 'draft' | 'scheduled' | 'sent'

export interface CampaignAudience {
  /** empty = every journal */
  journals: JournalCode[]
  /** empty = every source */
  sources: SubscriberSource[]
}
export interface CampaignAttachment { name: string; sizeKb: number }
export interface DeliveryReport { sent: number; delivered: number; opened: number; bounced: number; unsubscribed: number }

export interface Campaign {
  id: string
  subject: string
  /** simple markup: ## heading, **bold**, _italic_, [text](url), "- " bullets */
  body: string
  audience: CampaignAudience
  attachments: CampaignAttachment[]
  status: CampaignStatus
  scheduledAt?: string
  sentAt?: string
  createdBy: string
  updatedAt: string
  report?: DeliveryReport
}

export const emptyAudience = (): CampaignAudience => ({ journals: [], sources: [] })

export const buildCampaigns = (): Campaign[] => [
  {
    id: 'cmp-1', subject: 'October issue is live: 42 new articles across five journals', status: 'sent', createdBy: 'Priya Menon', updatedAt: ago(12), sentAt: ago(12),
    body: '## The October issue is live\n\nDear reader,\n\nThe October issue of our journals is now online. Highlights include:\n\n- A study of **digital twins** for process monitoring (IJMAT)\n- Credit risk models for emerging markets (IJFRD)\n- Open datasets for low-resource NLP (IJCSD)\n\n[Read the issue](https://example.org/october)\n\nWith regards,\nEditorial Office',
    audience: emptyAudience(), attachments: [], report: { sent: 31, delivered: 30, opened: 17, bounced: 1, unsubscribed: 1 },
  },
  {
    id: 'cmp-2', subject: 'Call for papers: special issue on sustainable computing', status: 'sent', createdBy: 'Priya Menon', updatedAt: ago(34), sentAt: ago(34),
    body: '## Call for papers\n\nWe invite submissions for a special issue on **sustainable computing**.\n\n- Deadline: 30 November\n- Article types: research, review, short communication\n\n[Submission guidelines](https://example.org/cfp)',
    audience: { journals: ['IJCSD', 'IJECM'], sources: [] }, attachments: [{ name: 'special-issue-flyer.pdf', sizeKb: 412 }], report: { sent: 13, delivered: 13, opened: 8, bounced: 0, unsubscribed: 0 },
  },
  {
    id: 'cmp-3', subject: 'Reviewer thank-you and what is new in the review workspace', status: 'sent', createdBy: 'Priya Menon', updatedAt: ago(61), sentAt: ago(61),
    body: 'Dear reader,\n\nThank you to everyone who reviewed for us this quarter.\n\n- Faster review reminders\n- A clearer report form\n\nWith regards,\nEditorial Office',
    audience: { journals: ['IJMAT', 'JIMRT'], sources: ['Website footer'] }, attachments: [], report: { sent: 9, delivered: 8, opened: 4, bounced: 1, unsubscribed: 0 },
  },
  {
    id: 'cmp-4', subject: 'November issue preview and publication charge reminder', status: 'scheduled', createdBy: 'Priya Menon', updatedAt: ago(1), scheduledAt: ahead(6),
    body: '## November issue preview\n\nDear reader,\n\nThe November issue closes for new acceptances on **25 November**.\n\n- Pay the publication charge soon after acceptance\n- Upload offline payment proofs with the UTR\n\n[Pay or upload proof](https://example.org/pay)',
    audience: emptyAudience(), attachments: [],
  },
  {
    id: 'cmp-5', subject: 'Indexing update: our journals on Google Scholar', status: 'draft', createdBy: 'Priya Menon', updatedAt: ago(3),
    body: '## Indexing update\n\nSeveral articles were indexed this month.\n\n- IJMAT: 12 articles\n- JIMRT: 8 articles',
    audience: { journals: ['IJMAT', 'JIMRT'], sources: [] }, attachments: [],
  },
  {
    id: 'cmp-6', subject: 'Conference proceedings now open for submission', status: 'draft', createdBy: 'Priya Menon', updatedAt: ago(8),
    body: 'Dear reader,\n\nProceedings papers from this year conferences are open for submission.\n\n[Read more](https://example.org/conferences)',
    audience: { journals: [], sources: ['Conference page'] }, attachments: [{ name: 'proceedings-template.docx', sizeKb: 88 }],
  },
]
