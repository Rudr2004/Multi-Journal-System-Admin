import type { Author, JournalCode, MessageLogEntry, Paper, StaffUser } from '@/shared/types'
import { formatDate, formatTime } from '@/shared/formatters'
import type { Level } from '@/permissions/matrix'
import { currentActor, getAuthors, logEvent, recordAudit, sendMessage, updatePaper } from '../actions'
import { nextDispatch } from '../data/papers'
import {
  abstractFor, conferenceFor, decisionEmail, keywordsFor, mentorFor, paperSubjects, referralFor, wordCountFor,
  type DecisionKind, type DecisionRecord, type FileVersion,
} from '../data/editorial'
import { useDataStore } from '../store'
import { useEditorialStore } from '../stores/editorial'
import { ApiError, delay } from './latency'

export interface AccessCtx {
  journals: JournalCode[]
  userId: string
  level: Level
}

/** "Work on" level only sees papers assigned to the user; broader levels see every paper in scope. */
const visible = (p: Paper, ctx: AccessCtx) => ctx.journals.includes(p.journal) && (ctx.level !== 'work' || p.assigneeId === ctx.userId)

const rawPaper = (id: string) => {
  const p = useDataStore.getState().papers.find((x) => x.id === id)
  if (!p) throw new ApiError(`Paper ${id} was not found.`, 'not_found')
  return p
}

export interface SubmissionRow extends Paper {
  conference: string
  subjects: string[]
}

export const listSubmissions = (ctx: AccessCtx) =>
  delay(
    useDataStore
      .getState()
      .papers.filter((p) => visible(p, ctx))
      .map<SubmissionRow>((p) => ({ ...p, conference: conferenceFor(p), subjects: paperSubjects(p) }))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
  )

export interface PaperDetail {
  paperId: string
  abstract: string
  keywords: string[]
  subjects: string[]
  authors: Author[]
  mentor?: string
  referral?: { code: string; referrer: string }
  conference: string
  wordCount: number
}

export async function getPaperDetail(paperId: string, ctx: AccessCtx): Promise<PaperDetail> {
  const p = useDataStore.getState().papers.find((x) => x.id === paperId)
  if (!p || !visible(p, ctx)) {
    await delay(null)
    throw new ApiError(p ? 'You do not have access to this paper.' : `Paper ${paperId} was not found.`, p ? 'forbidden' : 'not_found')
  }
  return delay({
    paperId, abstract: abstractFor(p), keywords: keywordsFor(p), subjects: paperSubjects(p), authors: getAuthors(paperId),
    mentor: mentorFor(p), referral: referralFor(p), conference: conferenceFor(p), wordCount: wordCountFor(p),
  })
}

/** Staff who can be made responsible for a paper (production assignee). */
export const listAssignees = (journals: JournalCode[]) =>
  delay(
    useDataStore.getState().users.filter((u) => u.status === 'active' && journals.some((j) => u.assignments[j] === 'associate_editor')),
    120, 260,
  )

export async function assignAssignee(paperIds: string[], assigneeId: string): Promise<StaffUser> {
  await delay(null)
  const user = useDataStore.getState().users.find((u) => u.id === assigneeId)
  if (!user) throw new ApiError('Assignee not found.', 'not_found')
  const eligible = paperIds.map(rawPaper).filter((p) => user.assignments[p.journal] === 'associate_editor')
  if (eligible.length === 0) throw new ApiError(`${user.name} is not an Associate Editor for the selected papers’ journals.`, 'invalid')
  for (const p of eligible) {
    updatePaper(p.id, { assigneeId }, { event: `assigned ${user.name} as responsible Associate Editor` })
    recordAudit({ journal: p.journal, action: 'Assignee changed', target: p.id, oldValue: p.assigneeId ?? 'Unassigned', newValue: user.name })
  }
  return user
}

export async function startScreening(paperId: string) {
  await delay(null)
  const p = rawPaper(paperId)
  if (p.status !== 'submitted') throw new ApiError('Only newly submitted papers can be moved to screening.', 'invalid')
  updatePaper(paperId, { status: 'screening' }, { event: 'started screening', audit: 'Status changed to screening' })
  return rawPaper(paperId)
}

export type DecisionAction = 'approve' | 'approve_no_review' | 'quick_approve' | 'changes' | 'reject'

const ACTION_KIND: Record<DecisionAction, DecisionKind> = {
  approve: 'accepted', quick_approve: 'accepted', approve_no_review: 'accepted_without_review', changes: 'changes_requested', reject: 'rejected',
}

/** Record an editorial decision: status, timeline, audit, decision history and the (queued) author email. */
export async function decidePaper(paperId: string, action: DecisionAction, reason: string) {
  await delay(null)
  const before = rawPaper(paperId)
  const kind = ACTION_KIND[action]
  const store = useEditorialStore.getState()
  const accepted = kind === 'accepted' || kind === 'accepted_without_review'
  const dispatchAt = accepted ? nextDispatch().toISOString() : undefined
  const mail = decisionEmail(kind, before, reason, dispatchAt)

  const decision: DecisionRecord = {
    id: `dec-${paperId}-${Date.now().toString(36)}`, paperId, kind, reason, by: currentActor(), at: new Date().toISOString(),
    round: store.decisions.filter((d) => d.paperId === paperId).length + 1,
  }
  store.patch({ decisions: [decision, ...store.decisions] })

  const status = accepted ? 'accepted' : kind === 'rejected' ? 'rejected' : 'changes_requested'
  const eventText = {
    approve: 'approved the paper',
    quick_approve: 'approved the paper using Quick Approve',
    approve_no_review: 'accepted the paper without a review report',
    changes: 'requested changes from the author',
    reject: 'rejected the paper',
  }[action]
  updatePaper(paperId, {
    status,
    ...(accepted ? { dispatchAt, paymentStatus: before.paymentStatus === 'none' ? 'pending' : before.paymentStatus } : {}),
  }, { event: eventText, note: reason })
  recordAudit({
    journal: before.journal,
    action: action === 'approve_no_review' ? 'Accepted without review report' : action === 'quick_approve' ? 'Quick approve' : `Decision: ${kind.replace('_', ' ')}`,
    target: paperId, oldValue: before.status, newValue: status,
  })
  if (accepted && dispatchAt) logEvent(paperId, `queued the acceptance email for the ${formatDate(dispatchAt)} ${formatTime(dispatchAt)} dispatch`, undefined, 'System')
  sendMessage({ journal: before.journal, paperId, recipient: before.authorEmail, channel: 'email', template: mail.template, status: 'queued' })
  return rawPaper(paperId)
}

/** Author uploaded a revised manuscript after "changes requested". */
export async function markRevisionReceived(paperId: string, note: string) {
  await delay(null)
  const p = rawPaper(paperId)
  if (p.status !== 'changes_requested') throw new ApiError('Only papers with changes requested can receive a revision.', 'invalid')
  const { files, patch } = useEditorialStore.getState()
  const existing = files[paperId] ?? []
  const next = Math.max(0, ...existing.filter((f) => f.kind === 'manuscript').map((f) => f.version)) + 1
  const file: FileVersion = {
    id: `file-${paperId}-m${next}`, paperId, version: next, name: `${paperId}_Manuscript_v${next}_revised.docx`, kind: 'manuscript', format: 'docx',
    sizeKb: 420 + (next * 37) % 300, uploadedAt: new Date().toISOString(), note: note || 'Revised after editor comments',
  }
  patch({ files: { ...files, [paperId]: [file, ...existing] } })
  updatePaper(paperId, { status: p.reviewerId ? 'under_review' : 'screening' }, { event: `recorded revised manuscript v${next}`, note: note || undefined, audit: 'Revision received' })
  return rawPaper(paperId)
}

export async function resendMessage(messageId: string) {
  await delay(null)
  const m = useDataStore.getState().messages.find((x) => x.id === messageId)
  if (!m) throw new ApiError('Message not found.', 'not_found')
  sendMessage({ journal: m.journal, paperId: m.paperId, recipient: m.recipient, channel: m.channel, template: m.template, status: 'queued' })
  if (m.paperId) logEvent(m.paperId, `re-queued the “${m.template}” ${m.channel} message to ${m.recipient}`)
  recordAudit({ journal: m.journal, action: 'Message re-queued', target: m.id, oldValue: m.status, newValue: 'queued' })
  return m as MessageLogEntry
}

const csvCell = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`

export function submissionsToCsv(rows: SubmissionRow[]) {
  const head = ['Paper ID', 'Journal', 'Title', 'Author', 'Author email', 'Article type', 'Status', 'Payment', 'Conference', 'Submitted']
  const lines = rows.map((r) => [r.id, r.journal, r.title, r.author, r.authorEmail, r.articleType, r.status, r.paymentStatus, r.conference, formatDate(r.submittedAt)].map(csvCell).join(','))
  return [head.map(csvCell).join(','), ...lines].join('\n')
}

export async function exportSubmissions(rows: SubmissionRow[]) {
  await delay(null, 200, 500)
  recordAudit({ journal: 'ALL', action: 'Exported submissions CSV', target: `${rows.length} rows` })
  return submissionsToCsv(rows)
}
