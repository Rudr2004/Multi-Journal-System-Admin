import type { JournalCode } from '@/shared/types'
import { currentActor, getAuthors, newId, recordAudit } from '../actions'
import { CYCLE_LABEL, type AwardCycle, type AwardType, type CycleStatus, type Nomination } from '../data/website'
import { useDataStore } from '../store'
import { useWebsiteStore } from '../stores/website'
import { ApiError, delay } from './latency'

const wait = () => delay(null, 250, 600)
const state = () => useWebsiteStore.getState()

export interface CandidateFlag {
  kind: 'awarded' | 'shortlisted'
  /** true when it is the same paper, false when only the same author */
  samePaper: boolean
  cycleId: string
  cycleName: string
}

export interface Candidate {
  key: string
  name: string
  email: string
  affiliation: string
  country: string
  paperId?: string
  title: string
  paperIds: string[]
  publishedOn: string
  flags: CandidateFlag[]
}

const ELIGIBLE = ['published', 'indexed', 'corrected']

export async function listCycles(journals: JournalCode[]): Promise<AwardCycle[]> {
  await wait()
  return state().cycles.filter((c) => journals.includes(c.journal)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getCycle(id: string): Promise<AwardCycle> {
  await wait()
  const c = state().cycles.find((x) => x.id === id)
  if (!c) throw new ApiError('This award cycle no longer exists.', 'not_found')
  return c
}

const put = (id: string, fn: (c: AwardCycle) => AwardCycle) => state().set({ cycles: state().cycles.map((c) => (c.id === id ? fn(c) : c)) })
const find = (id: string) => {
  const c = state().cycles.find((x) => x.id === id)
  if (!c) throw new ApiError('This award cycle no longer exists.', 'not_found')
  return c
}

export interface CycleInput { journal: JournalCode; type: AwardType; name: string; periodStart: string; periodEnd: string; criteria: string }

export async function createCycle(input: CycleInput): Promise<AwardCycle> {
  await wait()
  const cycle: AwardCycle = { ...input, id: newId('cyc'), status: 'draft', nominations: [], createdAt: new Date().toISOString(), createdBy: currentActor() }
  state().set({ cycles: [cycle, ...state().cycles] })
  recordAudit({ journal: cycle.journal, action: 'Created award cycle', target: cycle.name })
  return cycle
}

export async function updateCycle(id: string, input: Omit<CycleInput, 'journal' | 'type'>): Promise<void> {
  await wait()
  const c = find(id)
  put(id, (x) => ({ ...x, ...input }))
  recordAudit({ journal: c.journal, action: 'Edited award cycle', target: input.name })
}

export async function deleteCycle(id: string): Promise<void> {
  await wait()
  const c = find(id)
  if (c.status !== 'draft') throw new ApiError('Only draft cycles can be deleted.', 'validation')
  state().set({ cycles: state().cycles.filter((x) => x.id !== id) })
  recordAudit({ journal: c.journal, action: 'Deleted award cycle', target: c.name })
}

/** When a paper went live: its issue's publication date, else its last update. */
function publishedOn(paperId: string): string {
  const { issues, papers } = useDataStore.getState()
  const issue = issues.find((i) => i.articleIds.includes(paperId) && i.status === 'published')
  return (issue?.publicationDate ?? papers.find((p) => p.id === paperId)?.updatedAt ?? '').slice(0, 10)
}

/** Published papers (or their authors) in the period, flagged when already shortlisted/awarded in another cycle. */
export function computeCandidates(cycle: AwardCycle): Candidate[] {
  const { papers } = useDataStore.getState()
  const others = state().cycles.filter((c) => c.id !== cycle.id)
  const inPeriod = papers.filter((p) => {
    if (p.journal !== cycle.journal || !ELIGIBLE.includes(p.status)) return false
    const on = publishedOn(p.id)
    return on >= cycle.periodStart && on <= cycle.periodEnd
  })

  const flagsFor = (email: string, paperId?: string): CandidateFlag[] => {
    const out: CandidateFlag[] = []
    for (const c of others) {
      for (const n of c.nominations) {
        const samePaper = !!paperId && n.paperId === paperId
        if (!samePaper && n.email.toLowerCase() !== email.toLowerCase()) continue
        const awarded = n.winner && (c.status === 'approved' || c.status === 'published')
        out.push({ kind: awarded ? 'awarded' : 'shortlisted', samePaper, cycleId: c.id, cycleName: c.name })
      }
    }
    // same-paper flags first, then one flag per cycle
    return out.sort((a, b) => Number(b.samePaper) - Number(a.samePaper)).filter((f, i, arr) => arr.findIndex((x) => x.cycleId === f.cycleId) === i)
  }

  if (cycle.type === 'best_paper') {
    return inPeriod.map((p) => ({
      key: p.id, name: p.author, email: p.authorEmail, country: p.authorCountry, paperId: p.id, title: p.title, paperIds: [p.id],
      affiliation: getAuthors(p.id)[0]?.affiliation ?? '', publishedOn: publishedOn(p.id), flags: flagsFor(p.authorEmail, p.id),
    })).sort((a, b) => b.publishedOn.localeCompare(a.publishedOn))
  }
  const byAuthor = new Map<string, Candidate>()
  for (const p of inPeriod) {
    for (const a of getAuthors(p.id)) {
      const key = a.email.toLowerCase()
      const cur = byAuthor.get(key)
      if (cur) { cur.paperIds.push(p.id); if (p.id && publishedOn(p.id) > cur.publishedOn) cur.publishedOn = publishedOn(p.id) }
      else byAuthor.set(key, { key, name: a.name, email: a.email, country: a.country, affiliation: a.affiliation, title: '', paperIds: [p.id], publishedOn: publishedOn(p.id), flags: flagsFor(a.email) })
    }
  }
  return [...byAuthor.values()]
    .map((c) => ({ ...c, title: `${c.paperIds.length} published ${c.paperIds.length === 1 ? 'paper' : 'papers'} in the period` }))
    .sort((a, b) => b.paperIds.length - a.paperIds.length || a.name.localeCompare(b.name))
}

export async function listCandidates(cycleId: string): Promise<Candidate[]> {
  await wait()
  return computeCandidates(find(cycleId))
}

const editable = (c: AwardCycle) => c.status === 'nominations' || c.status === 'shortlisting'

export async function addToShortlist(cycleId: string, candidate: Candidate): Promise<void> {
  await wait()
  const c = find(cycleId)
  if (!editable(c)) throw new ApiError('The shortlist can only be changed during Nominations and Shortlisting.', 'validation')
  if (c.nominations.some((n) => n.key === candidate.key)) throw new ApiError(`${candidate.name} is already on this shortlist.`, 'duplicate')
  const n: Nomination = { id: newId('nom'), key: candidate.key, name: candidate.name, email: candidate.email, affiliation: candidate.affiliation, paperId: candidate.paperId, paperTitle: candidate.paperId ? candidate.title : undefined, winner: false, note: '' }
  put(cycleId, (x) => ({ ...x, nominations: [...x.nominations, n] }))
  recordAudit({ journal: c.journal, action: 'Shortlisted for award', target: `${candidate.name} — ${c.name}` })
}

export async function removeFromShortlist(cycleId: string, nominationId: string): Promise<void> {
  await wait()
  const c = find(cycleId)
  if (!editable(c)) throw new ApiError('The shortlist can only be changed during Nominations and Shortlisting.', 'validation')
  const n = c.nominations.find((x) => x.id === nominationId)
  put(cycleId, (x) => ({ ...x, nominations: x.nominations.filter((y) => y.id !== nominationId) }))
  recordAudit({ journal: c.journal, action: 'Removed from award shortlist', target: `${n?.name ?? nominationId} — ${c.name}` })
}

export async function updateNomination(cycleId: string, nominationId: string, patch: Partial<Pick<Nomination, 'winner' | 'note'>>): Promise<void> {
  await delay(null, 100, 250)
  const c = find(cycleId)
  if (c.status !== 'shortlisting') throw new ApiError('Winners can only be selected while the cycle is in Shortlisting.', 'validation')
  put(cycleId, (x) => ({ ...x, nominations: x.nominations.map((n) => (n.id === nominationId ? { ...n, ...patch } : n)) }))
  if (patch.winner !== undefined) {
    const n = c.nominations.find((y) => y.id === nominationId)
    recordAudit({ journal: c.journal, action: patch.winner ? 'Selected award winner' : 'Unselected award winner', target: `${n?.name ?? nominationId} — ${c.name}` })
  }
}

/** Status flow Draft → Nominations → Shortlisting → Pending approval → Approved → Published. */
async function move(cycleId: string, from: CycleStatus[], to: CycleStatus, extra: (c: AwardCycle) => Partial<AwardCycle> = () => ({}), reason?: string) {
  await wait()
  const c = find(cycleId)
  if (!from.includes(c.status)) throw new ApiError(`This cycle is ${CYCLE_LABEL[c.status]}; it cannot move to ${CYCLE_LABEL[to]} from here.`, 'validation')
  put(cycleId, (x) => ({ ...x, status: to, ...extra(x) }))
  recordAudit({ journal: c.journal, action: reason ? `Award cycle: ${CYCLE_LABEL[to]} (${reason})` : `Award cycle: ${CYCLE_LABEL[to]}`, target: c.name, oldValue: CYCLE_LABEL[c.status], newValue: CYCLE_LABEL[to] })
}

export const openNominations = (id: string) => move(id, ['draft'], 'nominations')
export const beginShortlisting = (id: string) => move(id, ['nominations'], 'shortlisting')

export async function submitForApproval(id: string): Promise<void> {
  const c = find(id)
  const winners = c.nominations.filter((n) => n.winner)
  if (winners.length === 0) throw new ApiError('Select at least one winner before submitting for approval.', 'validation')
  const missing = winners.find((n) => n.note.trim().length < 10)
  if (missing) throw new ApiError(`Add a selection note for ${missing.name} (at least 10 characters).`, 'validation')
  return move(id, ['shortlisting'], 'pending_approval', () => ({ submittedAt: new Date().toISOString(), returnReason: undefined }))
}

export const approveCycle = (id: string) => move(id, ['pending_approval'], 'approved', () => ({ approvedAt: new Date().toISOString(), approvedBy: currentActor() }))
export const returnToShortlisting = (id: string, reason: string) => move(id, ['pending_approval'], 'shortlisting', () => ({ returnReason: reason, submittedAt: undefined }), reason)
export const publishCycle = (id: string) => move(id, ['approved'], 'published', () => ({ publishedAt: new Date().toISOString() }))
