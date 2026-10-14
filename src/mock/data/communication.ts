import type { Channel, JournalCode, Paper } from '@/shared/types'
import { doiFor } from '@/shared/paperId'
import { formatDate } from '@/shared/formatters'
import { journalByCode } from './core'
import { NOW, nextDispatch } from './papers'

const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

/* ------------------------------------------------------------------ */
/* Template variables                                                   */
/* ------------------------------------------------------------------ */

export interface TemplateVariable { key: string; label: string; sample: string }

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: 'paper_id', label: 'Paper ID', sample: 'IJMAT2026000113' },
  { key: 'paper_title', label: 'Paper title', sample: 'Digital twins for process monitoring: an empirical analysis' },
  { key: 'author_name', label: 'Author name', sample: 'Aarav Sharma' },
  { key: 'journal_name', label: 'Journal name', sample: 'International Journal of Multidisciplinary Applied Technology' },
  { key: 'journal_code', label: 'Journal code', sample: 'IJMAT' },
  { key: 'doi', label: 'DOI', sample: '10.55041/IJMAT2026000113' },
  { key: 'reviewer_name', label: 'Reviewer name', sample: 'Dr. Ananya Iyer' },
  { key: 'review_due_date', label: 'Review due date', sample: '24 Oct 2026' },
  { key: 'decision_note', label: 'Decision note', sample: 'The reviewers found the methodology sound and the results well supported.' },
  { key: 'amount', label: 'Amount payable', sample: '₹2,950.00' },
  { key: 'invoice_no', label: 'Invoice number', sample: 'INV-2026-0418' },
  { key: 'payment_link', label: 'Payment link', sample: 'https://pay.edtechpublishers.in/p/8f2a1c' },
  { key: 'certificate_link', label: 'Certificate link', sample: 'https://ijmat.example.org/certificate/IJMAT2026000113' },
  { key: 'article_url', label: 'Article URL', sample: 'https://ijmat.example.org/article/IJMAT2026000113' },
  { key: 'support_email', label: 'Support email', sample: 'support@edtechpublishers.in' },
]
export const VARIABLE_KEYS = new Set(TEMPLATE_VARIABLES.map((v) => v.key))
const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

export const sampleVars = (): Record<string, string> => Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.key, v.sample]))

/** Variable values for a real paper (anything not derivable falls back to the sample). */
export function paperVars(p: Paper): Record<string, string> {
  const j = journalByCode(p.journal)
  const base = sampleVars()
  const slug = j.domain
  return {
    ...base,
    paper_id: p.id,
    paper_title: p.title,
    author_name: p.author,
    journal_name: j.name,
    journal_code: p.journal,
    doi: doiFor(p.id),
    article_url: `https://${slug}/article/${p.id}`,
    certificate_link: `https://${slug}/certificate/${p.id}`,
    review_due_date: p.reviewDue ? formatDate(p.reviewDue) : base.review_due_date,
    amount: p.authorCountry === 'India' ? '₹2,950.00' : '$49.00',
  }
}

export const renderText = (text: string, vars: Record<string, string>) =>
  text.replace(VAR_RE, (m, k: string) => vars[k] ?? m)

export const usedVariables = (text: string): string[] => {
  const out: string[] = []
  for (const m of text.matchAll(VAR_RE)) if (!out.includes(m[1])) out.push(m[1])
  return out
}
export const unknownVariables = (text: string) => usedVariables(text).filter((k) => !VARIABLE_KEYS.has(k))

/* ------------------------------------------------------------------ */
/* Templates                                                            */
/* ------------------------------------------------------------------ */

export interface TemplateEvent { key: string; label: string; group: string; description: string; channels: Channel[] }

const ALL: Channel[] = ['email', 'sms', 'whatsapp']
export const TEMPLATE_EVENTS: TemplateEvent[] = [
  { key: 'submission_received', label: 'Submission received', group: 'Submission', description: 'Sent to the corresponding author as soon as a manuscript is submitted.', channels: ALL },
  { key: 'review_assigned', label: 'Review assigned', group: 'Review', description: 'Sent to a reviewer or panel member when a paper is assigned.', channels: ALL },
  { key: 'review_reminder', label: 'Review reminder', group: 'Review', description: 'Reminder to a reviewer whose report is approaching or past its due date.', channels: ALL },
  { key: 'decision_accepted', label: 'Decision: accepted', group: 'Decision', description: 'Acceptance notice. Always sent in the 08:45 dispatch batch.', channels: ALL },
  { key: 'decision_rejected', label: 'Decision: rejected', group: 'Decision', description: 'Rejection notice with the editor’s reason.', channels: ['email', 'sms'] },
  { key: 'decision_changes', label: 'Decision: changes requested', group: 'Decision', description: 'Asks the author to revise and resubmit.', channels: ['email', 'sms'] },
  { key: 'payment_reminder', label: 'Payment reminder', group: 'Payment', description: 'Reminder for an accepted paper whose publication charge is unpaid.', channels: ALL },
  { key: 'payment_received', label: 'Payment received', group: 'Payment', description: 'Confirms a verified payment.', channels: ALL },
  { key: 'invoice_sent', label: 'Invoice sent', group: 'Payment', description: 'Delivers the GST invoice.', channels: ALL },
  { key: 'certificate_ready', label: 'Certificate ready', group: 'Publication', description: 'Author certificate is available to download.', channels: ALL },
  { key: 'published_notice', label: 'Published notice', group: 'Publication', description: 'Article is live with its DOI.', channels: ALL },
]
export const eventByLabel = (label: string) => TEMPLATE_EVENTS.find((e) => e.label === label)

export interface MessageTemplate {
  id: string // `${event}:${channel}`
  event: string
  channel: Channel
  subject?: string
  body: string
  /** SMS: DLT registration */
  dltId?: string
  senderId?: string
  /** WhatsApp: Meta-approved template */
  metaName?: string
  metaCategory?: string
  approvedAt?: string
  updatedAt: string
  updatedBy: string
}

const SIGN = '\n\nWith regards,\nEditorial Office, {{journal_name}}\n{{support_email}}'

const EMAIL: Record<string, [string, string]> = {
  submission_received: ['We have received your submission {{paper_id}}', 'Dear {{author_name}},\n\nThank you for submitting "{{paper_title}}" to {{journal_name}}. Your manuscript has been registered with Paper ID {{paper_id}}; please quote it in all correspondence.\n\nOur editorial office will complete the initial screening shortly and you will hear from us once the paper moves to peer review.' + SIGN],
  review_assigned: ['Review invitation: {{paper_id}}', 'Dear {{reviewer_name}},\n\nYou have been assigned to review "{{paper_title}}" ({{paper_id}}) for {{journal_name}}. Your report is due by {{review_due_date}}.\n\nPlease sign in to the review workspace to read the manuscript and submit your recommendation.' + SIGN],
  review_reminder: ['Reminder: review for {{paper_id}} is due {{review_due_date}}', 'Dear {{reviewer_name}},\n\nThis is a gentle reminder that your review of "{{paper_title}}" ({{paper_id}}) is due on {{review_due_date}}. If you need more time, please reply to this email so we can adjust the schedule.\n\nThank you for your support of {{journal_name}}.' + SIGN],
  decision_accepted: ['Your paper {{paper_id}} has been accepted', 'Dear {{author_name}},\n\nWe are pleased to inform you that "{{paper_title}}" ({{paper_id}}) has been accepted for publication in {{journal_name}}.\n\n{{decision_note}}\n\nTo proceed to production, please pay the publication charge of {{amount}} using the secure link below:\n{{payment_link}}' + SIGN],
  decision_rejected: ['Decision on your submission {{paper_id}}', 'Dear {{author_name}},\n\nThank you for submitting "{{paper_title}}" ({{paper_id}}) to {{journal_name}}. After careful evaluation, we are unable to accept the manuscript for publication.\n\nEditor’s comments:\n{{decision_note}}\n\nWe appreciate your interest in the journal and encourage you to submit future work.' + SIGN],
  decision_changes: ['Revisions requested for {{paper_id}}', 'Dear {{author_name}},\n\nThe reviewers have recommended changes to "{{paper_title}}" ({{paper_id}}) before it can be considered further.\n\nSummary of requested changes:\n{{decision_note}}\n\nPlease upload a revised manuscript with a point-by-point response through your submission link.' + SIGN],
  payment_reminder: ['Payment pending for accepted paper {{paper_id}}', 'Dear {{author_name}},\n\nYour paper "{{paper_title}}" ({{paper_id}}) was accepted by {{journal_name}}, but we have not yet received the publication charge of {{amount}}.\n\nPay securely here: {{payment_link}}\nIf you have already paid by bank transfer or UPI, please upload the proof of payment so we can verify it.' + SIGN],
  payment_received: ['Payment received for {{paper_id}}', 'Dear {{author_name}},\n\nWe have verified your payment of {{amount}} for {{paper_id}}. Your paper has now moved to production and our team will share the proof for your approval shortly.\n\nYour invoice {{invoice_no}} will follow in a separate email.' + SIGN],
  invoice_sent: ['Invoice {{invoice_no}} for {{paper_id}}', 'Dear {{author_name}},\n\nPlease find attached invoice {{invoice_no}} for {{amount}} (including applicable GST) against paper {{paper_id}} published in {{journal_name}}.\n\nFor reimbursement queries, reply to this email with your institution’s requirements.' + SIGN],
  certificate_ready: ['Your author certificate for {{paper_id}} is ready', 'Dear {{author_name}},\n\nThe certificate of publication for "{{paper_title}}" is ready. You can download it here:\n{{certificate_link}}\n\nIf any author name is misspelt, please reply with the correction before the article goes live.' + SIGN],
  published_notice: ['Published: {{paper_title}}', 'Dear {{author_name}},\n\nCongratulations. "{{paper_title}}" is now published in {{journal_name}}.\n\nRead it online: {{article_url}}\nDOI: {{doi}}\n\nPlease share the link with your co-authors and institution.' + SIGN],
}

const SMS: Record<string, string> = {
  submission_received: 'Dear {{author_name}}, your paper {{paper_id}} has been received by {{journal_code}}. Quote this ID for all queries. -EdTech Publishers',
  review_assigned: 'Dear {{reviewer_name}}, paper {{paper_id}} is assigned to you for review by {{review_due_date}}. Sign in to the review workspace. -{{journal_code}}',
  review_reminder: 'Reminder: your review of {{paper_id}} is due on {{review_due_date}}. Please submit or request more time. -{{journal_code}}',
  decision_accepted: 'Congratulations {{author_name}}! Paper {{paper_id}} is accepted in {{journal_code}}. Pay {{amount}}: {{payment_link}} -EdTech Publishers',
  decision_rejected: 'Dear {{author_name}}, a decision on {{paper_id}} is available. Please check your email for the details. -{{journal_code}}',
  decision_changes: 'Dear {{author_name}}, revisions are requested for {{paper_id}}. Please check your email for details. -{{journal_code}}',
  payment_reminder: 'Dear {{author_name}}, payment of {{amount}} for accepted paper {{paper_id}} is pending. Pay: {{payment_link}} -{{journal_code}}',
  payment_received: 'Dear {{author_name}}, we received your payment of {{amount}} for {{paper_id}}. Production has started. -{{journal_code}}',
  invoice_sent: 'Dear {{author_name}}, invoice {{invoice_no}} for {{paper_id}} has been emailed to you. -{{journal_code}}',
  certificate_ready: 'Dear {{author_name}}, your certificate for {{paper_id}} is ready: {{certificate_link}} -{{journal_code}}',
  published_notice: 'Dear {{author_name}}, {{paper_id}} is now published. DOI {{doi}} -{{journal_code}}',
}

const WA: Record<string, string> = {
  submission_received: 'Hello {{author_name}}, we have received your manuscript *{{paper_id}}* for {{journal_name}}. Please keep this ID handy; reply here if you need any help.',
  review_assigned: 'Hello {{reviewer_name}}, paper *{{paper_id}}* has been assigned to you for review. The report is due on {{review_due_date}}.',
  review_reminder: 'Hello {{reviewer_name}}, a friendly reminder that your review of *{{paper_id}}* is due on {{review_due_date}}. Reply if you need more time.',
  decision_accepted: 'Congratulations {{author_name}}! *{{paper_id}}* has been accepted in {{journal_name}}. Please pay {{amount}} to begin production: {{payment_link}}',
  payment_reminder: 'Hello {{author_name}}, the publication charge of {{amount}} for accepted paper *{{paper_id}}* is still pending. Pay here: {{payment_link}}',
  payment_received: 'Hello {{author_name}}, your payment of {{amount}} for *{{paper_id}}* is verified. Your paper is now in production.',
  invoice_sent: 'Hello {{author_name}}, invoice *{{invoice_no}}* for {{paper_id}} has been sent to your email. Reply here for a copy.',
  certificate_ready: 'Hello {{author_name}}, your certificate for *{{paper_id}}* is ready to download: {{certificate_link}}',
  published_notice: 'Congratulations {{author_name}}! *{{paper_id}}* is now live. Read it here: {{article_url}} (DOI {{doi}})',
}

export function buildTemplates(): MessageTemplate[] {
  const out: MessageTemplate[] = []
  TEMPLATE_EVENTS.forEach((e, i) => {
    if (e.channels.includes('email')) {
      const [subject, body] = EMAIL[e.key]
      out.push({ id: `${e.key}:email`, event: e.key, channel: 'email', subject, body, updatedAt: ago(24 * (9 + i)), updatedBy: 'Priya Menon' })
    }
    if (e.channels.includes('sms')) {
      out.push({ id: `${e.key}:sms`, event: e.key, channel: 'sms', body: SMS[e.key], dltId: `1107${(170012340000 + i * 3719).toString()}`, senderId: 'EDTPUB', approvedAt: ago(24 * 140), updatedAt: ago(24 * 140), updatedBy: 'DLT registry' })
    }
    if (e.channels.includes('whatsapp')) {
      out.push({ id: `${e.key}:whatsapp`, event: e.key, channel: 'whatsapp', body: WA[e.key], metaName: `${e.key}_v2`, metaCategory: 'Utility', approvedAt: ago(24 * 96), updatedAt: ago(24 * 96), updatedBy: 'Meta Business' })
    }
  })
  return out
}

/* ------------------------------------------------------------------ */
/* Schedule, reminders, pause switches                                  */
/* ------------------------------------------------------------------ */

export interface TimeSlot { id: string; time: string; label: string; enabled: boolean; locked?: boolean; events: string[] }

export const buildTimeSlots = (): TimeSlot[] => [
  { id: 'slot-default', time: '08:45', label: 'Daily decision dispatch', enabled: true, locked: true, events: ['decision_accepted', 'decision_rejected', 'decision_changes'] },
  { id: 'slot-pm', time: '17:30', label: 'Evening reminders', enabled: true, events: ['review_reminder', 'payment_reminder'] },
]

export interface ReminderStep { id: string; afterDays: number; channels: Channel[] }
export interface ReminderSequence { id: string; name: string; trigger: string; templateEvent: string; enabled: boolean; steps: ReminderStep[]; stopOn: string }

export const buildReminders = (): ReminderSequence[] => [
  { id: 'seq-review', name: 'Review reminder', trigger: 'Days after a reviewer accepts the assignment', templateEvent: 'review_reminder', enabled: true, stopOn: 'Stops when the review report is submitted.',
    steps: [{ id: 's1', afterDays: 3, channels: ['email'] }, { id: 's2', afterDays: 7, channels: ['email', 'whatsapp'] }, { id: 's3', afterDays: 10, channels: ['email', 'sms', 'whatsapp'] }] },
  { id: 'seq-payment', name: 'Payment reminder', trigger: 'Days after acceptance with no payment', templateEvent: 'payment_reminder', enabled: true, stopOn: 'Stops when a payment or proof is verified.',
    steps: [{ id: 'p1', afterDays: 2, channels: ['email'] }, { id: 'p2', afterDays: 5, channels: ['email', 'whatsapp'] }, { id: 'p3', afterDays: 10, channels: ['email', 'sms'] }] },
  { id: 'seq-revision', name: 'Revision reminder', trigger: 'Days after changes were requested', templateEvent: 'decision_changes', enabled: false, stopOn: 'Stops when the author uploads a revised manuscript.',
    steps: [{ id: 'r1', afterDays: 7, channels: ['email'] }, { id: 'r2', afterDays: 14, channels: ['email', 'sms'] }] },
]

export const buildChannelPause = (): Record<Channel, boolean> => ({ email: false, sms: false, whatsapp: false })

/* ------------------------------------------------------------------ */
/* Dispatch queue                                                       */
/* ------------------------------------------------------------------ */

export interface DispatchNotice {
  id: string
  journal: JournalCode
  paperId: string
  recipient: string
  template: string
  channel: Channel
  batchAt: string
}
export interface DispatchedBatch { id: string; batchAt: string; sentAt: string; count: number; by: string }

export function batchTime(dayOffset: number): Date {
  const d = nextDispatch()
  d.setDate(d.getDate() + dayOffset)
  return d
}

/** A few non-acceptance notices waiting for the 08:45 batches (reminders, invoices, certificates). */
export function buildNotices(papers: Paper[]): DispatchNotice[] {
  const spec: [string, Channel, number, (p: Paper) => boolean][] = [
    ['Payment reminder', 'email', 0, (p) => p.status === 'payment_pending'],
    ['Payment reminder', 'whatsapp', 0, (p) => p.status === 'payment_pending'],
    ['Review reminder', 'email', 0, (p) => p.status === 'under_review'],
    ['Invoice sent', 'email', 1, (p) => p.status === 'paid'],
    ['Certificate ready', 'email', 1, (p) => p.status === 'ready_for_approval'],
    ['Decision: changes requested', 'email', 1, (p) => p.status === 'changes_requested'],
    ['Review reminder', 'sms', 1, (p) => p.status === 'under_review'],
    ['Published notice', 'email', 2, (p) => p.status === 'published'],
    ['Payment reminder', 'sms', 2, (p) => p.status === 'payment_pending'],
  ]
  const used = new Set<string>()
  const out: DispatchNotice[] = []
  spec.forEach(([template, channel, day, match], i) => {
    const p = papers.find((x) => match(x) && !used.has(x.id))
    if (!p) return
    used.add(p.id)
    out.push({
      id: `dn-${i + 1}`, journal: p.journal, paperId: p.id, template, channel,
      recipient: channel === 'email' ? p.authorEmail : `+91 98${(76100000 + i * 7919).toString().slice(0, 8)}`,
      batchAt: batchTime(day).toISOString(),
    })
  })
  return out
}

export const buildDispatched = (): DispatchedBatch[] => {
  const prev = nextDispatch()
  prev.setDate(prev.getDate() - 1)
  const sent = new Date(prev.getTime() + 41_000)
  return [{ id: 'db-prev', batchAt: prev.toISOString(), sentAt: sent.toISOString(), count: 9, by: 'Scheduler' }]
}

/* ------------------------------------------------------------------ */
/* WhatsApp threads                                                     */
/* ------------------------------------------------------------------ */

export interface ChatMessage { id: string; direction: 'in' | 'out'; text: string; at: string; by?: string; template?: boolean }
export interface ChatMeta { assigneeId?: string; resolved: boolean; ticketId?: string }

const THREADS: Record<string, [('in' | 'out'), string, number][]> = {
  'chat-1': [['in', 'Good morning, I submitted my paper two weeks back.', 3.4], ['out', 'Good morning. Could you share the Paper ID so we can check the status?', 3.2], ['in', 'Hello, has my paper been reviewed yet?', 0.2]],
  'chat-2': [['out', 'Congratulations, your paper is accepted. The payment link is in your email.', 8], ['in', 'I could not find the email. Please share the payment link again.', 5], ['in', 'Please share the payment link again.', 2.6]],
  'chat-3': [['out', 'Please upload the payment proof once the transfer is done.', 12], ['in', 'I have paid via UPI today.', 6], ['in', 'I have uploaded the UPI screenshot.', 4.9]],
  'chat-4': [['out', 'Your certificate is being generated and will be shared soon.', 20], ['in', 'Can you send the certificate again?', 7.3]],
  'chat-5': [['in', 'Is the invoice ready?', 12], ['out', 'Yes, we have emailed invoice INV-2026-0418 to you.', 11], ['in', 'Thank you, received.', 9.7]],
  'chat-6': [['in', 'My co-author name is misspelt on the certificate.', 31], ['out', 'Sorry about that. Could you send the correct spelling?', 30], ['in', 'My co-author name is misspelt.', 29]],
  'chat-7': [['out', 'The next issue closes for submissions on 30 November.', 52], ['in', 'What is the next issue deadline?', 50]],
  'chat-8': [['in', 'Need invoice with GST number.', 76], ['out', 'We have shared the GST invoice by email.', 75]],
}

export function buildThreads(): Record<string, ChatMessage[]> {
  return Object.fromEntries(
    Object.entries(THREADS).map(([id, items]) => [
      id,
      items.map(([direction, text, h], i) => ({ id: `${id}-m${i}`, direction, text, at: ago(h), by: direction === 'out' ? 'Isha Desai' : undefined })),
    ]),
  )
}
export const buildChatMeta = (chatIds: string[]): Record<string, ChatMeta> =>
  Object.fromEntries(chatIds.map((id, i) => [id, { assigneeId: i % 3 === 0 ? 'u-support' : undefined, resolved: i >= 6 }]))

export const WHATSAPP_QUICK_REPLIES = [
  { label: 'Ask for Paper ID', text: 'Thanks for reaching out. Could you please share your Paper ID so we can look into this?' },
  { label: 'Review time', text: 'Peer review usually takes 3 to 4 weeks. We will notify you by email as soon as a decision is made.' },
  { label: 'Payment link', text: 'You can pay securely using the link in your acceptance email. If you cannot find it, we will resend it right away.' },
  { label: 'Proof received', text: 'We have received your payment proof and our finance team will verify it within one working day.' },
  { label: 'Escalated', text: 'Thank you for your patience. We have escalated this to the editorial team and will get back to you shortly.' },
]

/* ------------------------------------------------------------------ */
/* Helpdesk                                                             */
/* ------------------------------------------------------------------ */

export type TicketSource = 'Portal form' | 'Enquiry form' | 'Website form' | 'Email' | 'WhatsApp' | 'Chat' | 'Phone'
/** Sources offered in filters; the older form labels are shown as 'Website form'. */
export const TICKET_SOURCES = ['WhatsApp', 'Email', 'Chat', 'Website form', 'Phone'] as const
export const sourceLabel = (s: TicketSource): string => (s === 'Portal form' || s === 'Enquiry form' ? 'Website form' : s)
export interface TicketMessage { id: string; from: 'requester' | 'agent'; author: string; text: string; at: string }
export interface TicketNote { id: string; author: string; text: string; at: string }
export interface TicketDetail {
  requesterEmail: string
  source: TicketSource
  category: string
  paperId?: string
  messages: TicketMessage[]
  notes: TicketNote[]
  firstResponseAt?: string
}

export const SLA_HOURS = { urgent: 2, high: 8, normal: 24, low: 48 } as const

const BODIES: Record<string, string> = {
  'Invoice copy needed for institutional reimbursement': 'My university finance office needs a copy of the invoice with our institution name and GST number to reimburse the publication charge. Could you please send it?',
  'Certificate shows wrong spelling of co-author name': 'The certificate lists my co-author as "Mera Nair" but the correct spelling is "Meera Nair". Please issue a corrected certificate.',
  'Unable to upload revised manuscript': 'I keep getting an error when uploading the revised manuscript (DOCX, 2.3 MB). The progress bar reaches 100% and then fails.',
  'Payment deducted but status still pending': 'The amount was debited from my account yesterday evening but the portal still shows the payment as pending. UTR is attached in the proof.',
  'Request for DOI link for published paper': 'My paper was published last week. Could you please share the DOI link so I can add it to my CV and institutional repository?',
  'How long does the review take?': 'I submitted about ten days ago. What is the usual review duration and is there a way to expedite it for a conference deadline?',
  'Change of corresponding author email': 'I am leaving my current institution. Please update the corresponding author email to my personal address for all future correspondence.',
  'Plagiarism report requested by university': 'My university requires a plagiarism similarity report for the submitted manuscript before it releases the funding. Can you provide one?',
  'Request to withdraw submission': 'Due to a change in our research plan we would like to withdraw the manuscript. Please confirm the process and whether any charges apply.',
  'Indexing status of my published paper': 'My paper was published two months ago but I cannot find it on Google Scholar yet. When will it be indexed?',
  'Need acceptance letter on letterhead': 'Our promotion committee needs a formal acceptance letter on the journal letterhead. Please share a signed PDF.',
  'GST number missing on invoice': 'The invoice you sent does not show our GST number although I entered it during payment. Please reissue the invoice.',
  'Proof of UPI payment uploaded twice': 'By mistake I uploaded the UPI proof twice, and now the portal shows two entries. Please make sure I am not charged twice.',
  'Special issue deadline extension query': 'Is it possible to get a one-week extension for the special issue deadline? Our dataset collection ended later than planned.',
}
const REPLIES = [
  'Thank you for contacting us. We have looked into this and will share an update within one working day.',
  'We have raised this with the concerned team. Could you confirm the Paper ID and the email you used while submitting?',
  'This is now fixed from our side. Please try again and let us know if you still face the problem.',
]
const CATEGORIES = ['Billing', 'Certificates', 'Submission', 'Billing', 'Publication', 'Review process', 'Account', 'Ethics', 'Submission', 'Indexing', 'Publication', 'Billing', 'Billing', 'Special issues']
const SOURCES: TicketSource[] = ['Website form', 'Enquiry form', 'Email', 'WhatsApp', 'Chat', 'Portal form', 'Email', 'Phone']

interface TicketLike { id: string; journal: JournalCode; subject: string; requester: string; status: string; createdAt: string }

export function buildTicketDetails(tickets: TicketLike[], papers: Paper[]): Record<string, TicketDetail> {
  const out: Record<string, TicketDetail> = {}
  tickets.forEach((t, n) => {
    const paper = papers.find((p, i) => p.journal === t.journal && i % 4 === n % 4 && p.status !== 'submitted')
    const created = new Date(t.createdAt)
    const at = (m: number) => new Date(created.getTime() + m * 60_000).toISOString()
    const messages: TicketMessage[] = [{ id: `${t.id}-1`, from: 'requester', author: t.requester, text: BODIES[t.subject] ?? t.subject, at: t.createdAt }]
    const notes: TicketNote[] = []
    let firstResponseAt: string | undefined
    if (t.status !== 'open' || n % 3 === 0) {
      messages.push({ id: `${t.id}-2`, from: 'agent', author: 'Isha Desai', text: REPLIES[n % REPLIES.length], at: at(95) })
      firstResponseAt = at(95)
    }
    if (t.status === 'resolved') messages.push({ id: `${t.id}-3`, from: 'requester', author: t.requester, text: 'Thank you, this is sorted now.', at: at(240) })
    if (n % 4 === 1) notes.push({ id: `${t.id}-n1`, author: 'Isha Desai', text: 'Checked with accounts: payment is visible in the bank statement, awaiting reconciliation.', at: at(120) })
    out[t.id] = {
      requesterEmail: `${t.requester.toLowerCase().replace(/[^a-z]+/g, '.')}@mail.example`,
      source: SOURCES[n % SOURCES.length],
      category: CATEGORIES[n % CATEGORIES.length],
      paperId: paper?.id,
      messages, notes, firstResponseAt,
    }
  })
  return out
}

export const CANNED_REPLIES = [
  { label: 'Acknowledge', text: 'Thank you for reaching out to the editorial office. We have noted your request and will update you within one working day.' },
  { label: 'Need Paper ID', text: 'Could you please share the Paper ID (for example IJMAT2026000113) and the email address used for the submission so that we can locate your record?' },
  { label: 'Invoice resent', text: 'We have re-sent the invoice to your registered email address. Please check your spam folder if you do not see it within a few minutes.' },
  { label: 'Certificate corrected', text: 'The certificate has been corrected and re-issued. You can download the updated copy from the link in your email.' },
  { label: 'Payment verification', text: 'Your payment proof is with our finance team. Offline payments are verified within one working day, and you will receive a confirmation by email.' },
  { label: 'Closing', text: 'We are glad this is resolved. We will close this ticket now; reply to this thread at any time if you need further help.' },
]

/* ------------------------------------------------------------------ */
/* Chatbot                                                              */
/* ------------------------------------------------------------------ */

export type BotAction = { type: 'none' } | { type: 'faq'; faqId: string } | { type: 'ticket' } | { type: 'agent' }
export interface BotNode { id: string; label: string; reply: string; action: BotAction; children: BotNode[] }
export interface Faq { id: string; question: string; answer: string; category: string; published: boolean; updatedAt: string }

export const FAQ_CATEGORIES = ['Submission', 'Review', 'Payment', 'Publication', 'Certificates', 'Policies']

export const buildFaqs = (): Faq[] => [
  { id: 'faq-1', question: 'How long does peer review take?', answer: 'Most manuscripts receive a first decision within 3 to 4 weeks of passing initial screening. You will be notified by email, SMS and WhatsApp.', category: 'Review', published: true, updatedAt: ago(24 * 12) },
  { id: 'faq-2', question: 'What is the publication charge?', answer: 'The charge is ₹2,500 plus 18% GST for authors in India and USD 49 for international authors. It is payable only after your paper is accepted.', category: 'Payment', published: true, updatedAt: ago(24 * 20) },
  { id: 'faq-3', question: 'How can I pay by bank transfer or UPI?', answer: 'Use the payment link in your acceptance email. For offline payments, upload a clear screenshot or receipt with the UTR; our team verifies it within one working day.', category: 'Payment', published: true, updatedAt: ago(24 * 20) },
  { id: 'faq-4', question: 'When will I get my certificate?', answer: 'Certificates are generated once payment is verified and are shared with the proof for approval. You will receive a download link when it is ready.', category: 'Certificates', published: true, updatedAt: ago(24 * 8) },
  { id: 'faq-5', question: 'How do I get the DOI of my paper?', answer: 'The DOI follows the pattern 10.55041/<Paper ID> and is activated when the article is published. It appears in the published notice email.', category: 'Publication', published: true, updatedAt: ago(24 * 15) },
  { id: 'faq-6', question: 'Can I withdraw my submission?', answer: 'Yes, before acceptance you may withdraw at no cost by writing to the editorial office with your Paper ID. After acceptance, charges may apply.', category: 'Policies', published: true, updatedAt: ago(24 * 30) },
  { id: 'faq-7', question: 'Is my paper checked for similarity?', answer: 'Every submission goes through the journal’s editorial screening. The editorial office does not share internal reports; contact support for policy details.', category: 'Policies', published: false, updatedAt: ago(24 * 4) },
  { id: 'faq-8', question: 'How do I upload a revised manuscript?', answer: 'Open the link in the revision request email, choose Upload revision and attach a clean file and a point-by-point response document.', category: 'Submission', published: true, updatedAt: ago(24 * 6) },
]

const n = (id: string, label: string, reply: string, action: BotAction = { type: 'none' }, children: BotNode[] = []): BotNode => ({ id, label, reply, action, children })

export const buildBotTree = (): BotNode[] => [
  n('b-sub', 'Submit a paper', 'Choose what you need help with for submissions.', { type: 'none' }, [
    n('b-sub-how', 'How to submit', 'Visit your journal website, choose Submit Manuscript and upload your file in DOCX format along with author details.'),
    n('b-sub-rev', 'Upload a revision', 'Open the link in your revision email and select Upload revision.', { type: 'faq', faqId: 'faq-8' }),
    n('b-sub-wd', 'Withdraw a submission', 'You can withdraw before acceptance at no cost.', { type: 'faq', faqId: 'faq-6' }),
  ]),
  n('b-status', 'Track my paper', 'Please share your Paper ID (for example IJMAT2026000113) and we will check the status. Review typically takes 3 to 4 weeks.', { type: 'faq', faqId: 'faq-1' }),
  n('b-pay', 'Payment & invoice', 'What would you like to know about payment?', { type: 'none' }, [
    n('b-pay-fee', 'Publication charge', 'Here is how the publication charge works.', { type: 'faq', faqId: 'faq-2' }),
    n('b-pay-offline', 'Pay by UPI / bank transfer', 'Here is how offline payment works.', { type: 'faq', faqId: 'faq-3' }),
    n('b-pay-inv', 'I need a GST invoice', 'We will raise a ticket so our accounts team can share a corrected invoice.', { type: 'ticket' }),
  ]),
  n('b-cert', 'Certificates & DOI', 'Pick a topic.', { type: 'none' }, [
    n('b-cert-c', 'When is my certificate ready?', 'Certificate timelines:', { type: 'faq', faqId: 'faq-4' }),
    n('b-cert-d', 'Find my DOI', 'About DOIs:', { type: 'faq', faqId: 'faq-5' }),
  ]),
  n('b-agent', 'Talk to a person', 'I am connecting you to our support team on WhatsApp. They usually reply within a few hours on working days.', { type: 'agent' }),
]

