import type { JournalCode, Paper, Payment, PaymentMethod, StaffUser } from '@/shared/types'
import { creditNoteNo, nextInvoiceNo } from '../data/financeExtra'
import { currentActor, logEvent, newId, autoAssigneeFor, recordAudit, sendMessage, updatePaper } from '../actions'
import { computeGst } from '@/shared/gst'
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
  const assigneeId = autoAssigneeFor(pay.journal)
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

/* ---------- Manual payment (author paid by UPI, bank transfer or another offline method) ---------- */

export interface ManualPaymentInput {
  method: 'upi' | 'bank_transfer' | 'other'
  /** UTR / transaction reference from the author's payment. */
  reference: string
  /** Date the author paid (yyyy-MM-dd). */
  date: string
  /** Name of the proof the author or Editor attached (optional). */
  proofName?: string
  note?: string
}

const METHOD_NAME = { upi: 'UPI', bank_transfer: 'Bank transfer', other: 'Other' } as const

/**
 * The Editor verifies a payment the author made by UPI (or another offline method) without going through the
 * proof queue: the payment is recorded and verified in one step, an invoice is issued, the paper becomes Paid, and
 * production is assigned (automatically when "Auto-assign Associate Editor" is on).
 */
export async function recordManualPayment(paperId: string, input: ManualPaymentInput): Promise<VerifyResult> {
  const store = useDataStore.getState()
  const paper = store.papers.find((p) => p.id === paperId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  if (!['accepted', 'payment_pending'].includes(paper.status)) throw new ApiError('A manual payment can only be recorded for an accepted paper that is waiting for payment.', 'invalid')
  if (store.payments.some((p) => p.paperId === paperId && p.status.startsWith('verified'))) throw new ApiError('This paper already has a verified payment.', 'invalid')
  if (input.reference.trim().length < 6) throw new ApiError('Enter the UTR or transaction reference (at least 6 characters).', 'invalid')

  const open = store.payments.find((p) => p.paperId === paperId && ['awaiting_proof', 'pending_verification', 'rejected'].includes(p.status))
  const india = paper.authorCountry === 'India'
  const g = computeGst(india ? 2500 : 49, india ? 'INR' : 'USD', india ? 'Gujarat' : undefined)
  const invoiceNo = nextInvoiceNo(store.payments, paper.journal)
  const record: Payment = {
    id: open?.id ?? `PAY-${newId('m').slice(2, 8).toUpperCase()}`,
    paperId, journal: paper.journal, payer: paper.author,
    method: input.method, currency: open?.currency ?? g.currency, base: open?.base ?? g.base, cgst: open?.cgst ?? g.cgst, sgst: open?.sgst ?? g.sgst, igst: open?.igst ?? g.igst, total: open?.total ?? g.total,
    status: 'verified', reference: input.reference.trim(), createdAt: new Date(`${input.date}T10:00:00`).toISOString(),
    proofLabel: input.proofName ? `${METHOD_NAME[input.method]} · ${input.proofName}` : `${METHOD_NAME[input.method]} (recorded by the Editor)`,
    invoiceNo,
  }
  store.patch({ payments: open ? store.payments.map((p) => (p.id === open.id ? record : p)) : [record, ...store.payments] })

  const assigneeId = autoAssigneeFor(paper.journal)
  updatePaper(paperId, {
    paymentStatus: 'verified', status: 'paid', productionDue: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    ...(assigneeId ? { assigneeId } : {}),
  }, { event: `Manual payment recorded (${METHOD_NAME[input.method]} ${record.reference}) and verified · invoice ${invoiceNo} issued`, note: input.note || undefined, audit: 'Manual payment verified' })
  if (assigneeId) logEvent(paperId, `Auto-assigned to ${nameOf(assigneeId)} (Associate Editor) for production`)
  sendMessage({ journal: paper.journal, paperId, recipient: paper.authorEmail, channel: 'email', template: `Payment received — invoice ${invoiceNo}` })
  recordAudit({ journal: paper.journal, action: 'Manual payment recorded and verified', target: paperId, oldValue: paper.paymentStatus, newValue: `verified · ${METHOD_NAME[input.method]} · ${record.reference} · ${invoiceNo} · by ${currentActor()}` })
  await delay(null, 500, 900)
  return { invoiceNo, paperId, journal: paper.journal, authorEmail: paper.authorEmail, assigneeId, assigneeName: assigneeId ? nameOf(assigneeId) : undefined, paperStatus: 'paid' }
}
