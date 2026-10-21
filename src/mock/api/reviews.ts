import type { JournalCode, Paper, StaffUser } from '@/shared/types'
import { formatDate } from '@/shared/formatters'
import { logEvent, recordAudit, sendMessage, updatePaper } from '../actions'
import {
  EXPERTISE, matchScore, abstractFor, candidatesFor, keywordsFor, paperSubjects, recommendationMeta, reviewerKindOf, userName, wordCountFor,
  type FileVersion, type Recommendation, type ReminderState, type ReviewDraft, type ReviewRecord, type ReviewScores, type ReviewerKind,
} from '../data/editorial'
import { useDataStore, useSession } from '../store'
import { draftKey, useEditorialStore, type AssignmentMeta, type AssignmentResult, type AssignmentState } from '../stores/editorial'
import { ApiError, delay } from './latency'

const rawPaper = (id: string) => {
  const p = useDataStore.getState().papers.find((x) => x.id === id)
  if (!p) throw new ApiError(`Paper ${id} was not found.`, 'not_found')
  return p
}
const findUser = (id: string) => useDataStore.getState().users.find((u) => u.id === id)

/* ------------------------------------------------------------------ */
/* Review management (editor side)                                      */
/* ------------------------------------------------------------------ */
export interface ReviewQueueRow {
  paper: Paper
  subjects: string[]
  reviewer?: StaffUser
  kind?: ReviewerKind
  reminders: ReminderState
  reviewsReceived: number
  outsideInHouse: boolean
}

const QUEUE_STATUSES: Paper['status'][] = ['screening', 'under_review', 'decision_pending']

export function listReviewQueue(journals: JournalCode[]) {
  const { papers, users } = useDataStore.getState()
  const { reminders, reviews } = useEditorialStore.getState()
  const flagOn = useSession.getState().flags.reviewPanel
  const rows = papers
    .filter((p) => journals.includes(p.journal) && QUEUE_STATUSES.includes(p.status))
    .map<ReviewQueueRow>((paper) => {
      const reviewer = paper.reviewerId ? users.find((u) => u.id === paper.reviewerId) : undefined
      return {
        paper, subjects: paperSubjects(paper), reviewer,
        kind: reviewer ? reviewerKindOf(reviewer, paper.journal) : undefined,
        reminders: reminders[paper.id] ?? { count: 0 },
        reviewsReceived: reviews.filter((r) => r.paperId === paper.id).length,
        outsideInHouse: candidatesFor(paper, users, flagOn).outside,
      }
    })
    .sort((a, b) => (a.paper.reviewDue ?? 'z').localeCompare(b.paper.reviewDue ?? 'z'))
  return delay(rows)
}

export async function assignReviewer(args: { paperIds: string[]; reviewerId: string; due: string; note?: string; reassign?: boolean }) {
  await delay(null)
  const reviewer = findUser(args.reviewerId)
  if (!reviewer) throw new ApiError('Reviewer not found.', 'not_found')
  const { users } = useDataStore.getState()
  const flagOn = useSession.getState().flags.reviewPanel
  const { reminders, patch } = useEditorialStore.getState()
  const assigned: string[] = []
  const skipped: string[] = []
  const nextReminders = { ...reminders }
  for (const id of args.paperIds) {
    const p = rawPaper(id)
    const c = candidatesFor(p, users, flagOn)
    const ok = [...c.inHouse, ...c.panel].some((x) => x.user.id === reviewer.id)
    if (!ok || !['submitted', 'screening', 'under_review', 'decision_pending'].includes(p.status)) { skipped.push(id); continue }
    const kind = reviewerKindOf(reviewer, p.journal)
    const previous = p.reviewerId ? userName(p.reviewerId, users) : undefined
    updatePaper(id, { reviewerId: reviewer.id, reviewDue: new Date(args.due).toISOString(), status: 'under_review' }, {
      event: previous && previous !== reviewer.name
        ? `reassigned the review from ${previous} to ${reviewer.name} (${kind === 'panel' ? 'Review Panel' : 'in-house'}), due ${formatDate(args.due)}`
        : `assigned ${reviewer.name} (${kind === 'panel' ? 'Review Panel Member' : 'in-house reviewer'}) as reviewer, due ${formatDate(args.due)}`,
      note: args.note || undefined,
    })
    recordAudit({ journal: p.journal, action: args.reassign ? 'Reviewer reassigned' : 'Reviewer assigned', target: id, oldValue: previous ?? 'None', newValue: reviewer.name })
    sendMessage({ journal: p.journal, paperId: id, recipient: reviewer.email, channel: 'email', template: 'Review assigned', status: 'queued' })
    nextReminders[id] = { count: 0 }
    assigned.push(id)
  }
  patch({ reminders: nextReminders })
  return { reviewer, assigned, skipped }
}

export async function setReviewDue(paperId: string, due: string, reason: string) {
  await delay(null)
  const p = rawPaper(paperId)
  updatePaper(paperId, { reviewDue: new Date(due).toISOString() }, { event: `set the review due date to ${formatDate(due)}`, note: reason || undefined })
  recordAudit({ journal: p.journal, action: 'Review due date changed', target: paperId, oldValue: p.reviewDue ? formatDate(p.reviewDue) : 'None', newValue: formatDate(due) })
}

export async function sendReviewReminder(paperId: string) {
  await delay(null, 200, 500)
  const p = rawPaper(paperId)
  const reviewer = p.reviewerId ? findUser(p.reviewerId) : undefined
  if (!reviewer) throw new ApiError('No reviewer is assigned to this paper yet.', 'invalid')
  sendMessage({ journal: p.journal, paperId, recipient: reviewer.email, channel: 'email', template: 'Review reminder', status: 'queued' })
  const { reminders, patch } = useEditorialStore.getState()
  const count = (reminders[paperId]?.count ?? 0) + 1
  patch({ reminders: { ...reminders, [paperId]: { count, lastAt: new Date().toISOString() } } })
  logEvent(paperId, `sent review reminder #${count} to ${reviewer.name}`)
  recordAudit({ journal: p.journal, action: 'Review reminder sent', target: paperId, newValue: `#${count} to ${reviewer.name}` })
  return { reviewer, count }
}

/* ------------------------------------------------------------------ */
/* Reviewer side                                                        */
/* ------------------------------------------------------------------ */
export interface MyReviewRow {
  paper: Paper
  submitted?: ReviewRecord
  hasDraft: boolean
}

/** Who the paper is assigned to: the shared seed's reviewer, or an external panel member mapped at read time. */
export function reviewerOf(p: Paper): string | undefined {
  const panel = useEditorialStore.getState().panelOverrides[p.id]
  return panel && p.status !== 'screening' ? panel : p.reviewerId
}

export function listMyReviews(userId: string, journals: JournalCode[]) {
  sweepOverdueReviews()
  const { papers } = useDataStore.getState()
  const { reviews, drafts } = useEditorialStore.getState()
  const rows = papers
    .filter((p) => reviewerOf(p) === userId && journals.includes(p.journal))
    .map<MyReviewRow>((paper) => ({
      paper,
      submitted: reviews.filter((r) => r.paperId === paper.id && r.reviewerId === userId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0],
      hasDraft: !!drafts[draftKey(paper.id, userId)],
    }))
    .sort((a, b) => Number(!!a.submitted) - Number(!!b.submitted) || (a.paper.reviewDue ?? 'z').localeCompare(b.paper.reviewDue ?? 'z'))
  return delay(rows)
}

export function listMyReviewHistory(userId: string, journals: JournalCode[]) {
  const { papers } = useDataStore.getState()
  const rows = useEditorialStore
    .getState()
    .reviews.filter((r) => r.reviewerId === userId && journals.includes(r.journal))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((review) => ({ review, title: papers.find((p) => p.id === review.paperId)?.title ?? review.paperId }))
  return delay(rows)
}

/** Everything a reviewer may see about a paper. Authors are never included (double-blind). */
export interface ReviewWorkspace {
  paperId: string
  journal: JournalCode
  title: string
  articleType: string
  submittedAt: string
  status: Paper['status']
  reviewDue?: string
  abstract: string
  keywords: string[]
  subjects: string[]
  wordCount: number
  manuscript?: FileVersion
  submitted?: ReviewRecord
  draft?: ReviewDraft
  reviewerKind: ReviewerKind
}

export async function getReviewWorkspace(paperId: string, userId: string, journals: JournalCode[]): Promise<ReviewWorkspace> {
  await delay(null)
  const p = useDataStore.getState().papers.find((x) => x.id === paperId)
  if (!p || reviewerOf(p) !== userId || !journals.includes(p.journal)) throw new ApiError('This paper is not assigned to you.', 'forbidden')
  const { reviews, drafts, files } = useEditorialStore.getState()
  const user = findUser(userId)
  return {
    paperId, journal: p.journal, title: p.title, articleType: p.articleType, submittedAt: p.submittedAt, status: p.status, reviewDue: p.reviewDue,
    abstract: abstractFor(p), keywords: keywordsFor(p), subjects: paperSubjects(p), wordCount: wordCountFor(p),
    manuscript: (files[paperId] ?? []).find((f) => f.kind === 'manuscript'),
    submitted: reviews.filter((r) => r.paperId === paperId && r.reviewerId === userId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0],
    draft: drafts[draftKey(paperId, userId)],
    reviewerKind: reviewerKindOf(user, p.journal),
  }
}

export function saveReviewDraft(paperId: string, userId: string, draft: Omit<ReviewDraft, 'savedAt'>) {
  const { drafts, patch } = useEditorialStore.getState()
  patch({ drafts: { ...drafts, [draftKey(paperId, userId)]: { ...draft, savedAt: new Date().toISOString() } } })
}

export interface ReviewSubmission {
  scores: ReviewScores
  commentsToAuthor: string
  commentsToEditor: string
  recommendation: Recommendation
}

export async function submitReview(paperId: string, userId: string, values: ReviewSubmission): Promise<ReviewRecord> {
  await delay(null, 500, 900)
  const p = rawPaper(paperId)
  const user = findUser(userId)
  if (!user || reviewerOf(p) !== userId) throw new ApiError('This paper is not assigned to you.', 'forbidden')
  const { reviews, drafts, patch } = useEditorialStore.getState()
  const record: ReviewRecord = {
    id: `rev-${paperId}-${Date.now().toString(36)}`, paperId, journal: p.journal, reviewerId: userId, reviewerName: user.name,
    reviewerKind: reviewerKindOf(user, p.journal), round: reviews.filter((r) => r.paperId === paperId && r.reviewerId === userId).length + 1,
    ...values, submittedAt: new Date().toISOString(),
  }
  const rest = { ...drafts }
  delete rest[draftKey(paperId, userId)]
  patch({ reviews: [record, ...reviews], drafts: rest })
  const moved = p.status === 'under_review'
  updatePaper(paperId, moved ? { status: 'decision_pending' } : {}, {
    event: `submitted a review report — ${recommendationMeta(values.recommendation).label}${moved ? '; paper is ready for an editorial decision' : ''}`,
  })
  recordAudit({ journal: p.journal, action: 'Review submitted', target: paperId, oldValue: p.status, newValue: moved ? 'decision_pending' : p.status })
  return record
}

/* ------------------------------------------------------------------ */
/* Reviewer: read-only views                                            */
/* ------------------------------------------------------------------ */
export type PanelAssignmentStatus = 'assigned' | 'in_review' | 'submitted'

export interface ReviewAssignmentRow {
  paperId: string
  journal: JournalCode
  title: string
  subjects: string[]
  panelMemberId: string
  panelMemberName: string
  status: PanelAssignmentStatus
  due?: string
  reminders: ReminderState
}

const DAY = 86_400_000

/** Papers the Editor assigned to external Review Panel Members in the reviewer's journals. No author identity. */
export async function listReviewAssignments(journals: JournalCode[]): Promise<ReviewAssignmentRow[]> {
  sweepOverdueReviews()
  await delay(null)
  const { papers, users } = useDataStore.getState()
  const { reviews, drafts, reminders } = useEditorialStore.getState()
  const rows: ReviewAssignmentRow[] = []
  for (const p of papers) {
    const rid = reviewerOf(p)
    const member = rid ? users.find((u) => u.id === rid) : undefined
    if (!member || reviewerKindOf(member, p.journal) !== 'panel' || !journals.includes(p.journal)) continue
    const submitted = reviews.some((r) => r.paperId === p.id && r.reviewerId === member.id)
    const started = !!drafts[draftKey(p.id, member.id)] || (reminders[p.id]?.count ?? 0) > 0
    const status: PanelAssignmentStatus = submitted || !['screening', 'under_review'].includes(p.status) ? 'submitted' : p.status === 'under_review' && started ? 'in_review' : 'assigned'
    rows.push({
      paperId: p.id, journal: p.journal, title: p.title, subjects: paperSubjects(p), panelMemberId: member.id, panelMemberName: member.name, status,
      due: p.reviewDue ?? new Date(new Date(p.submittedAt).getTime() + 21 * DAY).toISOString(), reminders: reminders[p.id] ?? { count: 0 },
    })
  }
  const rank: Record<PanelAssignmentStatus, number> = { assigned: 0, in_review: 1, submitted: 2 }
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.due ?? '').localeCompare(b.due ?? ''))
}

export interface SubjectSubmissionRow {
  paperId: string
  journal: JournalCode
  title: string
  articleType: string
  status: Paper['status']
  submittedAt: string
  subjects: string[]
  matched: string[]
}

/** Read-only list of submissions in the reviewer's journals that match their expertise. Behind the reviewerSeesAll flag. */
export async function listSubjectSubmissions(userId: string, journals: JournalCode[]): Promise<SubjectSubmissionRow[]> {
  await delay(null)
  if (!useSession.getState().flags.reviewerSeesAll) return []
  const expertise = EXPERTISE[userId] ?? []
  return useDataStore.getState().papers
    .filter((p) => journals.includes(p.journal))
    .map((p) => ({ p, m: matchScore(paperSubjects(p), expertise) }))
    .filter((x) => x.m.matched.length > 0)
    .map<SubjectSubmissionRow>(({ p, m }) => ({
      paperId: p.id, journal: p.journal, title: p.title, articleType: p.articleType, status: p.status, submittedAt: p.submittedAt, subjects: paperSubjects(p), matched: m.matched,
    }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
}

/* ------------------------------------------------------------------ */
/* Reviewer: assign external Review Panel Members, auto-reassign         */
/* ------------------------------------------------------------------ */
export interface ExternalCandidate { user: StaffUser; matched: string[]; expertise: string[]; score: number; workload: number }

/** Active Review Panel Members of the journal, best subject match first. */
export function externalCandidates(paperId: string): ExternalCandidate[] {
  const p = rawPaper(paperId)
  const { users, papers } = useDataStore.getState()
  const subjects = paperSubjects(p)
  return users
    .filter((u) => u.status === 'ACTIVE' && u.assignments[p.journal] === 'REVIEW_PANEL_MEMBER')
    .map((user) => {
      const m = matchScore(subjects, EXPERTISE[user.id])
      const workload = papers.filter((x) => reviewerOf(x) === user.id && x.status === 'under_review').length
      return { user, matched: m.matched, expertise: EXPERTISE[user.id] ?? [], score: m.score, workload }
    })
    .sort((a, b) => b.score - a.score || a.workload - b.workload)
}

function giveToPanelMember(p: Paper, reviewerId: string, due: Date, event: string, note?: string) {
  const { panelOverrides, reminders, autoReassigned, patch } = useEditorialStore.getState()
  patch({
    panelOverrides: { ...panelOverrides, [p.id]: reviewerId },
    reminders: { ...reminders, [p.id]: { count: 0 } },
    autoReassigned: { ...autoReassigned, [p.id]: [...new Set([...(autoReassigned[p.id] ?? []), reviewerId])] },
  })
  updatePaper(p.id, { reviewerId, reviewDue: due.toISOString(), status: 'under_review' }, { event, note })
  const member = findUser(reviewerId)
  if (member) sendMessage({ journal: p.journal, paperId: p.id, recipient: member.email, channel: 'email', template: 'Review assigned', status: 'queued' })
}

/** The reviewer sends a paper to an external Review Panel Member with a due date. */
export async function assignExternalReviewer(args: { paperId: string; reviewerId: string; due: string; note?: string }) {
  await delay(null)
  const p = rawPaper(args.paperId)
  const member = findUser(args.reviewerId)
  if (!member || member.assignments[p.journal] !== 'REVIEW_PANEL_MEMBER' || member.status !== 'ACTIVE') throw new ApiError('Choose an active Review Panel Member of this journal.', 'invalid')
  if (!['submitted', 'screening', 'under_review', 'decision_pending'].includes(p.status)) throw new ApiError('This paper is no longer in review.', 'invalid')
  const due = new Date(args.due)
  if (Number.isNaN(due.getTime()) || due.getTime() < new Date(new Date().toDateString()).getTime()) throw new ApiError('Choose a due date that is today or later.', 'invalid')
  const previous = reviewerOf(p)
  giveToPanelMember(p, member.id, due,
    previous && previous !== member.id ? `reassigned the review from ${userName(previous, useDataStore.getState().users)} to ${member.name} (Review Panel Member), due ${formatDate(args.due)}` : `assigned ${member.name} (Review Panel Member) as reviewer, due ${formatDate(args.due)}`, args.note || undefined)
  recordAudit({ journal: p.journal, action: previous ? 'Reviewer reassigned' : 'Reviewer assigned', target: p.id, oldValue: previous ? userName(previous, useDataStore.getState().users) : 'None', newValue: member.name })
  const withdrawn = previous && previous !== member.id ? findUser(previous) : undefined
  if (withdrawn) sendMessage({ journal: p.journal, paperId: p.id, recipient: withdrawn.email, channel: 'email', template: 'Review assignment withdrawn', status: 'queued' })
  return member
}

/** Overdue panel reviews with no report go to another matching Review Panel Member automatically. */
export function sweepOverdueReviews() {
  const { papers, users } = useDataStore.getState()
  const { reviews, autoReassigned } = useEditorialStore.getState()
  const today = new Date(new Date().toDateString()).getTime()
  for (const p of papers) {
    if (p.status !== 'under_review' || !p.reviewDue || new Date(p.reviewDue).getTime() >= today) continue
    const rid = reviewerOf(p)
    const current = rid ? users.find((u) => u.id === rid) : undefined
    if (!current || reviewerKindOf(current, p.journal) !== 'panel') continue
    if (reviews.some((r) => r.paperId === p.id && r.reviewerId === current.id)) continue
    const tried = new Set([...(autoReassigned[p.id] ?? []), current.id])
    const pool = externalCandidates(p.id)
    const next = pool.find((c) => !tried.has(c.user.id)) ?? pool.find((c) => c.user.id !== current.id) ?? pool[0]
    if (!next) continue
    giveToPanelMember(p, next.user.id, new Date(Date.now() + 14 * DAY),
      next.user.id === current.id ? `auto-assigned the review to ${next.user.name} again; no report was submitted by the due date` : `auto-reassigned the review from ${current.name} to ${next.user.name}; no report was submitted by the due date`)
    recordAudit({ journal: p.journal, action: 'Review auto-reassigned', target: p.id, oldValue: current.name, newValue: next.user.name })
  }
}

export const assignmentMetaOf = (paperId: string, userId?: string): AssignmentMeta =>
  (userId && useEditorialStore.getState().assignmentMeta[draftKey(paperId, userId)]) || { state: 'open', result: 'not_set' }

export async function setAssignmentMeta(paperId: string, userId: string, patch: Partial<{ state: AssignmentState; result: AssignmentResult }>) {
  const { assignmentMeta, patch: set } = useEditorialStore.getState()
  const key = draftKey(paperId, userId)
  const next = { ...assignmentMetaOf(paperId, userId), ...patch }
  set({ assignmentMeta: { ...assignmentMeta, [key]: next } })
  const p = rawPaper(paperId)
  recordAudit({ journal: p.journal, action: patch.state ? 'Review assignment status changed' : 'Review assignment result changed', target: paperId, newValue: String(patch.state ?? patch.result) })
  await delay(null, 100, 250)
}

export interface AllSubmissionRow {
  paperId: string
  journal: JournalCode
  title: string
  subjects: string[]
  matched: string[]
  status: Paper['status']
  submittedAt: string
  panelMemberId?: string
  panelMemberName?: string
  due?: string
  autoReassigned: number
}

const OPEN_FOR_REVIEW: Paper['status'][] = ['submitted', 'screening', 'under_review', 'decision_pending']

/** Every article in the reviewer's journals that is awaiting or in review, with its external reviewer if one is assigned. */
export async function listAllSubmissions(userId: string, journals: JournalCode[]): Promise<AllSubmissionRow[]> {
  sweepOverdueReviews()
  await delay(null)
  const { papers, users } = useDataStore.getState()
  const { autoReassigned } = useEditorialStore.getState()
  const expertise = EXPERTISE[userId] ?? []
  return papers
    .filter((p) => journals.includes(p.journal) && OPEN_FOR_REVIEW.includes(p.status))
    .map<AllSubmissionRow>((p) => {
      const rid = reviewerOf(p)
      const member = rid ? users.find((u) => u.id === rid) : undefined
      const external = member && reviewerKindOf(member, p.journal) === 'panel' ? member : undefined
      return {
        paperId: p.id, journal: p.journal, title: p.title, subjects: paperSubjects(p), matched: matchScore(paperSubjects(p), expertise).matched, status: p.status, submittedAt: p.submittedAt,
        panelMemberId: external?.id, panelMemberName: external?.name, due: external ? p.reviewDue : undefined, autoReassigned: Math.max(0, (autoReassigned[p.id]?.length ?? 0) - (external ? 1 : 0)),
      }
    })
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
}
