import type { JournalCode, Paper, PaperStatus, Payment } from '@/shared/types'
import { NOW } from './papers'

const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

/* ---------- Credit notes ---------- */
export interface CreditNote {
  id: string // CN-IJMAT-2026-0001
  paymentId: string
  invoiceNo: string
  paperId: string
  journal: JournalCode
  payer: string
  currency: 'INR' | 'USD'
  base: number
  cgst: number
  sgst: number
  igst: number
  total: number
  reason: string
  issuedAt: string
  issuedBy: string
}

/* ---------- Referral credits ---------- */
export type ReferralStatus = 'pending' | 'eligible' | 'paid' | 'cancelled'
export type PayoutMode = 'bank_transfer' | 'upi' | 'cheque' | 'other' | 'gateway'
export type PayoutPaymentStatus = 'processing' | 'paid' | 'failed'

export interface ReferralPayout {
  date: string // ISO date
  amount: number
  mode: PayoutMode
  reference: string
  recordedBy: string
  /** Proof of payment (mock upload: only the file name and size are kept). */
  proof?: { name: string; size: number }
  /** Payment status of this payout. Older records without it count as paid. */
  status?: PayoutPaymentStatus
  /** Gateway transaction id, or the bank/UTR reference for manual payouts. */
  transactionId?: string
  /** When the referee was emailed: the proof of payment (manual) or a confirmation (gateway). */
  emailSentAt?: string
  emailKind?: 'proof' | 'confirmation'
}

/** Contact and payment details of a referee, kept per email address. */
export interface ReferrerProfile {
  phone?: string
  upiId?: string
  updatedAt?: string
  updatedBy?: string
}

/** Default referral credit per journal (INR). Editable in Referral Management. */
export const DEFAULT_REFERRAL_AMOUNTS: Record<JournalCode, number> = { IJMAT: 250, JIMRT: 250, IJCSD: 300, IJECM: 250, IJFRD: 150 }

export const REFERRER_PROFILES: Record<string, ReferrerProfile> = {
  'sunita.deshpande@coep.example': { phone: '+91 98230 41187', upiId: 'sunita.deshpande@okhdfcbank' },
  'manoj.tiwari@nitrkl.example': { phone: '+91 94370 22610', upiId: 'manojtiwari@oksbi' },
  'harsh.vora@gtu.example': { phone: '+91 98795 11042', upiId: 'harshvora@ybl' },
  'fatima.sheikh@amu.example': { phone: '+91 91456 70338' },
  'anita.chaudhary@kjsce.example': { phone: '+91 98200 66419', upiId: 'anita.c@icici' },
  'rajiv.menon@cusat.example': { phone: '+91 94470 53921', upiId: 'rajivmenon@paytm' },
  'pallavi.kulkarni@viit.example': { phone: '+91 98909 37754', upiId: 'pallavik@okaxis' },
}

export interface ReferralCredit {
  id: string
  referrer: string
  referrerEmail: string
  referrerType: 'Mentor' | 'Past author' | 'Institution coordinator'
  referredAuthor: string
  paperId: string
  journal: JournalCode
  amount: number // INR
  /** Stored status: 'pending' means "not paid or cancelled by an action" — Eligible/Pending/Cancelled are then derived from the paper. */
  status: ReferralStatus
  earnedAt: string
  note?: string
  cancelReason?: string
  payout?: ReferralPayout
}

export const PAYOUT_MODE_LABEL: Record<PayoutMode, string> = {
  bank_transfer: 'Bank transfer', upi: 'UPI', cheque: 'Cheque', other: 'Other', gateway: 'Payment gateway (automatic)',
}

const REFERRERS: Pick<ReferralCredit, 'referrer' | 'referrerEmail' | 'referrerType'>[] = [
  { referrer: 'Prof. Sunita Deshpande', referrerEmail: 'sunita.deshpande@coep.example', referrerType: 'Mentor' },
  { referrer: 'Dr. Manoj Tiwari', referrerEmail: 'manoj.tiwari@nitrkl.example', referrerType: 'Mentor' },
  { referrer: 'Harsh Vora', referrerEmail: 'harsh.vora@gtu.example', referrerType: 'Past author' },
  { referrer: 'Dr. Fatima Sheikh', referrerEmail: 'fatima.sheikh@amu.example', referrerType: 'Past author' },
  { referrer: 'Anita Chaudhary', referrerEmail: 'anita.chaudhary@kjsce.example', referrerType: 'Institution coordinator' },
  { referrer: 'Prof. Rajiv Menon', referrerEmail: 'rajiv.menon@cusat.example', referrerType: 'Mentor' },
  { referrer: 'Dr. Pallavi Kulkarni', referrerEmail: 'pallavi.kulkarni@viit.example', referrerType: 'Past author' },
]

const PAYOUT_REFS = ['UTR426118830091', 'NEFT-SBIN5202610041', 'UPI/6218843107', 'CHQ 004512']

/** A credit becomes Eligible only after the referred paper is published; Paid and Cancelled (set by actions) override. */
export function derivedReferralStatus(c: Pick<ReferralCredit, 'status'>, paperStatus: PaperStatus | undefined): ReferralStatus {
  if (c.status === 'paid' || c.status === 'cancelled') return c.status
  if (paperStatus && ['published', 'indexed', 'corrected'].includes(paperStatus)) return 'eligible'
  if (paperStatus && ['withdrawn', 'rejected'].includes(paperStatus)) return 'cancelled'
  return 'pending'
}

/** Realistic referral credits spread across statuses, tied to real papers in the store. */
export function buildReferrals(papers: Paper[]): ReferralCredit[] {
  const pick = (statuses: Paper['status'][], n: number, skip = 0) => papers.filter((p) => statuses.includes(p.status)).slice(skip, skip + n)
  const groups: [ReferralStatus, Paper[]][] = [
    ['paid', pick(['published', 'indexed'], 3)],
    ['pending', pick(['published', 'indexed', 'corrected'], 4, 3)], // become Eligible automatically (paper published)
    ['pending', pick(['paid', 'in_production', 'ready_for_approval', 'accepted', 'payment_pending', 'under_review'], 4)],
    ['pending', pick(['rejected', 'withdrawn'], 2)], // become Cancelled automatically
  ]
  const out: ReferralCredit[] = []
  let k = 0
  for (const [status, list] of groups) {
    for (const p of list) {
      const r = REFERRERS[(k * 3 + 1) % REFERRERS.length]
      const amount = k % 4 === 3 ? 500 : 250
      const earnedAt = ago(6 + k * 6)
      const credit: ReferralCredit = {
        id: `REF-${3100 + k}`, ...r, referredAuthor: p.author, paperId: p.id, journal: p.journal, amount, status, earnedAt,
        note: status === 'pending' ? 'Becomes eligible once the referred paper is published.' : undefined,
      }
      if (status === 'paid') {
        credit.payout = {
          date: ago(2 + k * 3).slice(0, 10), amount, mode: (['bank_transfer', 'upi', 'bank_transfer', 'cheque'] as PayoutMode[])[k % 4],
          reference: PAYOUT_REFS[k % PAYOUT_REFS.length], recordedBy: 'Priya Menon',
          status: 'paid', transactionId: PAYOUT_REFS[k % PAYOUT_REFS.length], emailKind: 'proof', emailSentAt: ago(2 + k * 3),
          proof: { name: `payout-proof-${PAYOUT_REFS[k % PAYOUT_REFS.length].replace(/[^A-Za-z0-9]/g, '')}.pdf`, size: 118_000 + k * 7_300 },
        }
      }
      out.push(credit)
      k++
    }
  }
  return out
}

/* ---------- Demo seed tweaks applied on top of the shared payments ---------- */

export const nextInvoiceNo = (payments: Payment[], journal: JournalCode) => {
  const n = payments.filter((p) => p.journal === journal && p.invoiceNo).length + 1
  return `INV-${journal}-2026-${String(n + 100).padStart(4, '0')}`
}

export const creditNoteNo = (notes: CreditNote[], journal: JournalCode) =>
  `CN-${journal}-2026-${String(notes.filter((c) => c.journal === journal).length + 1).padStart(4, '0')}`
