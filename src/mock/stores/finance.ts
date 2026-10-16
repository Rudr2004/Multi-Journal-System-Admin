import { create } from 'zustand'
import type { Payment } from '@/shared/types'
import { useDataStore } from '../store'
import { registerReset } from '../reset'
import type { JournalCode } from '@/shared/types'
import { DEFAULT_REFERRAL_AMOUNTS, REFERRER_PROFILES, buildReferrals, creditNoteNo, type CreditNote, type ReferralCredit, type ReferrerProfile } from '../data/financeExtra'

interface FinanceState {
  creditNotes: CreditNote[]
  referrals: ReferralCredit[]
  /** Referee phone and UPI ID, by email. */
  profiles: Record<string, ReferrerProfile>
  /** Referral credit amount per journal (INR). */
  amounts: Record<JournalCode, number>
  reset: () => void
  patch: (p: Partial<Omit<FinanceState, 'reset' | 'patch'>>) => void
}

/**
 * Shapes the shared payment seed so the demo scenarios are reachable:
 *  - two JIMRT offline payments wait for verification (Associate Editor demo path, assignee u-ae / u-multi)
 *  - one rejected proof, and one refunded payment with its credit note
 */
function applyPaymentDemoSeed(): CreditNote[] {
  const { payments, papers, patch } = useDataStore.getState()
  const pay = payments.map((p) => ({ ...p }))
  const pap = papers.map((p) => ({ ...p }))
  const paper = (id: string) => pap.find((p) => p.id === id)

  // 1) JIMRT offline proofs awaiting verification
  for (const p of pay.filter((x) => x.journal === 'JIMRT' && x.status === 'awaiting_proof').slice(0, 2)) {
    p.status = 'pending_verification'
    p.method = p.currency === 'INR' ? 'upi' : 'bank_transfer'
    p.proofLabel = p.method === 'upi' ? 'UPI payment screenshot' : 'Bank transfer receipt'
    p.reference = p.method === 'upi' ? `UTR${412000000000 + p.id.length * 31337 + Number(p.id.slice(4))}` : `SWIFT-${p.id.slice(4)}-7731`
    const pp = paper(p.paperId)
    if (pp) pp.paymentStatus = 'verification'
  }

  // 2) one rejected proof (IJFRD preferred)
  const rej = pay.find((x) => x.status === 'awaiting_proof' && x.journal !== 'JIMRT')
  if (rej) {
    rej.status = 'rejected'
    rej.method = rej.currency === 'INR' ? 'upi' : 'bank_transfer'
    rej.proofLabel = rej.method === 'upi' ? 'UPI payment screenshot' : 'Bank transfer receipt'
    rej.rejectReason = 'The screenshot does not show the UTR number or the beneficiary name. Please upload the full payment confirmation.'
    const pp = paper(rej.paperId)
    if (pp) pp.paymentStatus = 'rejected'
  }

  // 3) one refund with a credit note (a retracted paper's payment)
  const notes: CreditNote[] = []
  const ref = pay.find((x) => x.invoiceNo && (x.status === 'verified_auto' || x.status === 'verified') && paper(x.paperId)?.status === 'retracted')
  if (ref) {
    ref.status = 'refunded'
    ref.refundedAt = new Date(Date.now() - 4 * 86_400_000).toISOString()
    const pp = paper(ref.paperId)
    if (pp) pp.paymentStatus = 'refunded'
    notes.push(toCreditNote(ref, creditNoteNo(notes, ref.journal), 'Paper retracted by the editorial board; article processing charge refunded in full.', ref.refundedAt, 'Priya Menon'))
  }
  patch({ payments: pay, papers: pap })
  return notes
}

export function toCreditNote(p: Payment, id: string, reason: string, issuedAt: string, issuedBy: string): CreditNote {
  return {
    id, paymentId: p.id, invoiceNo: p.invoiceNo ?? '—', paperId: p.paperId, journal: p.journal, payer: p.payer, currency: p.currency,
    base: p.base, cgst: p.cgst, sgst: p.sgst, igst: p.igst, total: p.total, reason, issuedAt, issuedBy,
  }
}

function seed() {
  const creditNotes = applyPaymentDemoSeed()
  return { creditNotes, referrals: buildReferrals(useDataStore.getState().papers), profiles: structuredClone(REFERRER_PROFILES), amounts: { ...DEFAULT_REFERRAL_AMOUNTS } }
}

export const useFinanceStore = create<FinanceState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  patch: (p) => set(p),
}))

registerReset(() => useFinanceStore.getState().reset())
