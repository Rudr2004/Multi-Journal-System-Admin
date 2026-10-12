import type { JournalCode, Paper, Payment, PaymentMethod, StaffUser } from '@/shared/types'
import { creditNoteNo, nextInvoiceNo } from '../data/financeExtra'
import { currentActor, logEvent, productionAssigneeFor, recordAudit, sendMessage, updatePaper } from '../actions'
import { useDataStore } from '../store'
import { toCreditNote, useFinanceStore } from '../stores/finance'
import { ApiError, delay } from './latency'

export interface PaymentRow extends Payment { paper?: Paper }

export const isOffline = (m: PaymentMethod) => m === 'upi' || m === 'bank_transfer' || m === 'other'

export function listPayments(journals: JournalCode[]) {
  const { payments, papers } = useDataStore.getState()
  return delay(
    payments.filter((p) => journals.includes(p.journal)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p): PaymentRow => ({ ...p, paper: papers.find((x) => x.id === p.paperId) })),
  )
}

export function getPayment(id: string) {
  const { payments, papers } = useDataStore.getState()
  const p = payments.find((x) => x.id === id)
  if (!p) throw new ApiError('Payment not found', 'not_found')
  return delay<PaymentRow>({ ...p, paper: papers.find((x) => x.id === p.paperId) }, 150, 350)
}

const savePayment = (id: string, patch: Partial<Payment>) => {
  const { payments, patch: set } = useDataStore.getState()
  set({ payments: payments.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
}

const find = (id: string) => {
  const p = useDataStore.getState().payments.find((x) => x.id === id)
  if (!p) throw new ApiError('Payment not found', 'not_found')
  return p
}

/** Users who could take the production work for this journal: the journal's Associate Editor first, then anyone holding that role anywhere. */
export function eligibleAssociateEditors(journal: JournalCode): StaffUser[] {
  const { users } = useDataStore.getState()
  const active = users.filter((u) => u.status === 'active' && Object.values(u.assignments).includes('associate_editor'))
  return [...active.filter((u) => u.assignments[journal] === 'associate_editor'), ...active.filter((u) => u.assignments[journal] !== 'associate_editor')]
}

export interface VerifyResult {
  invoiceNo: string
  paperId: string
  journal: JournalCode
  authorEmail: string
  assigneeId?: string
  assigneeName?: string
  paperStatus: Paper['status']
}

/** VERIFY an offline proof: invoice, paper → Paid, production assignment, author email, timeline and audit. */
export async function verifyPayment(id: string): Promise<VerifyResult> {
  const pay = find(id)
  if (pay.status !== 'pending_verification') throw new ApiError('Only payments pending verification can be verified.', 'invalid')
  const invoiceNo = nextInvoiceNo(useDataStore.getState().payments, pay.journal)
  savePayment(id, { status: 'verified', invoiceNo, rejectReason: undefined })
  const paper = useDataStore.getState().papers.find((p) => p.id === pay.paperId)
  const assigneeId = productionAssigneeFor(pay.journal)
  const advance = paper && ['accepted', 'payment_pending'].includes(paper.status)
  if (paper) {
    updatePaper(paper.id, {
      paymentStatus: 'verified',
      ...(advance ? { status: 'paid' as const, productionDue: new Date(Date.now() + 5 * 86_400_000).toISOString() } : {}),
      ...(assigneeId ? { assigneeId } : {}),
    }, { event: `Payment ${pay.reference} verified · invoice ${invoiceNo} issued`, audit: 'Payment verified' })
    if (assigneeId) logEvent(paper.id, `Assigned to ${nameOf(assigneeId)} (Associate Editor) for production`)
  }
  sendMessage({ journal: pay.journal, paperId: pay.paperId, recipient: paper?.authorEmail ?? pay.payer, channel: 'email', template: `Payment received — invoice ${invoiceNo}` })
  recordAudit({ journal: pay.journal, action: 'Offline payment verified', target: pay.id, oldValue: 'pending_verification', newValue: `verified · ${invoiceNo}` })
  await delay(null, 500, 900)
  return { invoiceNo, paperId: pay.paperId, journal: pay.journal, authorEmail: paper?.authorEmail ?? pay.payer, assigneeId, assigneeName: assigneeId ? nameOf(assigneeId) : undefined, paperStatus: advance ? 'paid' : (paper?.status ?? 'paid') }
}

const nameOf = (userId: string) => useDataStore.getState().users.find((u) => u.id === userId)?.name ?? userId

/** Manual production assignment (when the journal has no Associate Editor of its own). */
export async function assignProduction(paperId: string, userId: string) {
  const paper = useDataStore.getState().papers.find((p) => p.id === paperId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  updatePaper(paperId, { assigneeId: userId, productionDue: paper.productionDue ?? new Date(Date.now() + 5 * 86_400_000).toISOString() },
    { event: `Assigned to ${nameOf(userId)} (Associate Editor) for production`, audit: 'Production assignee set' })
  return delay(nameOf(userId), 250, 500)
}

export async function rejectPayment(id: string, reason: string) {
  const pay = find(id)
  if (pay.status !== 'pending_verification') throw new ApiError('Only payments pending verification can be rejected.', 'invalid')
  savePayment(id, { status: 'rejected', rejectReason: reason })
  const paper = useDataStore.getState().papers.find((p) => p.id === pay.paperId)
  if (paper) updatePaper(paper.id, { paymentStatus: 'rejected' }, { event: `Payment proof rejected (${pay.reference})`, note: reason, audit: 'Payment proof rejected' })
  sendMessage({ journal: pay.journal, paperId: pay.paperId, recipient: paper?.authorEmail ?? pay.payer, channel: 'email', template: 'Payment proof rejected — please re-upload' })
  recordAudit({ journal: pay.journal, action: 'Offline payment rejected', target: pay.id, oldValue: 'pending_verification', newValue: `rejected: ${reason}` })
  return delay(null, 400, 800)
}

/** Refund a verified payment in full; issues a credit note against the invoice. */
export async function refundPayment(id: string, reason: string) {
  const pay = find(id)
  if (!['verified', 'verified_auto'].includes(pay.status) || !pay.invoiceNo) throw new ApiError('Only verified payments with an invoice can be refunded.', 'invalid')
  const issuedAt = new Date().toISOString()
  savePayment(id, { status: 'refunded', refundedAt: issuedAt })
  const { creditNotes, patch } = useFinanceStore.getState()
  const note = toCreditNote(pay, creditNoteNo(creditNotes, pay.journal), reason, issuedAt, currentActor())
  patch({ creditNotes: [note, ...creditNotes] })
  const paper = useDataStore.getState().papers.find((p) => p.id === pay.paperId)
  if (paper) updatePaper(paper.id, { paymentStatus: 'refunded' }, { event: `Payment refunded · credit note ${note.id}`, note: reason, audit: 'Payment refunded' })
  sendMessage({ journal: pay.journal, paperId: pay.paperId, recipient: paper?.authorEmail ?? pay.payer, channel: 'email', template: `Refund processed — credit note ${note.id}` })
  recordAudit({ journal: pay.journal, action: 'Payment refunded', target: pay.id, oldValue: pay.status, newValue: `refunded · ${note.id}` })
  await delay(null, 500, 900)
  return note
}
