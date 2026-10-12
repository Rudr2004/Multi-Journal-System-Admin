import type { JournalCode } from '@/shared/types'
import { PAYOUT_MODE_LABEL, type PayoutMode, type ReferralCredit } from '../data/financeExtra'
import { currentActor, recordAudit } from '../actions'
import { useFinanceStore } from '../stores/finance'
import { ApiError, delay } from './latency'

export function listReferrals(journals: JournalCode[]) {
  return delay(useFinanceStore.getState().referrals.filter((r) => journals.includes(r.journal)).sort((a, b) => b.earnedAt.localeCompare(a.earnedAt)))
}

export interface PayoutInput { date: string; amount: number; mode: PayoutMode; reference: string }

/** Manual payout only — the system never pays out automatically. One payout can settle several eligible credits of one referrer. */
export async function recordPayout(ids: string[], input: PayoutInput) {
  const { referrals, patch } = useFinanceStore.getState()
  const targets = referrals.filter((r) => ids.includes(r.id))
  if (targets.length === 0) throw new ApiError('Select at least one credit.', 'invalid')
  if (targets.some((t) => t.status !== 'eligible')) throw new ApiError('Only Eligible credits can be paid out.', 'invalid')
  if (new Set(targets.map((t) => t.referrerEmail)).size > 1) throw new ApiError('A payout can only cover one referrer.', 'invalid')
  const total = targets.reduce((a, t) => a + t.amount, 0)
  if (Math.abs(total - input.amount) > 0.001) throw new ApiError(`Payout amount must equal the selected credits (${total.toFixed(2)}).`, 'invalid')
  const by = currentActor()
  patch({
    referrals: referrals.map((r) => (ids.includes(r.id)
      ? { ...r, status: 'paid' as const, payout: { date: input.date, amount: r.amount, mode: input.mode, reference: input.reference, recordedBy: by } }
      : r)),
  })
  for (const t of targets) {
    recordAudit({ journal: t.journal, action: 'Referral payout recorded', target: `${t.id} · ${t.referrer}`, oldValue: 'eligible', newValue: `paid · ${PAYOUT_MODE_LABEL[input.mode]} ${input.reference}` })
  }
  return delay(targets.length, 400, 800)
}

export async function cancelReferral(id: string, reason: string) {
  const { referrals, patch } = useFinanceStore.getState()
  const r = referrals.find((x) => x.id === id)
  if (!r) throw new ApiError('Credit not found', 'not_found')
  if (r.status === 'paid' || r.status === 'cancelled') throw new ApiError('This credit can no longer be cancelled.', 'invalid')
  patch({ referrals: referrals.map((x): ReferralCredit => (x.id === id ? { ...x, status: 'cancelled', cancelReason: reason } : x)) })
  recordAudit({ journal: r.journal, action: 'Referral credit cancelled', target: `${r.id} · ${r.referrer}`, oldValue: r.status, newValue: `cancelled: ${reason}` })
  return delay(null, 300, 600)
}
