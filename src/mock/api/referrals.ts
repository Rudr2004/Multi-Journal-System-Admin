import type { JournalCode, PaperStatus } from '@/shared/types'
import { PAYOUT_MODE_LABEL, derivedReferralStatus, type PayoutMode, type ReferralCredit, type ReferrerProfile } from '../data/financeExtra'
import { currentActor, recordAudit, sendMessage } from '../actions'
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

/** What the referee was emailed after a payout (shown to the admin as confirmation). */
export interface PayoutEmail { to: string; subject: string; body: string; attachment?: string }

export const UPI_RE = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z][a-zA-Z0-9]{1,}$/
export const PHONE_RE = /^\+?[\d\s()-]{8,16}$/

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function composeEmail(kind: 'proof' | 'confirmation', t: ReferralRow[], input: { amount: number; mode: PayoutMode; reference: string; proof?: { name: string } }): PayoutEmail {
  const names = t.map((c) => c.paperId).join(', ')
  return kind === 'proof'
    ? {
        to: t[0].referrerEmail, subject: `Your referral payment of ${inr(input.amount)} has been sent`, attachment: input.proof?.name,
        body: `Dear ${t[0].referrer},\n\nThank you for referring authors to ${t[0].journal}. We have paid your referral credit of ${inr(input.amount)} for ${names} by ${PAYOUT_MODE_LABEL[input.mode]} (reference ${input.reference}).\n\nThe proof of payment is attached to this email.\n\nWith regards,\nEditorial Office`,
      }
    : {
        to: t[0].referrerEmail, subject: `Payment confirmation: ${inr(input.amount)} referral credit`,
        body: `Dear ${t[0].referrer},\n\nYour referral credit of ${inr(input.amount)} for ${names} was paid successfully through our payment gateway (transaction ${input.reference}).\n\nNo action is needed. You can see this payment under Track My Paper.\n\nWith regards,\nEditorial Office`,
      }
}

/** Manual payout only — the system never pays out automatically. One payout can settle several eligible credits of one referrer. */
export async function recordPayout(ids: string[], input: PayoutInput): Promise<{ count: number; email: PayoutEmail; transactionId: string }> {
  const { referrals, patch } = useFinanceStore.getState()
  const targets = referrals.filter((r) => ids.includes(r.id)).map(decorate)
  if (targets.length === 0) throw new ApiError('Select at least one credit.', 'invalid')
  if (targets.some((t) => t.status !== 'eligible')) throw new ApiError('Only Eligible credits (referred paper published) can be paid out.', 'invalid')
  if (new Set(targets.map((t) => t.referrerEmail)).size > 1) throw new ApiError('A payout can only cover one referrer.', 'invalid')
  const gateway = input.mode === 'gateway'
  if (!gateway && !input.proof) throw new ApiError('Attach the proof of payment (screenshot or receipt).', 'invalid')
  const total = targets.reduce((a, t) => a + t.amount, 0)
  if (Math.abs(total - input.amount) > 0.001) throw new ApiError(`Payout amount must equal the selected credits (${total.toFixed(2)}).`, 'invalid')
  const by = currentActor()
  // Gateway payments complete automatically and get a transaction id; manual ones keep the reference the admin typed.
  const transactionId = gateway ? `pay_${Date.now().toString(36).toUpperCase()}` : input.reference
  const kind = gateway ? 'confirmation' as const : 'proof' as const
  const sentAt = new Date().toISOString()
  const email = composeEmail(kind, targets, { amount: input.amount, mode: input.mode, reference: transactionId, proof: input.proof })
  patch({
    referrals: referrals.map((r) => (ids.includes(r.id)
      ? { ...r, status: 'paid' as const, payout: { date: input.date, amount: r.amount, mode: input.mode, reference: transactionId, recordedBy: gateway ? 'Payment gateway' : by, proof: input.proof, status: 'paid' as const, transactionId, emailSentAt: sentAt, emailKind: kind } }
      : r)),
  })
  sendMessage({ journal: targets[0].journal, paperId: targets[0].paperId, recipient: email.to, channel: 'email', template: gateway ? 'Referral payout confirmation' : 'Referral payout (proof attached)', status: 'delivered' })
  for (const t of targets) {
    recordAudit({ journal: t.journal, action: 'Referral payout recorded', target: `${t.id} · ${t.referrer}`, oldValue: 'eligible', newValue: `paid · ${PAYOUT_MODE_LABEL[input.mode]} ${input.reference} · proof ${input.proof?.name ?? "gateway"}` })
  }
  return delay({ count: targets.length, email, transactionId }, 400, 800)
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

/** Add or update a referee's phone number and UPI ID (the referee can also do this from Track My Paper). */
export async function updateReferrerProfile(email: string, name: string, journal: JournalCode, input: Pick<ReferrerProfile, 'phone' | 'upiId'>) {
  const phone = input.phone?.trim() ?? ''
  const upiId = input.upiId?.trim() ?? ''
  if (phone && !PHONE_RE.test(phone)) throw new ApiError('Enter a valid phone number, e.g. +91 98765 43210.', 'invalid')
  if (upiId && !UPI_RE.test(upiId)) throw new ApiError('Enter a valid UPI ID, e.g. name@okhdfcbank.', 'invalid')
  const { profiles, patch } = useFinanceStore.getState()
  const before = profiles[email] ?? {}
  patch({ profiles: { ...profiles, [email]: { phone: phone || undefined, upiId: upiId || undefined, updatedAt: new Date().toISOString(), updatedBy: currentActor() } } })
  recordAudit({ journal, action: 'Referee payment details updated', target: `${name} <${email}>`, oldValue: `UPI ${before.upiId ?? 'none'} · ${before.phone ?? 'no phone'}`, newValue: `UPI ${upiId || 'none'} · ${phone || 'no phone'}` })
  return delay(null, 250, 500)
}

/** Change the referral amount per journal. Optionally re-price credits that are not paid or cancelled yet. */
export async function setReferralAmounts(next: Partial<Record<JournalCode, number>>, applyToUnpaid: boolean) {
  const { amounts, referrals, patch } = useFinanceStore.getState()
  for (const [j, v] of Object.entries(next)) if (!(v && v > 0 && v <= 100000)) throw new ApiError(`Enter an amount between 1 and 1,00,000 for ${j}.`, 'invalid')
  const merged = { ...amounts, ...next } as typeof amounts
  let repriced = 0
  const updated = applyToUnpaid
    ? referrals.map((c) => {
        const amt = next[c.journal]
        if (amt === undefined || c.status === 'paid' || c.status === 'cancelled' || c.amount === amt) return c
        repriced++
        return { ...c, amount: amt }
      })
    : referrals
  patch({ amounts: merged, referrals: updated })
  for (const [j, v] of Object.entries(next)) {
    if (amounts[j as JournalCode] !== v) recordAudit({ journal: j as JournalCode, action: 'Referral amount changed', target: `${j} referral credit`, oldValue: inr(amounts[j as JournalCode]), newValue: `${inr(v as number)}${applyToUnpaid ? ' (applied to unpaid credits)' : ' (new credits only)'}` })
  }
  return delay(repriced, 300, 600)
}

/** Edit the amount of one credit that has not been paid or cancelled. */
export async function updateCreditAmount(id: string, amount: number) {
  if (!(amount > 0 && amount <= 100000)) throw new ApiError('Enter an amount between 1 and 1,00,000.', 'invalid')
  const { referrals, patch } = useFinanceStore.getState()
  const c = referrals.find((x) => x.id === id)
  if (!c) throw new ApiError('Credit not found', 'not_found')
  if (c.status === 'paid' || c.status === 'cancelled') throw new ApiError('Paid or cancelled credits cannot be changed.', 'invalid')
  patch({ referrals: referrals.map((x) => (x.id === id ? { ...x, amount } : x)) })
  recordAudit({ journal: c.journal, action: 'Referral credit amount changed', target: `${c.id} · ${c.referrer}`, oldValue: inr(c.amount), newValue: inr(amount) })
  return delay(null, 250, 500)
}

