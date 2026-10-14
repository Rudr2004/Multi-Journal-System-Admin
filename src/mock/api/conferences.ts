import type { Issue, JournalCode, Paper } from '@/shared/types'
import { isPublished, type Conference } from '../data/publishing'
import { logEvent, newId, recordAudit } from '../actions'
import { useDataStore } from '../store'
import { usePublishingStore } from '../stores/publishing'
import { ApiError, delay } from './latency'
import { publishIssue } from './issues'
import { IN_PRESS_STATUSES, assigneeOf, dueOf, ensureRecord, userName } from './production'
import { readiness } from '../data/production'

export interface ConferenceRow extends Conference { linkedCount: number; issue?: Issue }
export interface ConferenceDetail { conference: Conference; issue?: Issue; linked: Paper[]; candidates: Paper[] }

const issueOf = (c: Conference) => useDataStore.getState().issues.find((i) => i.id === c.proceedingsIssueId || i.conferenceId === c.id)

export function listConferences(journals: JournalCode[]) {
  const { conferences, links } = usePublishingStore.getState()
  return delay(
    conferences.filter((c) => journals.includes(c.journal)).sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((c): ConferenceRow => ({ ...c, linkedCount: links[c.id]?.length ?? 0, issue: issueOf(c) })),
  )
}

export async function getConference(id: string): Promise<ConferenceDetail> {
  const { conferences, links } = usePublishingStore.getState()
  const conference = conferences.find((c) => c.id === id)
  if (!conference) throw new ApiError('Conference not found', 'not_found')
  const { papers } = useDataStore.getState()
  const taken = new Set(Object.values(links).flat())
  return delay({
    conference,
    issue: issueOf(conference),
    linked: (links[id] ?? []).map((pid) => papers.find((p) => p.id === pid)).filter((p): p is Paper => !!p),
    candidates: papers.filter((p) => p.journal === conference.journal && !taken.has(p.id) && !['rejected', 'withdrawn'].includes(p.status)),
  })
}

export type ConferenceInput = Omit<Conference, 'id' | 'createdAt' | 'proceedingsIssueId'>

export async function createConference(input: ConferenceInput): Promise<Conference> {
  const conference: Conference = { ...input, id: newId('conf'), createdAt: new Date().toISOString() }
  const { conferences, links, patch } = usePublishingStore.getState()
  patch({ conferences: [conference, ...conferences], links: { ...links, [conference.id]: [] } })
  recordAudit({ journal: conference.journal, action: 'Conference created', target: conference.shortName })
  return delay(conference)
}

export async function saveConference(id: string, input: ConferenceInput): Promise<Conference> {
  const { conferences, patch } = usePublishingStore.getState()
  const before = conferences.find((c) => c.id === id)
  if (!before) throw new ApiError('Conference not found', 'not_found')
  const next: Conference = { ...before, ...input }
  patch({ conferences: conferences.map((c) => (c.id === id ? next : c)) })
  recordAudit({ journal: next.journal, action: 'Conference updated', target: next.shortName })
  return delay(next)
}

export async function linkSubmissions(id: string, paperIds: string[]) {
  const { conferences, links, patch } = usePublishingStore.getState()
  const c = conferences.find((x) => x.id === id)
  if (!c) throw new ApiError('Conference not found', 'not_found')
  patch({ links: { ...links, [id]: [...new Set([...(links[id] ?? []), ...paperIds])] } })
  paperIds.forEach((pid) => logEvent(pid, `Linked to conference ${c.shortName}`))
  recordAudit({ journal: c.journal, action: 'Conference submissions linked', target: c.shortName, newValue: `${paperIds.length} paper(s)` })
  return delay(true, 200, 400)
}

export async function unlinkSubmission(id: string, paperId: string) {
  const { conferences, links, patch } = usePublishingStore.getState()
  const c = conferences.find((x) => x.id === id)
  if (!c) throw new ApiError('Conference not found', 'not_found')
  patch({ links: { ...links, [id]: (links[id] ?? []).filter((p) => p !== paperId) } })
  logEvent(paperId, `Unlinked from conference ${c.shortName}`)
  recordAudit({ journal: c.journal, action: 'Conference submission unlinked', target: c.shortName, oldValue: paperId })
  return delay(true, 200, 400)
}

/** Creates a Proceedings issue (an Issue with conferenceId) pre-filled with the conference's published papers. */
export async function createProceedingsIssue(id: string): Promise<Issue> {
  const { conferences, links, patch } = usePublishingStore.getState()
  const c = conferences.find((x) => x.id === id)
  if (!c) throw new ApiError('Conference not found', 'not_found')
  if (issueOf(c)) throw new ApiError('A proceedings issue already exists for this conference.', 'conflict')
  const { issues, papers, patch: patchData } = useDataStore.getState()
  const volume = Math.max(1, ...issues.filter((i) => i.journal === c.journal && !i.conferenceId).map((i) => i.volume))
  const number = Math.max(0, ...issues.filter((i) => i.journal === c.journal && i.volume === volume).map((i) => i.number)) + 1
  const taken = new Set(issues.flatMap((i) => i.articleIds))
  const ready = (links[id] ?? []).map((pid) => papers.find((p) => p.id === pid)).filter((p): p is Paper => !!p && isPublished(p) && !taken.has(p.id))
  const issue: Issue = {
    id: `${c.journal}-P-${c.shortName.replace(/\s+/g, '')}`, journal: c.journal, volume, number, label: `Proceedings: ${c.shortName}`,
    month: c.startDate.slice(0, 8) + '01', submissionDeadline: c.submissionDeadline, publicationDate: c.cameraReadyDeadline,
    status: 'draft', callForPapers: `Peer-reviewed proceedings of ${c.name} (${c.shortName}), ${c.city}.`,
    articleIds: ready.map((p) => p.id), pages: Object.fromEntries(ready.map((p, i) => [p.id, `${i * 8 + 1}–${i * 8 + 8}`])), conferenceId: c.id,
  }
  patchData({ issues: [...issues, issue] })
  patch({ conferences: conferences.map((x) => (x.id === id ? { ...x, proceedingsIssueId: issue.id } : x)) })
  recordAudit({ journal: c.journal, action: 'Proceedings issue created', target: issue.id, newValue: `${ready.length} article(s)` })
  return delay(issue)
}

export const publishProceedings = async (id: string) => {
  const c = usePublishingStore.getState().conferences.find((x) => x.id === id)
  const issue = c && issueOf(c)
  if (!c || !issue) throw new ApiError('Create the proceedings issue first.', 'invalid')
  return publishIssue(issue.id)
}

/* ---------------- Associate Editor: production of conference papers ---------------- */

export interface ConferenceProductionRow { paper: Paper; due: string; missing: number; assigneeId?: string; assigneeName?: string }
export interface ConferenceProduction { conference: Conference; issue?: Issue; rows: ConferenceProductionRow[] }

function productionRows(links: string[], onlyAssignedTo?: string): ConferenceProductionRow[] {
  const { papers } = useDataStore.getState()
  return links
    .map((pid) => papers.find((p) => p.id === pid))
    .filter((p): p is Paper => !!p && IN_PRESS_STATUSES.includes(p.status))
    .filter((p) => !onlyAssignedTo || assigneeOf(p) === onlyAssignedTo)
    .map((paper) => {
      const a = assigneeOf(paper)
      return { paper, due: dueOf(paper), missing: readiness(ensureRecord(paper.id), !!ensureRecord(paper.id).returnNote).missing.length, assigneeId: a, assigneeName: userName(a) }
    })
}

export function listConferenceProduction(journals: JournalCode[], onlyAssignedTo?: string) {
  const { conferences, links } = usePublishingStore.getState()
  return delay(
    conferences.filter((c) => journals.includes(c.journal)).sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((c): ConferenceProduction => ({ conference: c, issue: issueOf(c), rows: productionRows(links[c.id] ?? [], onlyAssignedTo) })),
  )
}

export async function getConferenceProduction(id: string, onlyAssignedTo?: string): Promise<ConferenceProduction> {
  const { conferences, links } = usePublishingStore.getState()
  const conference = conferences.find((c) => c.id === id)
  if (!conference) throw new ApiError('Conference not found', 'not_found')
  return delay({ conference, issue: issueOf(conference), rows: productionRows(links[id] ?? [], onlyAssignedTo) })
}
