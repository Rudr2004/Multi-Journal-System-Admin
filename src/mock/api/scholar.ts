import { differenceInCalendarDays } from 'date-fns'
import type { JournalCode, Paper } from '@/shared/types'
import { hashStr, isPublished } from '../data/analytics'
import { NOW } from '../data/papers'
import { logEvent, recordAudit, sendMessage, updatePaper } from '../actions'
import { useDataStore } from '../store'
import { useInsightsStore, type ScholarCheck } from '../stores/insights'
import { delay } from './latency'

export interface ScholarRow {
  paperId: string
  title: string
  journal: JournalCode
  issueId?: string
  issueLabel: string
  volume?: number
  issueNumber?: number
  indexed: boolean
  lastChecked: string
  /** Mock Google Scholar result page for the article (only meaningful when indexed). */
  resultUrl: string
}

export interface ScholarIssueRow {
  issueId: string
  journal: JournalCode
  label: string
  volume: number
  number: number
  total: number
  indexed: number
  rate: number
}

export interface ScholarOverview {
  rows: ScholarRow[]
  issues: ScholarIssueRow[]
  journals: { journal: JournalCode; total: number; indexed: number; rate: number }[]
}

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)

/** Last time Google Scholar was queried: indexed items were confirmed earlier, pending ones are polled more often. */
function seededCheckedAt(p: Paper, indexed: boolean): string {
  const h = hashStr(p.id)
  const hours = indexed ? 24 * (3 + (h % 20)) : 6 + (h % 70)
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString()
}

export async function listScholarStatus(journals: JournalCode[]): Promise<ScholarOverview> {
  await delay(null, 300, 650)
  const { papers, issues } = useDataStore.getState()
  const checks = useInsightsStore.getState().scholar
  const issueOf = new Map<string, (typeof issues)[number]>()
  for (const i of issues) for (const id of i.articleIds) issueOf.set(id, i)

  const rows: ScholarRow[] = papers
    .filter((p) => journals.includes(p.journal) && isPublished(p))
    .map((p) => {
      const c = checks[p.id]
      const indexed = c?.indexed ?? p.status === 'indexed'
      const issue = issueOf.get(p.id)
      return {
        paperId: p.id, title: p.title, journal: p.journal, issueId: issue?.id, issueLabel: issue?.label ?? 'Not assigned to an issue', volume: issue?.volume, issueNumber: issue?.number,
        indexed, lastChecked: c?.checkedAt ?? seededCheckedAt(p, indexed),
        resultUrl: `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${p.title}"`)}`,
      }
    })

  const issueRows: ScholarIssueRow[] = issues
    .filter((i) => journals.includes(i.journal) && i.articleIds.length > 0)
    .map((i) => {
      const inIssue = rows.filter((r) => r.issueId === i.id)
      const indexed = inIssue.filter((r) => r.indexed).length
      return { issueId: i.id, journal: i.journal, label: i.label, volume: i.volume, number: i.number, total: inIssue.length, indexed, rate: pct(indexed, inIssue.length) }
    })
    .filter((i) => i.total > 0)

  const journalRows = journals.map((journal) => {
    const own = rows.filter((r) => r.journal === journal)
    const indexed = own.filter((r) => r.indexed).length
    return { journal, total: own.length, indexed, rate: pct(indexed, own.length) }
  })
  return { rows, issues: issueRows, journals: journalRows }
}

export interface RecheckResult { checked: number; nowIndexed: number; stillPending: number; emailed: number }

export const scholarUrl = (title: string) => `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${title}"`)}`

/**
 * Ask Google Scholar again. Pending articles older than 30 days usually flip to indexed;
 * newer ones need more time (Scholar typically takes 2–4 weeks).
 */
export async function recheckScholar(paperIds: string[]): Promise<RecheckResult> {
  await delay(null, 900, 1600)
  const { papers } = useDataStore.getState()
  const current = useInsightsStore.getState().scholar
  const now = new Date().toISOString()
  const updates: Record<string, ScholarCheck> = {}
  let nowIndexed = 0
  let stillPending = 0
  let emailed = 0
  for (const id of paperIds) {
    const p = papers.find((x) => x.id === id)
    if (!p) continue
    const wasIndexed = current[id]?.indexed ?? p.status === 'indexed'
    const old = differenceInCalendarDays(new Date(), new Date(p.submittedAt)) >= 30
    const flips = !wasIndexed && old && hashStr(id) % 100 < 70
    const indexed = wasIndexed || flips
    updates[id] = { indexed, checkedAt: now }
    if (flips) {
      nowIndexed++
      if (p.status === 'published') updatePaper(id, { status: 'indexed' }, { event: 'Google Scholar indexing confirmed' })
      recordAudit({ journal: p.journal, action: 'Google Scholar status updated', target: id, oldValue: 'Not indexed', newValue: 'Indexed' })
      const link = scholarUrl(p.title)
      sendMessage({ journal: p.journal, paperId: id, recipient: p.authorEmail, channel: 'email', template: `Google Scholar indexing confirmed: ${link}`, status: 'sent' })
      logEvent(id, 'Author emailed the Google Scholar indexing link', link)
      emailed++
    } else if (!wasIndexed) stillPending++
  }
  useInsightsStore.getState().setScholarChecks(updates)
  const total = Object.keys(updates).length
  if (total > 1) {
    const first = papers.find((x) => x.id === paperIds[0])
    recordAudit({ journal: first?.journal ?? 'ALL', action: 'Google Scholar recheck run', target: `${total} articles`, newValue: `${nowIndexed} newly indexed, ${stillPending} still pending` })
  }
  return { checked: total, nowIndexed, stillPending, emailed }
}
