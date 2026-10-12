import type { JournalCode, StaffUser, Ticket } from '@/shared/types'
import { currentActor, newId, recordAudit } from '../actions'
import { useDataStore, useSession } from '../store'
import type { BoardGroup, FormOutcome, FormStatus, FormSubmission } from '../data/website'
import { useWebsiteStore } from '../stores/website'
import { addBoardMember } from './board'
import { ApiError, delay } from './latency'

const wait = () => delay(null, 250, 600)
const state = () => useWebsiteStore.getState()

export async function listSubmissions(journals: JournalCode[]): Promise<FormSubmission[]> {
  await wait()
  return state().submissions.filter((s) => journals.includes(s.journal)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}

const find = (id: string) => {
  const s = state().submissions.find((x) => x.id === id)
  if (!s) throw new ApiError('This submission no longer exists.', 'not_found')
  return s
}
const put = (id: string, fn: (s: FormSubmission) => FormSubmission) => state().set({ submissions: state().submissions.map((s) => (s.id === id ? fn(s) : s)) })

/** Reject and On hold require a reason; the others do not. */
export const statusNeedsReason = (s: FormStatus) => s === 'rejected' || s === 'on_hold'

export async function setSubmissionStatus(id: string, status: FormStatus, reason?: string): Promise<void> {
  await wait()
  const s = find(id)
  if (statusNeedsReason(status) && !reason?.trim()) throw new ApiError('A reason is required for this status.', 'validation')
  put(id, (x) => ({ ...x, status, history: [...x.history, { id: newId('fh'), at: new Date().toISOString(), actor: currentActor(), status, reason }] }))
  recordAudit({ journal: s.journal, action: 'Changed form submission status', target: `${s.id} — ${s.name}`, oldValue: s.status, newValue: reason ? `${status}: ${reason}` : status })
}

export async function addNote(id: string, text: string): Promise<void> {
  await delay(null, 150, 350)
  find(id)
  put(id, (x) => ({ ...x, notes: [...x.notes, { id: newId('fn'), at: new Date().toISOString(), author: currentActor(), text: text.trim() }] }))
}

const requireApproved = (s: FormSubmission) => {
  if (s.status !== 'approved') throw new ApiError('Approve the submission before taking the next step.', 'validation')
  if (s.outcome) throw new ApiError('The next step for this submission has already been completed.', 'duplicate')
}
const setOutcome = (id: string, outcome: Omit<FormOutcome, 'at'>) => put(id, (x) => ({ ...x, outcome: { ...outcome, at: new Date().toISOString() } }))

/** Become a Reviewer → invited Review Panel Member account for that journal. */
export async function createReviewPanelAccount(id: string): Promise<{ user: StaffUser; inviteLink: string }> {
  await wait()
  const s = find(id)
  requireApproved(s)
  if (!useSession.getState().flags.reviewPanel) throw new ApiError('Review Panel is switched off.', 'feature_off')
  const { users, patch } = useDataStore.getState()
  const existing = users.find((u) => u.email.toLowerCase() === s.email.toLowerCase())
  if (existing) throw new ApiError(`An account for ${s.email} already exists (${existing.name}). Add the role from Users & roles instead.`, 'duplicate')
  const user: StaffUser = {
    id: newId('u'), name: s.name, email: s.email, title: 'Review Panel Member', status: 'invited', twoStep: false,
    assignments: { [s.journal]: 'panel_member' },
  }
  patch({ users: [...users, user] })
  const inviteLink = `${window.location.origin}/set-password?invite=${btoa(user.id).replace(/=+$/, '')}`
  setOutcome(id, { kind: 'account', label: `Review Panel Member account created for ${s.journal} (invited)`, ref: user.id, link: inviteLink })
  recordAudit({ journal: s.journal, action: 'Created Review Panel Member account from reviewer application', target: `${s.name} <${s.email}>`, newValue: 'panel_member (invited)' })
  return { user, inviteLink }
}

/** Editorial Board application → new member in the journal's board. */
export async function addBoardMemberFromSubmission(id: string, group: BoardGroup): Promise<void> {
  await wait()
  const s = find(id)
  requireApproved(s)
  const field = (label: string) => s.fields.find((f) => f.label === label)?.value ?? ''
  const exp = field('Areas of expertise')
  const month = new Date().toISOString().slice(0, 10)
  const m = addBoardMember({
    journal: s.journal, group, name: s.name, designation: group === 'Associate Editors' ? `Associate Editor, ${s.journal}` : `${group === 'Review Board' ? 'Review Board Member' : 'Editorial Board Member'}, ${s.journal}`,
    affiliation: s.affiliation, country: s.country, bio: exp ? `Research interests: ${exp}. ${field('Editorial experience')}`.trim() : '',
    orcid: '', scholar: field('Google Scholar'), scopus: '', termStart: month, termEnd: `${Number(month.slice(0, 4)) + 3}${month.slice(4)}`,
  })
  setOutcome(id, { kind: 'board', label: `Added to the ${s.journal} editorial board as ${group}`, ref: m.id, link: '/editorial-board' })
}

export async function markConferenceHandled(id: string): Promise<void> {
  await wait()
  const s = find(id)
  requireApproved(s)
  setOutcome(id, { kind: 'conference', label: 'Conference record to be created in Conferences', link: '/conferences' })
  recordAudit({ journal: s.journal, action: 'Started conference from collaboration request', target: `${s.id} — ${s.subject}` })
}

export async function convertToTicket(id: string): Promise<Ticket> {
  await wait()
  const s = find(id)
  requireApproved(s)
  const { tickets, patch } = useDataStore.getState()
  const next = Math.max(2399, ...tickets.map((t) => Number(t.id.replace('TKT-', '')) || 0)) + 1
  const ticket: Ticket = {
    id: `TKT-${next}`, journal: s.journal, subject: s.subject, requester: s.name, status: 'open', priority: 'normal',
    createdAt: new Date().toISOString(), dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  }
  patch({ tickets: [ticket, ...tickets] })
  setOutcome(id, { kind: 'ticket', label: `Converted to ticket ${ticket.id}`, ref: ticket.id, link: '/helpdesk' })
  recordAudit({ journal: s.journal, action: 'Converted enquiry to ticket', target: `${s.id} → ${ticket.id}` })
  return ticket
}
