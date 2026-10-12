import type { Issue, IssueStatus, JournalCode, Paper } from '@/shared/types'
import { ISSUE_FLOW, ISSUE_STATUS_META, isPublished } from '../data/publishing'
import { addDeposit, logEvent, recordAudit } from '../actions'
import { useDataStore } from '../store'
import { usePublishingStore } from '../stores/publishing'
import { ApiError, delay } from './latency'

export interface IssueSummary extends Issue { articleCount: number; conferenceName?: string }
export interface IssueDetail { issue: Issue; articles: Paper[]; candidates: Paper[]; cover?: { name: string; data?: string }; conferenceName?: string }

export interface IssueInput {
  number: number
  month: string // YYYY-MM-01
  submissionDeadline: string
  publicationDate: string
  callForPapers: string
}

const summarise = (i: Issue): IssueSummary => ({
  ...i,
  articleCount: i.articleIds.length,
  conferenceName: i.conferenceId ? usePublishingStore.getState().conferences.find((c) => c.id === i.conferenceId)?.shortName : undefined,
})

const sortIssues = (a: Issue, b: Issue) => a.journal.localeCompare(b.journal) || b.volume - a.volume || b.number - a.number

export function listIssues(journals: JournalCode[]) {
  return delay(useDataStore.getState().issues.filter((i) => journals.includes(i.journal)).sort(sortIssues).map(summarise))
}

/** Published papers of the issue's journal that are not yet part of any issue. */
function candidatesFor(journal: JournalCode): Paper[] {
  const { papers, issues } = useDataStore.getState()
  const used = new Set(issues.flatMap((i) => i.articleIds))
  return papers.filter((p) => p.journal === journal && isPublished(p) && !used.has(p.id))
}

export async function getIssue(id: string): Promise<IssueDetail> {
  const { issues, papers } = useDataStore.getState()
  const issue = issues.find((i) => i.id === id)
  if (!issue) throw new ApiError('Issue not found', 'not_found')
  const pub = usePublishingStore.getState()
  return delay({
    issue,
    articles: issue.articleIds.map((pid) => papers.find((p) => p.id === pid)).filter((p): p is Paper => !!p),
    candidates: candidatesFor(issue.journal),
    cover: pub.covers[id],
    conferenceName: pub.conferences.find((c) => c.id === issue.conferenceId)?.name,
  })
}

export function volumesFor(journal: JournalCode): number[] {
  return [...new Set(useDataStore.getState().issues.filter((i) => i.journal === journal).map((i) => i.volume))].sort((a, b) => b - a)
}

export const issueIdFor = (journal: JournalCode, volume: number, number: number) => `${journal}-V${volume}I${number}`

export function issueExists(journal: JournalCode, volume: number, number: number) {
  return useDataStore.getState().issues.some((i) => i.id === issueIdFor(journal, volume, number))
}

const patchIssue = (id: string, fn: (i: Issue) => Issue) => {
  const { issues, patch } = useDataStore.getState()
  patch({ issues: issues.map((i) => (i.id === id ? fn(i) : i)) })
}

export async function createIssue(input: IssueInput & { journal: JournalCode; volume: number }): Promise<Issue> {
  if (issueExists(input.journal, input.volume, input.number)) throw new ApiError(`Volume ${input.volume}, Issue ${input.number} already exists for ${input.journal}.`, 'conflict')
  const issue: Issue = {
    id: issueIdFor(input.journal, input.volume, input.number), journal: input.journal, volume: input.volume, number: input.number,
    label: `Volume ${input.volume}, Issue ${input.number}`, month: input.month, submissionDeadline: input.submissionDeadline,
    publicationDate: input.publicationDate, status: 'draft', callForPapers: input.callForPapers, articleIds: [], pages: {},
  }
  const { issues, patch } = useDataStore.getState()
  patch({ issues: [...issues, issue] })
  recordAudit({ journal: issue.journal, action: 'Issue created', target: issue.id, newValue: 'draft' })
  return delay(issue)
}

export interface IssueSave extends IssueInput {
  articleIds: string[]
  pages: Record<string, string>
  cover?: { name: string; data?: string } | null
}

/** Saves the issue editor: metadata, ordered articles, page numbers and cover. */
export async function saveIssue(id: string, input: IssueSave): Promise<Issue> {
  const current = useDataStore.getState().issues.find((i) => i.id === id)
  if (!current) throw new ApiError('Issue not found', 'not_found')
  if (current.status === 'published') throw new ApiError('Published issues are locked.', 'locked')
  const clash = useDataStore.getState().issues.some((i) => i.id !== id && i.journal === current.journal && i.volume === current.volume && i.number === input.number && !i.conferenceId)
  if (clash && !current.conferenceId) throw new ApiError(`Issue ${input.number} already exists in Volume ${current.volume}.`, 'conflict')
  const pages = Object.fromEntries(input.articleIds.map((a) => [a, input.pages[a] ?? '']))
  const next: Issue = {
    ...current, number: input.number, month: input.month, submissionDeadline: input.submissionDeadline, publicationDate: input.publicationDate,
    callForPapers: input.callForPapers, articleIds: input.articleIds, pages,
    label: current.conferenceId ? current.label : `Volume ${current.volume}, Issue ${input.number}`,
  }
  patchIssue(id, () => next)
  if (input.cover !== undefined) {
    const { covers, patch } = usePublishingStore.getState()
    const c = { ...covers }
    if (input.cover) c[id] = input.cover
    else delete c[id]
    patch({ covers: c })
  }
  const added = input.articleIds.filter((a) => !current.articleIds.includes(a)).length
  const removed = current.articleIds.filter((a) => !input.articleIds.includes(a)).length
  recordAudit({ journal: current.journal, action: 'Issue updated', target: id, oldValue: `${current.articleIds.length} articles`, newValue: `${input.articleIds.length} articles (+${added} / −${removed})` })
  return delay(next)
}

export async function advanceIssue(id: string): Promise<Issue> {
  const current = useDataStore.getState().issues.find((i) => i.id === id)
  if (!current) throw new ApiError('Issue not found', 'not_found')
  const idx = ISSUE_FLOW.indexOf(current.status)
  if (idx >= ISSUE_FLOW.length - 2) throw new ApiError('Use “Publish issue” to publish.', 'invalid')
  const status: IssueStatus = ISSUE_FLOW[idx + 1]
  const next = { ...current, status }
  patchIssue(id, () => next)
  recordAudit({ journal: current.journal, action: 'Issue status changed', target: id, oldValue: ISSUE_STATUS_META[current.status].label, newValue: ISSUE_STATUS_META[status].label })
  return delay(next)
}

/** Publishes the issue: locks it, stamps the online date and queues Crossref deposits for articles without one. */
export async function publishIssue(id: string): Promise<Issue> {
  const { issues, deposits } = useDataStore.getState()
  const current = issues.find((i) => i.id === id)
  if (!current) throw new ApiError('Issue not found', 'not_found')
  if (current.articleIds.length === 0) throw new ApiError('An issue needs at least one article before it can be published.', 'invalid')
  if (current.status === 'published') throw new ApiError('Issue is already published.', 'invalid')
  const today = new Date().toISOString().slice(0, 10)
  const next: Issue = { ...current, status: 'published', actualOnlineDate: today }
  patchIssue(id, () => next)
  for (const pid of current.articleIds) {
    if (!deposits.some((d) => d.paperId === pid)) addDeposit(pid, 'pending')
    logEvent(pid, `Issue published: ${current.label} (pages ${current.pages[pid] || '—'})`)
  }
  recordAudit({ journal: current.journal, action: 'Issue published', target: id, oldValue: ISSUE_STATUS_META[current.status].label, newValue: `Published · ${current.articleIds.length} articles` })
  return delay(next)
}
