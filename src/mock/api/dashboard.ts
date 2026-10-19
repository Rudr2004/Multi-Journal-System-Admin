import { differenceInCalendarDays, isSameMonth, parseISO } from 'date-fns'
import type { ActivityEntry, JournalCode, JournalScope, MessageLogEntry, Paper, PaperStatus, Payment, Ticket, WhatsAppChat } from '@/shared/types'
import { PIPELINE_STAGES } from '@/shared/statuses'
import { computeGst } from '@/shared/gst'
import { JOURNAL_CODES } from '../data/core'
import { SCHOLAR_RATE } from '../data/ops'
import { NOW, nextDispatch } from '../data/papers'
import { INBOX_UNREAD_SEED, TICKET_PRIORITIES } from '../data/dashboard'
import type { BackdatedItem, ChangeRequest } from '../data/production'
import type { ReviewRecord } from '../data/editorial'
import { useDataStore, useSession } from '../store'
import { useProductionStore } from '../stores/production'
import { useEditorialStore } from '../stores/editorial'
import { usePublishingStore } from '../stores/publishing'
import { delay } from './latency'

const inScope = (scope: JournalScope, allowed: JournalCode[]) => (j: JournalCode) =>
  scope === 'ALL' ? allowed.includes(j) : j === scope

const count = (papers: Paper[], ...s: PaperStatus[]) => papers.filter((p) => s.includes(p.status)).length
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const dueSoon = (iso?: string) => !!iso && differenceInCalendarDays(parseISO(iso), NOW) <= 0
const byDue = (a: Paper, b: Paper, key: 'productionDue' | 'reviewDue') => (a[key] ?? '9').localeCompare(b[key] ?? '9')

/* ---------- Super Admin ---------- */
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

export async function getAdminOverview(scope: JournalScope, allowed: JournalCode[], range?: DateRange): Promise<AdminOverview> {
  const ok = inScope(scope, allowed)
  const ranged = !!(range?.from || range?.to)
  const papers = useDataStore.getState().papers.filter((p) => ok(p.journal) && inRange(p.submittedAt, range))
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
  return delay({
    kpis: {
      newSubmissions: ranged ? papers.length : papers.filter((p) => differenceInCalendarDays(NOW, parseISO(p.submittedAt)) <= 7).length,
      awaitingDecision: count(papers, 'decision_pending'),
      awaitingPayment: count(papers, 'payment_pending', 'accepted'),
      inProduction: count(papers, 'in_production', 'returned_to_production', 'paid'),
      readyToPublish: count(papers, 'ready_for_approval'),
      publishedThisMonth: papers.filter((p) => ['published', 'indexed', 'corrected'].includes(p.status) && (ranged || isSameMonth(parseISO(p.updatedAt), NOW))).length,
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
    scholarRate: avg(JOURNAL_CODES.filter(ok).map((j) => SCHOLAR_RATE[j])),
  })
}

export const getRecentActivity = (scope: JournalScope, allowed: JournalCode[]): Promise<ActivityEntry[]> => {
  const ok = inScope(scope, allowed)
  return delay(useDataStore.getState().activity.filter((a) => ok(a.journal)).slice(0, 8))
}

/* ---------- Editor ---------- */
export interface EditorOverview {
  pipeline: { key: string; label: string; count: number }[]
  decisions: Paper[]
  payments: { payment: Payment; paper?: Paper }[]
  ready: Paper[]
  corrections: ChangeRequest[]
  scholarRate: number
  total: number
}

/** Inclusive range. Each end is a date (YYYY-MM-DD, whole day) or a date with time (YYYY-MM-DDTHH:mm, local time). Papers are matched on their submission time. */
export interface DateRange { from?: string; to?: string }
const bound = (v: string, end: boolean) => new Date(v.length <= 10 ? `${v}T${end ? '23:59:59.999' : '00:00:00'}` : end ? `${v}:59.999` : v).getTime()
export const inRange = (iso: string, r?: DateRange) => {
  const t = new Date(iso).getTime()
  return (!r?.from || t >= bound(r.from, false)) && (!r?.to || t <= bound(r.to, true))
}

export async function getEditorOverview(scope: JournalScope, allowed: JournalCode[], range?: DateRange): Promise<EditorOverview> {
  const ok = inScope(scope, allowed)
  const { papers, payments } = useDataStore.getState()
  const mine = papers.filter((p) => ok(p.journal) && inRange(p.submittedAt, range))
  const mineIds = new Set(mine.map((p) => p.id))
  return delay({
    pipeline: PIPELINE_STAGES.map((s) => ({ key: s.key, label: s.label, count: count(mine, ...s.statuses) })),
    decisions: mine.filter((p) => p.status === 'decision_pending').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)),
    payments: payments.filter((x) => ok(x.journal) && mineIds.has(x.paperId) && x.status === 'pending_verification').map((payment) => ({ payment, paper: papers.find((p) => p.id === payment.paperId) })),
    ready: mine.filter((p) => p.status === 'ready_for_approval'),
    corrections: useProductionStore.getState().changeRequests.filter((c) => ok(c.journal) && inRange(c.requestedAt, range) && ['requested', 'under_review', 'version_review'].includes(c.status)),
    scholarRate: avg(JOURNAL_CODES.filter(ok).map((j) => SCHOLAR_RATE[j])),
    total: mine.length,
  })
}

/* ---------- Associate Editor ---------- */
export interface AssociateOverview {
  assigned: Paper[]
  stages: { status: PaperStatus; label: string; count: number }[]
  returned: { paper: Paper; note?: { text: string; by: string; at: string } }[]
  due: Paper[]
  backdated: BackdatedItem[]
  conference: { paper: Paper; conference: string }[]
  corrections: ChangeRequest[]
  inPress: number
}

const AE_STAGES: { status: PaperStatus; label: string }[] = [
  { status: 'paid', label: 'Paid, to start' },
  { status: 'in_production', label: 'In production' },
  { status: 'returned_to_production', label: 'Returned' },
  { status: 'ready_for_approval', label: 'Sent for approval' },
]

export async function getAssociateOverview(userId: string, scope: JournalScope, allowed: JournalCode[]): Promise<AssociateOverview> {
  const ok = inScope(scope, allowed)
  const all = useDataStore.getState().papers
  const assigned = all.filter((p) => p.assigneeId === userId && ok(p.journal))
  const prod = useProductionStore.getState()
  const confs = usePublishingStore.getState()
  const confName = (paperId: string) => confs.conferences.find((x) => (confs.links[x.id] ?? []).includes(paperId))?.shortName
  return delay({
    assigned,
    stages: AE_STAGES.map((s) => ({ ...s, count: count(assigned, s.status) })),
    returned: assigned.filter((p) => p.status === 'returned_to_production').map((paper) => ({ paper, note: prod.records[paper.id]?.returnNote })),
    due: assigned.filter((p) => p.status !== 'ready_for_approval' && dueSoon(p.productionDue)).sort((a, b) => byDue(a, b, 'productionDue')),
    backdated: prod.backdated.filter((b) => ok(b.journal) && b.status === 'pending_approval'),
    conference: assigned.flatMap((paper) => { const c = confName(paper.id); return c ? [{ paper, conference: c }] : [] }),
    corrections: prod.changeRequests.filter((c) => ok(c.journal) && c.assigneeId === userId && c.status === 'ready'),
    inPress: all.filter((p) => ok(p.journal) && ['in_production', 'returned_to_production', 'ready_for_approval'].includes(p.status)).length,
  })
}

/* ---------- Reviewer / Review Panel Member ---------- */
export interface ReviewerOverview {
  assigned: Paper[]
  completed: ReviewRecord[]
  blogDrafts: number
}

const blogMods = import.meta.glob('/src/mock/stores/blog.ts', { eager: true }) as Record<string, Record<string, unknown>>

/** Counts this user's draft posts when the blog store exists (built by another package); 0 otherwise. */
function blogDraftCount(userId: string, name: string): number {
  const mod = Object.values(blogMods)[0]
  if (!mod) return 0
  for (const v of Object.values(mod)) {
    const store = v as { getState?: () => { posts?: unknown } } | undefined
    const posts = typeof store?.getState === 'function' ? store.getState().posts : undefined
    if (Array.isArray(posts)) {
      return (posts as { status?: string; authorId?: string; author?: string }[]).filter((p) => p.status === 'draft' && (p.authorId === userId || p.author === name)).length
    }
  }
  return 0
}

export async function getReviewerOverview(userId: string, scope: JournalScope, allowed: JournalCode[]): Promise<ReviewerOverview> {
  const ok = inScope(scope, allowed)
  const { papers, users } = useDataStore.getState()
  const name = users.find((u) => u.id === userId)?.name ?? ''
  return delay({
    assigned: papers.filter((p) => p.reviewerId === userId && ok(p.journal)).sort((a, b) => byDue(a, b, 'reviewDue')),
    completed: useEditorialStore.getState().reviews.filter((r) => r.reviewerId === userId && ok(r.journal)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    blogDrafts: blogDraftCount(userId, name),
  })
}

/* ---------- Support Executive ---------- */
export interface SupportOverview {
  openTickets: Ticket[]
  byPriority: { priority: (typeof TICKET_PRIORITIES)[number]; count: number }[]
  unreadChats: WhatsAppChat[]
  unread: { whatsapp: number; email: number | null; chat: number | null }
  corrections: ChangeRequest[]
  failedMessages: MessageLogEntry[]
}

export async function getSupportOverview(scope: JournalScope, allowed: JournalCode[], userName: string): Promise<SupportOverview> {
  const ok = inScope(scope, allowed)
  const { tickets, chats, messages } = useDataStore.getState()
  const flags = useSession.getState().flags
  const openTickets = tickets.filter((t) => ok(t.journal) && t.status !== 'resolved').sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const unreadChats = chats.filter((c) => ok(c.journal) && c.unread > 0)
  const seeded = (k: 'email' | 'chat') => JOURNAL_CODES.filter(ok).reduce((n, j) => n + INBOX_UNREAD_SEED[k][j], 0)
  return delay({
    openTickets,
    byPriority: TICKET_PRIORITIES.map((priority) => ({ priority, count: openTickets.filter((t) => t.priority === priority).length })),
    unreadChats,
    unread: {
      whatsapp: unreadChats.reduce((n, c) => n + c.unread, 0),
      email: flags.emailInbox ? seeded('email') : null,
      chat: flags.websiteChat ? seeded('chat') : null,
    },
    corrections: useProductionStore.getState().changeRequests.filter((c) => ok(c.journal) && c.requestedBy === userName),
    failedMessages: messages.filter((m) => ok(m.journal) && m.status === 'failed'),
  })
}
