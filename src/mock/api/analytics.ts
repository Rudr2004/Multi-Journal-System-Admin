import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import type { Channel, JournalCode, Paper } from '@/shared/types'
import { JOURNAL_CODES } from '../data/core'
import {
  ARTICLE_TYPE_SHARE, COUNTRY_WEIGHTS, DATA_DAYS, acceptanceRate, addDay, articleCountries, articleWeight, avgFirstDecision, avgPublication,
  dailySeries, emptyMetrics, endDate, hashStr, inrTotal, isPublished, mergeMetrics, rejectionRate, scaleMetrics, startDate,
  type CountryShare, type Metrics,
} from '../data/analytics'
import { useDataStore } from '../store'
import { useInsightsStore, type PublicMetricId } from '../stores/insights'
import { recordAudit } from '../actions'
import { delay } from './latency'

export type Granularity = 'day' | 'week' | 'month'

export interface AnalyticsFilters {
  journals: JournalCode[]
  from: string // yyyy-MM-dd
  to: string
  compare: boolean
  issueId?: string
  articleType?: string
}

export interface Bucket {
  key: string
  label: string
  byJournal: Partial<Record<JournalCode, Metrics>>
  total: Metrics
}

export interface ArticleRow {
  paperId: string
  title: string
  journal: JournalCode
  articleType: string
  views: number
  downloads: number
  countries: number
  topCountry: string
}

export interface DeliveryRow { channel: Channel; sent: number; delivered: number; failed: number; rate: number }

export interface AnalyticsResult {
  filters: AnalyticsFilters
  granularity: Granularity
  buckets: Bucket[]
  byJournal: Partial<Record<JournalCode, Metrics>>
  total: Metrics
  /** Same-length period immediately before `from`, when the data covers it. */
  previous?: Metrics
  topArticles: ArticleRow[]
  countries: CountryShare[]
  delivery: DeliveryRow[]
  /** Share of the journal series this view represents (issue / article-type filters). */
  scaleNote?: string
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

export function granularityFor(days: number): Granularity {
  return days <= 31 ? 'day' : days <= 130 ? 'week' : 'month'
}

export function clampRange(from: string, to: string): { from: string; to: string } {
  const min = iso(startDate())
  const max = iso(endDate())
  let f = from < min ? min : from > max ? max : from
  let t = to > max ? max : to < min ? min : to
  if (f > t) [f, t] = [t, f]
  return { from: f, to: t }
}

function bucketStart(date: string, g: Granularity): Date {
  const d = parseISO(date)
  return g === 'day' ? d : g === 'week' ? startOfWeek(d, { weekStartsOn: 1 }) : startOfMonth(d)
}

function bucketLabel(d: Date, g: Granularity): string {
  return g === 'month' ? format(d, "MMM ''yy") : format(d, 'd MMM')
}

const PUBLISHED_STATUSES = ['published', 'indexed', 'corrected']

function cohortScale(f: AnalyticsFilters, code: JournalCode): number {
  let s = 1
  if (f.articleType) s *= ARTICLE_TYPE_SHARE[f.articleType] ?? 0.2
  if (f.issueId) {
    const { issues, papers } = useDataStore.getState()
    const issue = issues.find((i) => i.id === f.issueId)
    const pool = papers.filter((p) => p.journal === code && PUBLISHED_STATUSES.includes(p.status)).length
    s *= issue && issue.journal === code ? Math.min(1, Math.max(0.03, issue.articleIds.length / Math.max(1, pool))) : 0
  }
  return s
}

function sumRange(code: JournalCode, from: string, to: string, scale: number): Metrics {
  const m = emptyMetrics()
  for (const d of dailySeries()[code]) if (d.date >= from && d.date <= to) addDay(m, d, code)
  return scaleMetrics(m, scale)
}

function computeDelivery(journals: JournalCode[]): DeliveryRow[] {
  const msgs = useDataStore.getState().messages.filter((m) => journals.includes(m.journal))
  return (['email', 'whatsapp', 'sms'] as Channel[]).map((channel) => {
    const rows = msgs.filter((m) => m.channel === channel)
    const delivered = rows.filter((m) => m.status === 'delivered' || m.status === 'sent').length
    const failed = rows.filter((m) => m.status === 'failed').length
    const settled = delivered + failed
    return { channel, sent: rows.length, delivered, failed, rate: settled ? (delivered / settled) * 100 : 0 }
  })
}

/** Published articles of the selected journals after the issue / type filters. */
export function articlePool(f: Pick<AnalyticsFilters, 'journals' | 'issueId' | 'articleType'>): Paper[] {
  const { papers, issues } = useDataStore.getState()
  const issue = f.issueId ? issues.find((i) => i.id === f.issueId) : undefined
  return papers.filter(
    (p) =>
      f.journals.includes(p.journal) && isPublished(p) && (!f.articleType || p.articleType === f.articleType) && (!issue || issue.articleIds.includes(p.id)),
  )
}

/** Period views/downloads of an article = its share of 85% of its journal's traffic (the rest is back-catalogue). */
function articleShares(code: JournalCode, journalMetrics: Metrics) {
  const all = useDataStore.getState().papers.filter((p) => p.journal === code && isPublished(p))
  const total = all.reduce((s, p) => s + articleWeight(p), 0) || 1
  return (p: Paper) => {
    const share = articleWeight(p) / total
    return { views: Math.round(journalMetrics.views * 0.85 * share), downloads: Math.round(journalMetrics.downloads * 0.85 * share) }
  }
}

export async function getAnalytics(filters: AnalyticsFilters): Promise<AnalyticsResult> {
  await delay(null, 350, 700)
  const { from, to } = clampRange(filters.from, filters.to)
  const f = { ...filters, from, to }
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
  const granularity = granularityFor(days)
  const journals = filters.journals.length ? filters.journals : JOURNAL_CODES

  const bucketMap = new Map<string, Bucket>()
  const series = dailySeries()
  const byJournal: Partial<Record<JournalCode, Metrics>> = {}
  for (const code of journals) {
    const scale = cohortScale(f, code)
    const perBucket = new Map<string, Metrics>()
    for (const d of series[code]) {
      if (d.date < from || d.date > to) continue
      const b = bucketStart(d.date, granularity)
      const key = iso(b)
      let m = perBucket.get(key)
      if (!m) { m = emptyMetrics(); perBucket.set(key, m) }
      addDay(m, d, code)
      if (!bucketMap.has(key)) bucketMap.set(key, { key, label: bucketLabel(b, granularity), byJournal: {}, total: emptyMetrics() })
    }
    let jt = emptyMetrics()
    for (const [key, m] of perBucket) {
      const scaled = scaleMetrics(m, scale)
      const bucket = bucketMap.get(key)!
      bucket.byJournal[code] = scaled
      bucket.total = mergeMetrics(bucket.total, scaled)
      jt = mergeMetrics(jt, scaled)
    }
    byJournal[code] = jt
  }
  const buckets = [...bucketMap.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
  const total = journals.reduce((acc, c) => mergeMetrics(acc, byJournal[c] ?? emptyMetrics()), emptyMetrics())

  // previous period (only when fully inside the data window)
  const prevTo = addDays(parseISO(from), -1)
  const prevFrom = addDays(prevTo, -(days - 1))
  let previous: Metrics | undefined
  if (iso(prevFrom) >= iso(startDate())) {
    previous = journals.reduce((acc, c) => mergeMetrics(acc, sumRange(c, iso(prevFrom), iso(prevTo), cohortScale(f, c))), emptyMetrics())
  }

  // articles (period views come from the unscaled journal traffic, so they tie back to the charts)
  const rows: ArticleRow[] = []
  for (const code of journals) {
    const unscaled = sumRange(code, from, to, 1)
    const shareOf = articleShares(code, unscaled)
    for (const p of articlePool({ journals: [code], issueId: filters.issueId, articleType: filters.articleType })) {
      const { views, downloads } = shareOf(p)
      const countries = articleCountries(p, views)
      rows.push({ paperId: p.id, title: p.title, journal: code, articleType: p.articleType, views, downloads, countries: countries.length, topCountry: countries[0]?.country ?? '—' })
    }
  }
  rows.sort((a, b) => b.views - a.views)

  // countries: journal view totals split by the journal's country profile
  const cMap = new Map<string, number>()
  for (const code of journals) {
    const weights = COUNTRY_WEIGHTS[code]
    const sum = weights.reduce((s, [, w]) => s + w, 0)
    for (const [country, w] of weights) cMap.set(country, (cMap.get(country) ?? 0) + ((byJournal[code]?.views ?? 0) * w) / sum)
  }
  const totalViews = [...cMap.values()].reduce((s, v) => s + v, 0) || 1
  const sorted = [...cMap.entries()].filter(([c]) => c !== 'Other').sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, 8).map(([country, v]) => ({ country, views: Math.round(v), share: (v / totalViews) * 100 }))
  const rest = totalViews - top.reduce((s, c) => s + c.views, 0)
  const countries = [...top, { country: 'Other countries', views: Math.round(rest), share: (rest / totalViews) * 100 }]

  const scaleNote = filters.issueId || filters.articleType
    ? 'Issue and article-type filters narrow every figure to that cohort (estimated from its share of the journal).'
    : undefined

  return { filters: f, granularity, buckets, byJournal, total, previous, topArticles: rows, countries, delivery: computeDelivery(journals), scaleNote }
}

/* ---------- Article drill-down ---------- */

export interface ArticleAnalytics {
  paper: Paper
  views: number
  downloads: number
  months: { label: string; views: number; downloads: number }[]
  countries: CountryShare[]
  rankInJournal: number
  journalPublished: number
}

export async function getArticleAnalytics(paperId: string): Promise<ArticleAnalytics> {
  await delay(null, 300, 600)
  const paper = useDataStore.getState().papers.find((p) => p.id === paperId)
  if (!paper || !isPublished(paper)) throw new Error('This article has no public metrics yet — only published articles are tracked.')
  const code = paper.journal
  const to = iso(endDate())
  const from = iso(addDays(endDate(), -(DATA_DAYS - 1)))
  const unscaled = sumRange(code, from, to, 1)
  const shareOf = articleShares(code, unscaled)
  const { views, downloads } = shareOf(paper)

  // monthly breakdown of the same journal traffic, scaled to this article
  const monthly = new Map<string, Metrics>()
  for (const d of dailySeries()[code]) {
    const key = d.date.slice(0, 7)
    let m = monthly.get(key)
    if (!m) { m = emptyMetrics(); monthly.set(key, m) }
    addDay(m, d, code)
  }
  const factor = views / Math.max(1, unscaled.views)
  const months = [...monthly.entries()].sort().map(([key, m]) => {
    const jitter = 0.85 + ((hashStr(paper.id + key) % 300) / 1000)
    return {
      label: format(parseISO(`${key}-01`), "MMM ''yy"),
      views: Math.round(m.views * factor * jitter),
      downloads: Math.round(m.downloads * (downloads / Math.max(1, unscaled.downloads)) * jitter),
    }
  })
  const siblings = useDataStore.getState().papers.filter((p) => p.journal === code && isPublished(p))
  const rank = siblings.filter((p) => shareOf(p).views > views).length + 1
  return { paper, views, downloads, months, countries: articleCountries(paper, views), rankInJournal: rank, journalPublished: siblings.length }
}

/* ---------- Public metrics (website figures) ---------- */

export async function getPublicMetricValues(): Promise<Record<JournalCode, Record<PublicMetricId, string>>> {
  await delay(null, 250, 500)
  const from = iso(startDate())
  const to = iso(endDate())
  const issues = useDataStore.getState().issues
  const out = {} as Record<JournalCode, Record<PublicMetricId, string>>
  for (const code of JOURNAL_CODES) {
    const m = sumRange(code, from, to, 1)
    out[code] = {
      views: m.views.toLocaleString('en-IN'),
      downloads: m.downloads.toLocaleString('en-IN'),
      published: String(m.published),
      acceptance: `${acceptanceRate(m).toFixed(1)}%`,
      decisionTime: `${avgFirstDecision(m).toFixed(0)} days`,
      publicationTime: `${avgPublication(m).toFixed(0)} days`,
      countries: String(COUNTRY_WEIGHTS[code].length - 1 + 38 + (issues.length % 3)),
    }
  }
  return out
}

export async function setPublicMetric(journal: JournalCode, id: PublicMetricId, label: string, value: boolean): Promise<void> {
  await delay(null, 200, 400)
  useInsightsStore.getState().setPublicMetric(journal, id, value)
  recordAudit({ journal, action: 'Public metrics changed', target: `${journal} website metrics`, oldValue: `${label}: ${value ? 'Hidden' : 'Shown'}`, newValue: `${label}: ${value ? 'Shown' : 'Hidden'}` })
}

/* ---------- Export ---------- */

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

export function analyticsCsvRows(res: AnalyticsResult): (string | number)[][] {
  const header = [
    'Period', 'Journal', 'Submissions', 'Accepted', 'Rejected', 'Acceptance rate %', 'Rejection rate %', 'Avg days to first decision', 'Avg days to publication',
    'APC revenue INR (excl. GST)', 'CGST INR', 'SGST INR', 'IGST INR', 'Total INR incl. GST', 'Revenue USD', 'Views', 'Downloads', 'Referrals sent', 'Referrals converted', 'Awards',
  ]
  const row = (period: string, journal: string, m: Metrics) => [
    period, journal, m.submissions, m.accepted, m.rejected, r1(acceptanceRate(m)), r1(rejectionRate(m)), r1(avgFirstDecision(m)), r1(avgPublication(m)),
    r2(m.inrBase), r2(m.cgst), r2(m.sgst), r2(m.igst), r2(inrTotal(m)), r2(m.usdBase), m.views, m.downloads, m.referralsSent, m.referralsConverted, m.awards,
  ]
  const rows: (string | number)[][] = [header]
  for (const b of res.buckets) for (const code of res.filters.journals) if (b.byJournal[code]) rows.push(row(b.key, code, b.byJournal[code]!))
  return rows
}

/* ---------- Range helpers & export log ---------- */

export type RangePreset = '30d' | '90d' | '12m' | 'custom'

export function presetRange(p: Exclude<RangePreset, 'custom'>): { from: string; to: string } {
  const end = endDate()
  const days = p === '30d' ? 30 : p === '90d' ? 90 : DATA_DAYS
  return { from: iso(addDays(end, -(days - 1))), to: iso(end) }
}

export const dataBounds = () => ({ min: iso(startDate()), max: iso(endDate()) })

/** Record that someone exported analytics (every export is auditable). */
export function recordAnalyticsExport(kind: 'CSV' | 'PDF', res: AnalyticsResult) {
  const j = res.filters.journals
  recordAudit({
    journal: j.length === 1 ? j[0] : 'ALL',
    action: `Exported analytics (${kind})`,
    target: 'Analytics',
    newValue: `${res.filters.from} to ${res.filters.to}, ${j.join(' + ')}${res.filters.compare ? ' (compare)' : ''}`,
  })
}
