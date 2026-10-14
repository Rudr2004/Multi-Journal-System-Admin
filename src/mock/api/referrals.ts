import type { JournalCode, PaperStatus } from '@/shared/types'
import { PAYOUT_MODE_LABEL, derivedReferralStatus, type PayoutMode, type ReferralCredit } from '../data/financeExtra'
import { currentActor, recordAudit } from '../actions'
import { useDataStore } from '../store'
import { useFinanceStore } from '../stores/finance'
import { ApiError, delay } from './latency'

/** A credit with its status derived from the referred paper (Eligible only after publication). */
export interface ReferralRow extends ReferralCredit {
  paperStatus?: PaperStatus
  paperTitle?: string
}

const decorate = (c: ReferralCredit): ReferralRow => {
  const paper = useDataStore.getState().papers.find((p) => p.id === c.paperId)
  return {
    ...c, status: derivedReferralStatus(c, paper?.status), paperStatus: paper?.status, paperTitle: paper?.title,
    cancelReason: c.cancelReason ?? (derivedReferralStatus(c, paper?.status) === 'cancelled' && c.status !== 'cancelled' ? `Referred paper was ${paper?.status}; no credit is due.` : undefined),
  }
}

export function listReferrals(journals: JournalCode[]) {
  return delay(useFinanceStore.getState().referrals.filter((r) => journals.includes(r.journal)).map(decorate).sort((a, b) => b.earnedAt.localeCompare(a.earnedAt)))
}

export interface PayoutInput { date: string; amount: number; mode: PayoutMode; reference: string; proof?: { name: string; size: number } }

/** Manual payout only — the system never pays out automatically. One payout can settle several eligible credits of one referrer. */
export async function recordPayout(ids: string[], input: PayoutInput) {
  const { referrals, patch } = useFinanceStore.getState()
  const targets = referrals.filter((r) => ids.includes(r.id)).map(decorate)
  if (targets.length === 0) throw new ApiError('Select at least one credit.', 'invalid')
  if (targets.some((t) => t.status !== 'eligible')) throw new ApiError('Only Eligible credits (referred paper published) can be paid out.', 'invalid')
  if (new Set(targets.map((t) => t.referrerEmail)).size > 1) throw new ApiError('A payout can only cover one referrer.', 'invalid')
  if (!input.proof) throw new ApiError('Attach the proof of payment (screenshot or receipt).', 'invalid')
  const total = targets.reduce((a, t) => a + t.amount, 0)
  if (Math.abs(total - input.amount) > 0.001) throw new ApiError(`Payout amount must equal the selected credits (${total.toFixed(2)}).`, 'invalid')
  const by = currentActor()
  patch({
    referrals: referrals.map((r) => (ids.includes(r.id)
      ? { ...r, status: 'paid' as const, payout: { date: input.date, amount: r.amount, mode: input.mode, reference: input.reference, recordedBy: by, proof: input.proof } }
      : r)),
  })
  for (const t of targets) {
    recordAudit({ journal: t.journal, action: 'Referral payout recorded', target: `${t.id} · ${t.referrer}`, oldValue: 'eligible', newValue: `paid · ${PAYOUT_MODE_LABEL[input.mode]} ${input.reference} · proof ${input.proof.name}` })
  }
  return delay(targets.length, 400, 800)
}

export async function cancelReferral(id: string, reason: string) {
  const { referrals, patch } = useFinanceStore.getState()
  const stored = referrals.find((x) => x.id === id)
  if (!stored) throw new ApiError('Credit not found', 'not_found')
  const r = decorate(stored)
  if (r.status === 'paid' || stored.status === 'cancelled') throw new ApiError('This credit can no longer be cancelled.', 'invalid')
  patch({ referrals: referrals.map((x): ReferralCredit => (x.id === id ? { ...x, status: 'cancelled', cancelReason: reason } : x)) })
  recordAudit({ journal: r.journal, action: 'Referral credit cancelled', target: `${r.id} · ${r.referrer}`, oldValue: r.status, newValue: `cancelled: ${reason}` })
  return delay(null, 300, 600)
}
