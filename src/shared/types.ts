export type JournalCode = 'IJMAT' | 'JIMRT' | 'IJCSD' | 'IJECM' | 'IJFRD'
export type JournalScope = JournalCode | 'ALL'

export interface Journal {
  code: JournalCode
  slot: string // J1..J5
  name: string
  domain: string
  issn: string
}

export type Role = 'super_admin' | 'editor' | 'associate_editor' | 'reviewer' | 'panel_member' | 'support'

export type UserStatus = 'active' | 'invited' | 'suspended' | 'deactivated'

export interface StaffUser {
  id: string
  name: string
  email: string
  title: string
  status: UserStatus
  twoStep: boolean
  /** Role per journal. One person can hold different roles in different journals. */
  assignments: Partial<Record<JournalCode, Role>>
}

export type PaperStatus =
  | 'submitted'
  | 'screening'
  | 'under_review'
  | 'decision_pending'
  | 'changes_requested'
  | 'accepted'
  | 'payment_pending'
  | 'paid'
  | 'in_production'
  | 'returned_to_production'
  | 'ready_for_approval'
  | 'published'
  | 'indexed'
  | 'rejected'
  | 'withdrawn'
  | 'retracted'
  | 'corrected'

export type PaymentStatus = 'none' | 'pending' | 'verification' | 'verified' | 'rejected' | 'refunded'

export interface Paper {
  id: string // Paper ID e.g. IJMAT2026000123
  journal: JournalCode
  title: string
  author: string
  authorEmail: string
  authorCountry: string
  articleType: string
  status: PaperStatus
  submittedAt: string // ISO
  updatedAt: string
  paymentStatus: PaymentStatus
  assigneeId?: string // associate editor responsible for production
  reviewerId?: string
  reviewDue?: string
  productionDue?: string
  dispatchAt?: string // queued for 08:45
}

export interface Ticket {
  id: string
  journal: JournalCode
  subject: string
  requester: string
  status: 'open' | 'pending' | 'resolved'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  assigneeId?: string
  createdAt: string
  dueAt: string
}

export interface WhatsAppChat {
  id: string
  journal: JournalCode
  contact: string
  paperId?: string
  lastMessage: string
  lastAt: string
  unread: number
}

export type Channel = 'email' | 'sms' | 'whatsapp'
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'failed'

export interface MessageLogEntry {
  id: string
  journal: JournalCode
  paperId?: string
  recipient: string
  channel: Channel
  template: string
  at: string
  status: MessageStatus
  failureReason?: string
}

export interface ActivityEntry {
  id: string
  journal: JournalCode
  at: string
  actor: string
  text: string
  paperId?: string
}

/* ---------- Cross-domain records (shared by several areas) ---------- */

export type PaymentMethod = 'razorpay' | 'card' | 'upi' | 'bank_transfer' | 'other'
export type PaymentRecordStatus = 'verified_auto' | 'awaiting_proof' | 'pending_verification' | 'verified' | 'rejected' | 'refunded'

export interface Payment {
  id: string
  paperId: string
  journal: JournalCode
  payer: string
  method: PaymentMethod
  currency: 'INR' | 'USD'
  base: number
  cgst: number
  sgst: number
  igst: number
  total: number
  status: PaymentRecordStatus
  reference: string
  createdAt: string
  proofLabel?: string // offline proof image caption
  rejectReason?: string
  invoiceNo?: string
  refundedAt?: string
}

export type IssueStatus = 'draft' | 'open' | 'in_production' | 'published'

export interface Issue {
  id: string
  journal: JournalCode
  volume: number
  number: number
  label: string // e.g. "Volume 3, Issue 2 · October 2026"
  month: string // ISO date of issue month (first day)
  submissionDeadline: string
  publicationDate: string
  status: IssueStatus
  callForPapers: string
  articleIds: string[] // ordered Paper IDs
  pages: Record<string, string> // paperId -> "12–19"
  conferenceId?: string
  actualOnlineDate?: string
}

export interface PaperEvent {
  id: string
  paperId: string
  at: string
  actor: string
  text: string
  /** reason / note attached to the event, if any */
  note?: string
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  journal: JournalCode | 'ALL'
  action: string
  target: string
  oldValue?: string
  newValue?: string
}

export interface DispatchItem {
  id: string
  paperId: string
  journal: JournalCode
  recipient: string
  template: string
  channel: Channel
  batchAt: string
}

export interface Author {
  name: string
  email: string
  affiliation: string
  country: string
  orcid?: string
  corresponding?: boolean
}

export type DepositStatus = 'pending' | 'success' | 'failed' | 're_deposited'

export interface DoiDeposit {
  id: string
  paperId: string
  journal: JournalCode
  doi: string
  status: DepositStatus
  version: number
  at: string
  error?: string
}
