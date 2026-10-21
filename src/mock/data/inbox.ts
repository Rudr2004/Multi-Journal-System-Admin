import type { JournalCode, Paper } from '@/shared/types'
import { NOW } from './papers'
import { WHATSAPP_QUICK_REPLIES, type ChatMessage, type ChatMeta } from './communication'

const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

export const QUICK_REPLIES = WHATSAPP_QUICK_REPLIES

/* ------------------------------------------------------------------ */
/* Email and website chat conversations (Communication Inbox)          */
/* ------------------------------------------------------------------ */

export interface InboxConvo {
  id: string
  channel: 'email' | 'chat'
  journal: JournalCode
  contact: string
  name: string
  paperId?: string
  subject?: string
  unread: number
  thread: ChatMessage[]
}

interface ConvoSpec { channel: 'email' | 'chat'; match: (p: Paper) => boolean; subject?: string; msgs: ['in' | 'out', string, number][]; unread: number; resolved?: boolean }

const CONVO_SPECS: ConvoSpec[] = [
  { channel: 'email', match: (p) => p.status === 'paid', subject: 'GST number missing on the invoice', unread: 1, msgs: [['in', 'Dear team, the invoice you sent for my paper does not show our institution GST number although I entered it while paying. Please reissue the invoice so that our accounts office can reimburse the charge.', 5]] },
  { channel: 'email', match: (p) => p.status === 'payment_pending', subject: 'Payment link expired', unread: 1, msgs: [['out', 'Congratulations on the acceptance of your paper. The payment link is in your acceptance email.', 52], ['in', 'The payment link in the email says it has expired. Could you send a fresh link? I would like to pay today.', 7]] },
  { channel: 'email', match: (p) => p.status === 'published', subject: 'DOI not resolving', unread: 0, msgs: [['in', 'My article was published last week but the DOI link shows "not found". Can you check whether it has been registered?', 30], ['out', 'Thank you for flagging this. DOI registration can take up to 48 hours after publication; we will confirm once it resolves.', 28]] },
  { channel: 'email', match: (p) => p.status === 'changes_requested', subject: 'Extension for the revision', unread: 2, msgs: [['in', 'The reviewers asked for additional experiments. Could we get one more week to submit the revised manuscript?', 9], ['in', 'Following up on my earlier email, an extension of a week would be very helpful.', 2]] },
  { channel: 'email', match: (p) => p.status === 'ready_for_approval', subject: 'Certificate spelling correction', unread: 0, msgs: [['in', 'My co-author name is written "Mera Nair" on the draft certificate. The correct spelling is "Meera Nair".', 60], ['out', 'Thanks, we have noted the correction and will reissue the certificate with the corrected name.', 58]], resolved: true },
  { channel: 'email', match: (p) => p.status === 'under_review', subject: 'Request for review status', unread: 1, msgs: [['in', 'It has been three weeks since my submission. Could you share the review status? I have a conference deadline next month.', 3]] },
  { channel: 'chat', match: (p) => p.status === 'under_review', unread: 2, msgs: [['in', 'Hi, how long does the review take?', 0.6], ['in', 'My paper is already three weeks in.', 0.5]] },
  { channel: 'chat', match: (p) => p.status === 'payment_pending', unread: 1, msgs: [['in', 'Can I pay the publication charge by bank transfer?', 1.4]] },
  { channel: 'chat', match: (p) => p.status === 'published', unread: 0, msgs: [['in', 'Where can I find the certificate for my published paper?', 20], ['out', 'You can download it from the link in the "Certificate ready" email. I can resend it if you wish.', 19.8], ['in', 'Please resend, thanks.', 19.5]], resolved: true },
  { channel: 'chat', match: (p) => p.status === 'accepted' || p.status === 'paid', unread: 1, msgs: [['in', 'Is it possible to change the order of authors after acceptance?', 4]] },
  { channel: 'chat', match: (p) => p.status !== 'submitted', unread: 0, msgs: [['in', 'Do you provide an acceptance letter on letterhead?', 40], ['out', 'Yes, we can issue one. Please share your Paper ID and the name to appear on the letter.', 39]] },
]

/** Seeded from real papers so every conversation points at a Paper ID. */
export function buildInboxConvos(papers: Paper[]): { convos: InboxConvo[]; meta: Record<string, ChatMeta> } {
  const used = new Set<string>()
  const convos: InboxConvo[] = []
  const meta: Record<string, ChatMeta> = {}
  let em = 0
  let wc = 0
  const inScope = (p: Paper) => p.journal === 'IJMAT' || p.journal === 'JIMRT'
  CONVO_SPECS.forEach((spec) => {
    const p = papers.find((x) => inScope(x) && spec.match(x) && !used.has(x.id)) ?? papers.find((x) => inScope(x) && !used.has(x.id))
    if (!p) return
    used.add(p.id)
    const n = spec.channel === 'email' ? ++em : ++wc
    const id = spec.channel === 'email' ? `em-${n}` : `wc-${n}`
    convos.push({
      id, channel: spec.channel, journal: p.journal, name: p.author, paperId: p.id,
      contact: p.authorEmail, subject: spec.subject, unread: spec.unread,
      thread: spec.msgs.map(([direction, text, h], i) => ({ id: `${id}-m${i}`, direction, text, at: ago(h), by: direction === 'out' ? 'Isha Desai' : undefined })),
    })
    meta[id] = { resolved: !!spec.resolved, assigneeId: n % 2 === 0 ? 'u-support' : undefined }
  })
  return { convos, meta }
}

/* ------------------------------------------------------------------ */
/* Staff alerts (in-app) by role                                        */
/* ------------------------------------------------------------------ */

export type AlertRole = 'SUPER_ADMIN' | 'EDITOR' | 'ASSOCIATE_EDITOR' | 'REVIEWER' | 'REVIEW_PANEL_MEMBER' | 'SUPPORT_EXECUTIVE'
export interface StaffAlertType { key: string; label: string; description: string; roles: AlertRole[] }

export const ALERT_ROLES: AlertRole[] = ['SUPER_ADMIN', 'EDITOR', 'ASSOCIATE_EDITOR', 'REVIEWER', 'REVIEW_PANEL_MEMBER', 'SUPPORT_EXECUTIVE']

export const STAFF_ALERT_TYPES: StaffAlertType[] = [
  { key: 'new_submission', label: 'New submission', description: 'A manuscript arrives and is ready for screening.', roles: ['SUPER_ADMIN', 'EDITOR'] },
  { key: 'decision_due', label: 'Decision due', description: 'Reviews are complete and a decision is waiting.', roles: ['SUPER_ADMIN', 'EDITOR'] },
  { key: 'payment_verify', label: 'Payment to verify', description: 'An offline payment needs verification.', roles: ['SUPER_ADMIN', 'EDITOR'] },
  { key: 'offline_proof', label: 'Offline proof uploaded', description: 'An author uploaded a bank or UPI proof.', roles: ['SUPER_ADMIN', 'EDITOR'] },
  { key: 'production_returned', label: 'Production returned', description: 'A paper was returned to production.', roles: ['SUPER_ADMIN', 'EDITOR', 'ASSOCIATE_EDITOR'] },
  { key: 'review_due', label: 'Review due', description: 'A review report is due soon or overdue.', roles: ['SUPER_ADMIN', 'EDITOR', 'REVIEWER', 'REVIEW_PANEL_MEMBER'] },
  { key: 'correction_request', label: 'Correction request', description: 'A post-publication correction was raised.', roles: ['SUPER_ADMIN', 'EDITOR', 'ASSOCIATE_EDITOR', 'SUPPORT_EXECUTIVE'] },
  { key: 'ticket_assigned', label: 'Ticket assigned', description: 'A support ticket was assigned to the person.', roles: ['SUPER_ADMIN', 'SUPPORT_EXECUTIVE'] },
  { key: 'whatsapp_message', label: 'WhatsApp message', description: 'A new inbound message in the Communication Inbox.', roles: ['SUPER_ADMIN', 'SUPPORT_EXECUTIVE'] },
  { key: 'failed_message', label: 'Failed message', description: 'An email, SMS or WhatsApp message failed to deliver.', roles: ['SUPER_ADMIN', 'SUPPORT_EXECUTIVE'] },
]

export type StaffAlertPrefs = Record<string, Partial<Record<AlertRole, boolean>>>
const OFF_BY_DEFAULT = ['whatsapp_message', 'ticket_assigned', 'review_due']
export const buildStaffAlerts = (): StaffAlertPrefs =>
  Object.fromEntries(STAFF_ALERT_TYPES.map((a) => [a.key, Object.fromEntries(a.roles.map((r) => [r, !(r === 'SUPER_ADMIN' && OFF_BY_DEFAULT.includes(a.key))]))]))
