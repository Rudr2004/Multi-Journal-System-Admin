import type { JournalCode, StaffUser } from '@/shared/types'
import { associateWorkload, currentActor, journalAssociateEditors, logEvent, newId, productionAssigneeFor, recordAudit, sendMessage, updatePaper } from '../actions'
import { useDataStore } from '../store'
import { useNotesStore, type EditorNote } from '../stores/notes'
import { ApiError, delay } from './latency'

export interface AssignableEditor { user: StaffUser; workload: number }

/** Associate Editors who hold that role in the journal, with how many manuscripts each is working on. */
export function listAssignableEditors(journal: JournalCode): AssignableEditor[] {
  return journalAssociateEditors(journal).map((user) => ({ user, workload: associateWorkload(user.id) })).sort((a, b) => a.workload - b.workload)
}

const nameOf = (id?: string) => useDataStore.getState().users.find((u) => u.id === id)?.name ?? 'Unassigned'
const dueSoon = () => new Date(Date.now() + 5 * 86_400_000).toISOString()

/** Assign the paper to the Associate Editor with the lightest workload. */
export async function autoAssignPaper(paperId: string) {
  const paper = useDataStore.getState().papers.find((p) => p.id === paperId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  const id = productionAssigneeFor(paper.journal)
  if (!id) throw new ApiError(`No active Associate Editor holds ${paper.journal}. Add one in User Management first.`, 'none')
  updatePaper(paperId, { assigneeId: id, productionDue: paper.productionDue ?? dueSoon() }, { event: `auto-assigned the paper to ${nameOf(id)} (Associate Editor)`, audit: 'Associate Editor auto-assigned' })
  await delay(null, 250, 500)
  return nameOf(id)
}

/** Manually transfer the paper to another Associate Editor, optionally with an instruction for them. */
export async function reassignPaper(paperId: string, userId: string, note?: string) {
  const paper = useDataStore.getState().papers.find((p) => p.id === paperId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  if (!listAssignableEditors(paper.journal).some((e) => e.user.id === userId)) throw new ApiError('Choose an Associate Editor of this journal.', 'invalid')
  if (paper.assigneeId === userId) throw new ApiError(`${nameOf(userId)} already has this paper.`, 'invalid')
  const previous = paper.assigneeId
  updatePaper(paperId, { assigneeId: userId, productionDue: paper.productionDue ?? dueSoon() }, {
    event: previous ? `reassigned the paper from ${nameOf(previous)} to ${nameOf(userId)} (Associate Editor)` : `assigned the paper to ${nameOf(userId)} (Associate Editor)`,
    note: note || undefined, audit: 'Associate Editor reassigned',
  })
  const toName = nameOf(userId)
  const defaultNote = previous ? `Reassigned to you from ${nameOf(previous)} (on leave or unavailable). Please continue production.` : 'Assigned to you for production.'
  writeNote(paperId, paper.journal, note?.trim() || defaultNote)
  void toName
  sendMessage({ journal: paper.journal, paperId, recipient: useDataStore.getState().users.find((u) => u.id === userId)?.email ?? 'associate editor', channel: 'email', template: 'Manuscript assigned to you' })
  await delay(null, 250, 500)
}

/** Switch automatic assignment of paid articles on or off for a journal. */
export async function setAutoAssign(journal: JournalCode, on: boolean) {
  const { autoAssignAe, patch } = useDataStore.getState()
  patch({ autoAssignAe: { ...autoAssignAe, [journal]: on } })
  recordAudit({ journal, action: on ? 'Auto-assign Associate Editor turned on' : 'Auto-assign Associate Editor turned off', target: journal, oldValue: on ? 'off' : 'on', newValue: on ? 'on' : 'off' })
  await delay(null, 150, 300)
}

function writeNote(paperId: string, journal: JournalCode, text: string): EditorNote {
  const note: EditorNote = { id: newId('note'), paperId, journal, text, by: currentActor(), at: new Date().toISOString() }
  const { notes, patch } = useNotesStore.getState()
  patch({ notes: { ...notes, [paperId]: [note, ...(notes[paperId] ?? [])] } })
  return note
}

/** An editing instruction from the Editor; the Associate Editor sees it under the Paper ID on their dashboard. */
export async function addEditorNote(paperId: string, text: string) {
  const paper = useDataStore.getState().papers.find((p) => p.id === paperId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  if (text.trim().length < 5) throw new ApiError('Write the instruction (at least 5 characters).', 'invalid')
  const note = writeNote(paperId, paper.journal, text.trim())
  logEvent(paperId, `added a note for the Associate Editor`, note.text)
  recordAudit({ journal: paper.journal, action: 'Note added for Associate Editor', target: paperId, newValue: note.text })
  await delay(null, 200, 450)
  return note
}
