import type { ActivityEntry, MessageLogEntry, Paper, Ticket, WhatsAppChat } from '@/shared/types'
import { JOURNAL_CODES } from './core'
import { NOW } from './papers'

const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()
const ahead = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

const SUBJECTS = [
  'Invoice copy needed for institutional reimbursement', 'Certificate shows wrong spelling of co-author name',
  'Unable to upload revised manuscript', 'Payment deducted but status still pending', 'Request for DOI link for published paper',
  'How long does the review take?', 'Change of corresponding author email', 'Plagiarism report requested by university',
  'Request to withdraw submission', 'Indexing status of my published paper', 'Need acceptance letter on letterhead',
  'GST number missing on invoice', 'Proof of UPI payment uploaded twice', 'Special issue deadline extension query',
]
const REQUESTERS = ['Aarav Sharma', 'Meera Nair', 'Vikram Singh', 'Sana Qureshi', 'Amelia Brooks', 'Tariq Hassan', 'Kavya Rao']

export function buildTickets(): Ticket[] {
  return SUBJECTS.map((subject, n) => ({
    id: `TKT-${2400 + n}`,
    journal: JOURNAL_CODES[n % 5],
    subject,
    requester: REQUESTERS[n % REQUESTERS.length],
    status: n % 5 === 4 ? 'resolved' : n % 3 === 1 ? 'pending' : 'open',
    priority: (['normal', 'high', 'low', 'urgent'] as const)[n % 4],
    assigneeId: n % 2 ? 'u-support' : undefined,
    createdAt: ago(3 + n * 9),
    dueAt: ahead(6 - n * 2),
  }))
}

export function buildChats(papers: Paper[]): WhatsAppChat[] {
  const msgs = [
    'Hello, has my paper been reviewed yet?', 'Please share the payment link again.', 'I have uploaded the UPI screenshot.',
    'Can you send the certificate again?', 'Thank you, received.', 'My co-author name is misspelt.', 'What is the next issue deadline?', 'Need invoice with GST number.',
  ]
  return msgs.map((lastMessage, n) => ({
    id: `chat-${n + 1}`,
    journal: (['IJMAT', 'JIMRT'] as const)[n % 2],
    contact: `+91 98${(76543210 + n * 1111111).toString().slice(0, 8)}`,
    paperId: papers.find((p) => p.journal === (['IJMAT', 'JIMRT'] as const)[n % 2] && p.status !== 'submitted' && papers.indexOf(p) % 8 === n)?.id,
    lastMessage,
    lastAt: ago(0.2 + n * 2.4),
    unread: n < 5 ? (n % 3) + 1 : 0,
  }))
}

const TEMPLATES = ['Submission received', 'Review assigned', 'Decision: accepted', 'Payment received', 'Invoice sent', 'Certificate ready', 'Published notice', 'Review reminder']

export function buildMessages(papers: Paper[]): MessageLogEntry[] {
  const channels = ['email', 'sms', 'whatsapp'] as const
  const out: MessageLogEntry[] = []
  for (let n = 0; n < 48; n++) {
    const p = papers[(n * 3) % papers.length]
    const channel = channels[n % 3]
    const failed = (channel === 'whatsapp' && n % 6 === 2) || (channel === 'sms' && n % 15 === 1) || (channel === 'email' && n === 7)
    out.push({
      id: `msg-${1000 + n}`,
      journal: p.journal,
      paperId: p.id,
      recipient: channel === 'email' ? p.authorEmail : `+91 98${(76500000 + n * 3917).toString().slice(0, 8)}`,
      channel,
      template: TEMPLATES[n % TEMPLATES.length],
      at: ago(0.5 + n * 1.7),
      status: failed ? 'failed' : n < 3 ? 'queued' : n % 4 === 0 ? 'sent' : 'delivered',
      failureReason: failed
        ? channel === 'whatsapp' ? 'Recipient not on WhatsApp or 24-hour window closed' : channel === 'sms' ? 'DLT template mismatch' : 'Mailbox full (452)'
        : undefined,
    })
  }
  return out
}

export function buildActivity(papers: Paper[]): ActivityEntry[] {
  const verbs: [string, string][] = [
    ['Rohan Mehta', 'accepted the paper and queued it for 08:45 dispatch'],
    ['Dr. Ananya Iyer', 'submitted a review report'],
    ['Priya Menon', 'verified an offline UPI payment'],
    ['Neha Kapoor', 'sent the paper for final approval'],
    ['System', 'generated author certificates'],
    ['Isha Desai', 'replied to a helpdesk ticket'],
    ['Karan Shah', 'assigned a reviewer'],
    ['System', 'deposited DOI metadata to Crossref'],
  ]
  return verbs.map(([actor, text], n) => {
    const p = papers[(n * 9 + 2) % papers.length]
    return { id: `act-${n}`, journal: p.journal, at: ago(0.3 + n * 1.9), actor, text, paperId: p.id }
  })
}

/** Share of published articles Google Scholar has indexed, per journal (placeholder figures). */
export const SCHOLAR_RATE: Record<string, number> = { IJMAT: 82.4, JIMRT: 76.1, IJCSD: 88.9, IJECM: 71.3, IJFRD: 79.6 }
