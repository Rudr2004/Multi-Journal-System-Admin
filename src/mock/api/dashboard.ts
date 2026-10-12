import { differenceInCalendarDays, isSameMonth, parseISO } from 'date-fns'
import type { JournalCode, JournalScope, Paper, PaperStatus } from '@/shared/types'
import { PIPELINE_STAGES } from '@/shared/statuses'
import { computeGst } from '@/shared/gst'
import { JOURNAL_CODES } from '../data/core'
import { SCHOLAR_RATE } from '../data/ops'
import { NOW, nextDispatch } from '../data/papers'
import { useDataStore } from '../store'
import { delay } from './latency'

const inScope = (scope: JournalScope, allowed: JournalCode[]) => (j: JournalCode) =>
  scope === 'ALL' ? allowed.includes(j) : j === scope

const count = (papers: Paper[], ...s: PaperStatus[]) => papers.filter((p) => s.includes(p.status)).length

export interface AdminOverview {
  kpis: { newSubmissions: number; awaitingDecision: number; awaitingPayment: number; inProduction: number; readyToPublish: number; publishedThisMonth: number; revenueInr: number; revenueUsd: number }
  pipeline: { key: string; label: string; count: number }[]
  perJournal: { journal: JournalCode; submissions: number; awaitingDecision: number; inProduction: number; published: number; scholarRate: number }[]
  dispatch: { count: number; at: string; items: Paper[] }
  needsAction: { paper: Paper; action: string }[]
  scholarRate: number
}

function revenue(papers: Paper[]) {
  let inr = 0, usd = 0
  for (const p of papers) {
    if (p.paymentStatus !== 'verified') continue
    if (p.authorCountry === 'India') inr += computeGst(2500, 'INR').total
    else usd += 49
  }
  return { inr, usd }
}

export async function getAdminOverview(scope: JournalScope, allowed: JournalCode[]): Promise<AdminOverview> {
  const ok = inScope(scope, allowed)
  const papers = useDataStore.getState().papers.filter((p) => ok(p.journal))
  const rev = revenue(papers)
  const dispatchItems = papers.filter((p) => p.dispatchAt)
  const actionFor: Partial<Record<PaperStatus, string>> = {
    submitted: 'Screen paper', screening: 'Assign reviewer', decision_pending: 'Record decision',
    payment_pending: 'Verify payment', ready_for_approval: 'Approve & publish', returned_to_production: 'Awaiting fixes',
  }
  const needsAction = papers
    .filter((p) => ['submitted', 'decision_pending', 'payment_pending', 'ready_for_approval'].includes(p.status))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, 8)
    .map((paper) => ({ paper, action: actionFor[paper.status] ?? 'Review' }))
  const rates = JOURNAL_CODES.filter(ok).map((j) => SCHOLAR_RATE[j])
  return delay({
    kpis: {
      newSubmissions: papers.filter((p) => differenceInCalendarDays(NOW, parseISO(p.submittedAt)) <= 7).length,
      awaitingDecision: count(papers, 'decision_pending'),
      awaitingPayment: count(papers, 'payment_pending', 'accepted'),
      inProduction: count(papers, 'in_production', 'returned_to_production', 'paid'),
      readyToPublish: count(papers, 'ready_for_approval'),
      publishedThisMonth: papers.filter((p) => ['published', 'indexed', 'corrected'].includes(p.status) && isSameMonth(parseISO(p.updatedAt), NOW)).length,
      revenueInr: rev.inr,
      revenueUsd: rev.usd,
    },
    pipeline: PIPELINE_STAGES.map((s) => ({ key: s.key, label: s.label, count: count(papers, ...s.statuses) })),
    perJournal: JOURNAL_CODES.filter(ok).map((j) => {
      const jp = papers.filter((p) => p.journal === j)
      return {
        journal: j,
        submissions: jp.length,
        awaitingDecision: count(jp, 'decision_pending'),
        inProduction: count(jp, 'in_production', 'returned_to_production', 'paid'),
        published: count(jp, 'published', 'indexed', 'corrected'),
        scholarRate: SCHOLAR_RATE[j],
      }
    }),
    dispatch: { count: dispatchItems.length, at: nextDispatch().toISOString(), items: dispatchItems },
    needsAction,
    scholarRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0,
  })
}

export const getRecentActivity = (scope: JournalScope, allowed: JournalCode[]) => {
  const ok = inScope(scope, allowed)
  return delay(useDataStore.getState().activity.filter((a) => ok(a.journal)).slice(0, 8))
}

export const getMyProductionQueue = (userId: string, scope: JournalScope) =>
  delay(useDataStore.getState().papers.filter((p) => p.assigneeId === userId && (scope === 'ALL' || p.journal === scope)))

export const getMyReviews = (userId: string, scope: JournalScope) =>
  delay(useDataStore.getState().papers.filter((p) => p.reviewerId === userId && (scope === 'ALL' || p.journal === scope)))

export async function getSupportOverview(scope: JournalScope, allowed: JournalCode[]) {
  const ok = inScope(scope, allowed)
  const { tickets, chats, messages } = useDataStore.getState()
  return delay({
    openTickets: tickets.filter((t) => ok(t.journal) && t.status !== 'resolved'),
    unreadChats: chats.filter((c) => ok(c.journal) && c.unread > 0),
    failedMessages: messages.filter((m) => ok(m.journal) && m.status === 'failed'),
  })
}
