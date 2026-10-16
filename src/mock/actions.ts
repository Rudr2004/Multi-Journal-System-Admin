import type { Author, AuditEntry, Channel, JournalCode, MessageLogEntry, Paper, PaperEvent, PaperStatus } from '@/shared/types'
import { doiFor } from '@/shared/paperId'
import { generatedAuthors } from './data/authors'
import { savePaperOverride, useDataStore, useSession } from './store'

let seq = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`

export const currentActor = () => {
  const { userId } = useSession.getState()
  return useDataStore.getState().users.find((u) => u.id === userId)?.name ?? 'System'
}

/** Add a line to a paper's timeline (and the global activity feed). */
export function logEvent(paperId: string, text: string, note?: string, actor = currentActor()) {
  const { papers, events, activity, patch } = useDataStore.getState()
  const paper = papers.find((p) => p.id === paperId)
  const at = new Date().toISOString()
  const ev: PaperEvent = { id: newId('ev'), paperId, at, actor, text, note }
  patch({
    events: [ev, ...events],
    activity: paper ? [{ id: newId('act'), journal: paper.journal, at, actor, text, paperId }, ...activity] : activity,
  })
}

/** Append an audit-log entry (who / what / old → new). Call from every mutation. */
export function recordAudit(e: Omit<AuditEntry, 'id' | 'at' | 'actor'> & { actor?: string }) {
  const { audit, patch } = useDataStore.getState()
  patch({ audit: [{ id: newId('aud'), at: new Date().toISOString(), actor: e.actor ?? currentActor(), ...e }, ...audit] })
}

/** Patch a paper in the shared store, optionally writing a timeline event and an audit entry. */
export function updatePaper(id: string, patch: Partial<Paper>, opts?: { event?: string; note?: string; audit?: string }) {
  const { papers, patch: set } = useDataStore.getState()
  const before = papers.find((p) => p.id === id)
  if (!before) return
  const updatedAt = new Date().toISOString()
  set({ papers: papers.map((p) => (p.id === id ? { ...p, ...patch, updatedAt } : p)) })
  savePaperOverride(id, { ...patch, updatedAt })
  if (opts?.event) logEvent(id, opts.event, opts.note)
  if (opts?.audit) recordAudit({ journal: before.journal, action: opts.audit, target: id, oldValue: patch.status ? before.status : undefined, newValue: patch.status })
}

export const setPaperStatus = (id: string, status: PaperStatus, event: string, note?: string) =>
  updatePaper(id, { status }, { event, note, audit: `Status changed to ${status}` })

/** Record an outgoing message in the communication log. */
export function sendMessage(m: { journal: JournalCode; paperId?: string; recipient: string; channel: Channel; template: string; status?: MessageLogEntry['status'] }) {
  const { messages, patch } = useDataStore.getState()
  patch({ messages: [{ id: newId('msg'), at: new Date().toISOString(), status: 'queued', ...m }, ...messages] })
}

/** Production stages that count towards an Associate Editor's workload. */
const OPEN_PRODUCTION: PaperStatus[] = ['paid', 'in_production', 'returned_to_production', 'ready_for_approval']

/** Active Associate Editors who hold that role in this journal. */
export function journalAssociateEditors(journal: JournalCode) {
  return useDataStore.getState().users.filter((u) => u.status === 'active' && u.assignments[journal] === 'associate_editor')
}

/** How many manuscripts an Associate Editor is working on right now. */
export function associateWorkload(userId: string): number {
  return useDataStore.getState().papers.filter((p) => p.assigneeId === userId && OPEN_PRODUCTION.includes(p.status)).length
}

/** The Associate Editor with the lightest workload for a journal (first listed wins a tie). */
export function productionAssigneeFor(journal: JournalCode): string | undefined {
  const list = journalAssociateEditors(journal)
  if (list.length === 0) return undefined
  return [...list].sort((a, b) => associateWorkload(a.id) - associateWorkload(b.id))[0].id
}

/** Same, but only when the Editor has switched "Auto-assign Associate Editor" on for the journal. */
export function autoAssigneeFor(journal: JournalCode): string | undefined {
  return useDataStore.getState().autoAssignAe[journal] === false ? undefined : productionAssigneeFor(journal)
}

/** Authors of a paper: edited list if a correction was made, otherwise the generated one. */
export function getAuthors(paperId: string): Author[] {
  const { papers, authorsOverride } = useDataStore.getState()
  const p = papers.find((x) => x.id === paperId)
  return authorsOverride[paperId] ?? (p ? generatedAuthors(p) : [])
}

/** Queue a Crossref deposit for a paper (a re-deposit bumps the version). */
export function addDeposit(paperId: string, status: 'pending' | 'success' | 're_deposited' = 'success') {
  const { papers, deposits, patch } = useDataStore.getState()
  const p = papers.find((x) => x.id === paperId)
  if (!p) return
  const version = Math.max(0, ...deposits.filter((d) => d.paperId === paperId).map((d) => d.version)) + 1
  patch({ deposits: [{ id: newId('dep'), paperId, journal: p.journal, doi: doiFor(paperId), status, version, at: new Date().toISOString() }, ...deposits] })
}
