import type { JournalCode, Paper, Payment } from '@/shared/types'
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
export type PayoutMode = 'bank_transfer' | 'upi' | 'cheque' | 'other'

export interface ReferralPayout {
  date: string // ISO date
  amount: number
  mode: PayoutMode
  reference: string
  recordedBy: string
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
  status: ReferralStatus
  earnedAt: string
  note?: string
  cancelReason?: string
  payout?: ReferralPayout
}

export const PAYOUT_MODE_LABEL: Record<PayoutMode, string> = {
  bank_transfer: 'Bank transfer', upi: 'UPI', cheque: 'Cheque', other: 'Other',
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

/** Realistic referral credits spread across statuses, tied to real papers in the store. */
export function buildReferrals(papers: Paper[]): ReferralCredit[] {
  const pick = (statuses: Paper['status'][], n: number, skip = 0) => papers.filter((p) => statuses.includes(p.status)).slice(skip, skip + n)
  const groups: [ReferralStatus, Paper[]][] = [
    ['paid', pick(['published', 'indexed'], 4)],
    ['eligible', pick(['paid', 'in_production', 'ready_for_approval', 'published'], 4, 2)],
    ['pending', pick(['accepted', 'payment_pending', 'under_review'], 4)],
    ['cancelled', pick(['rejected', 'withdrawn'], 2)],
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
        note: status === 'pending' ? 'Becomes eligible once the referred author’s APC payment is verified.' : undefined,
      }
      if (status === 'paid') {
        credit.payout = {
          date: ago(2 + k * 3).slice(0, 10), amount, mode: (['bank_transfer', 'upi', 'bank_transfer', 'cheque'] as PayoutMode[])[k % 4],
          reference: PAYOUT_REFS[k % PAYOUT_REFS.length], recordedBy: 'Priya Menon',
        }
      }
      if (status === 'cancelled') credit.cancelReason = p.status === 'rejected' ? 'Referred paper was rejected; no APC was charged.' : 'Referred author withdrew the paper before payment.'
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
