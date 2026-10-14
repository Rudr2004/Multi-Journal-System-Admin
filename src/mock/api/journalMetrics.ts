import type { JournalCode, Paper, PaperStatus } from '@/shared/types'
import { currentActor, recordAudit } from '../actions'
import { LISTING_LABEL, SYSTEM_STATS, type JournalMetricsConfig } from '../data/metrics'
import { useDataStore } from '../store'
import { useMetricsStore } from '../stores/metrics'
import { delay } from './latency'

export interface SystemFigure { key: string; value: number; display: string; basis: string; estimated: boolean }
export type SystemFigures = Record<'papers' | 'countries' | 'reviewTime' | 'acceptance', SystemFigure>

const PUBLISHED: PaperStatus[] = ['published', 'indexed', 'corrected']
const ACCEPTED: PaperStatus[] = ['accepted', 'payment_pending', 'paid', 'in_production', 'returned_to_production', 'ready_for_approval', 'published', 'indexed', 'corrected', 'retracted']
const DAY = 86_400_000

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7)

/** Figures that cannot be edited by hand: calculated from the papers in the data store, with deterministic fallbacks where data is thin. */
export function computeSystemFigures(journal: JournalCode, papers: Paper[]): SystemFigures {
  const mine = papers.filter((p) => p.journal === journal)
  const published = mine.filter((p) => PUBLISHED.includes(p.status))
  const countryPool = published.length >= 3 ? published : mine
  const countries = new Set(countryPool.map((p) => p.authorCountry).filter(Boolean)).size
  const decided = mine.filter((p) => ACCEPTED.includes(p.status) || p.status === 'rejected')
  const accepted = decided.filter((p) => ACCEPTED.includes(p.status)).length

  const fallbackPapers = 24 + (hash(journal) % 40)
  const days = decided.map((p) => (new Date(p.updatedAt).getTime() - new Date(p.submittedAt).getTime()) / DAY).filter((d) => d > 0)
  const avgDays = days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0
  const reviewOk = days.length >= 5 && avgDays >= 7 && avgDays <= 60
  const reviewValue = reviewOk ? Math.round(avgDays) : 16 + (hash(journal) % 9)
  const accOk = decided.length >= 5
  const accValue = accOk ? Math.round((accepted / decided.length) * 100) : 48 + (hash(journal) % 15)

  return {
    papers: published.length >= 3
      ? { key: 'papers', value: published.length, display: String(published.length), basis: `${published.length} published papers in the system`, estimated: false }
      : { key: 'papers', value: fallbackPapers, display: String(fallbackPapers), basis: 'Fewer than 3 published papers recorded, showing the journal archive count', estimated: true },
    countries: countries >= 1
      ? { key: 'countries', value: countries, display: String(countries), basis: `Distinct author countries across ${countryPool.length} papers`, estimated: false }
      : { key: 'countries', value: 6, display: '6', basis: 'No author data yet', estimated: true },
    reviewTime: { key: 'reviewTime', value: reviewValue, display: `${reviewValue} days`, basis: reviewOk ? `Average over ${days.length} decided papers` : 'Not enough decided papers, showing the typical turnaround', estimated: !reviewOk },
    acceptance: { key: 'acceptance', value: accValue, display: `${accValue}%`, basis: accOk ? `${accepted} accepted of ${decided.length} decided papers` : 'Not enough decided papers, showing the typical rate', estimated: !accOk },
  }
}

export async function getJournalMetrics(journal: JournalCode): Promise<{ config: JournalMetricsConfig; system: SystemFigures }> {
  await delay(null, 250, 550)
  return {
    config: structuredClone(useMetricsStore.getState().configs[journal]),
    system: computeSystemFigures(journal, useDataStore.getState().papers),
  }
}

const label = (key: string, c: JournalMetricsConfig) =>
  key === 'sjif' ? 'SJIF' : key.startsWith('rating:') ? (c.ratings.find((r) => `rating:${r.id}` === key)?.name ?? key) : (SYSTEM_STATS.find((s) => s.key === key)?.label ?? key)

/** Human-readable differences, used for the audit entry. */
export function diffMetrics(a: JournalMetricsConfig, b: JournalMetricsConfig): string[] {
  const out: string[] = []
  if (a.sjif.value !== b.sjif.value || a.sjif.year !== b.sjif.year) out.push(`SJIF: ${a.sjif.value ? `${a.sjif.value} (${a.sjif.year})` : 'none'} -> ${b.sjif.value ? `${b.sjif.value} (${b.sjif.year})` : 'none'}`)
  if (a.sjif.link !== b.sjif.link) out.push('SJIF evidence link changed')
  if (a.sjif.certificate !== b.sjif.certificate) out.push(`SJIF certificate: ${b.sjif.certificate || 'removed'}`)
  for (const r of b.ratings) {
    const o = a.ratings.find((x) => x.id === r.id)
    if (!o) out.push(`Rating added: ${r.name} ${r.value}`)
    else if (JSON.stringify(o) !== JSON.stringify(r)) out.push(`Rating edited: ${r.name} ${o.value} -> ${r.value}`)
  }
  for (const r of a.ratings) if (!b.ratings.some((x) => x.id === r.id)) out.push(`Rating deleted: ${r.name}`)
  const vis = (list: JournalMetricsConfig['home'], where: string, c: JournalMetricsConfig, prev: JournalMetricsConfig['home']) => {
    for (const p of list) {
      const o = prev.find((x) => x.key === p.key)
      if (o && o.show !== p.show) out.push(`${label(p.key, c)} on ${where}: ${o.show ? 'On' : 'Off'} -> ${p.show ? 'On' : 'Off'}`)
    }
    if (list.map((x) => x.key).join() !== prev.filter((x) => list.some((y) => y.key === x.key)).map((x) => x.key).join()) out.push(`${where} order changed`)
  }
  vis(b.home, 'home page', b, a.home)
  vis(b.table, 'statistics table', b, a.table)
  for (const l of b.logos) {
    const o = a.logos.find((x) => x.id === l.id)
    if (!o) continue
    if (o.status !== l.status) out.push(`${l.name} status: ${LISTING_LABEL[o.status]} -> ${LISTING_LABEL[l.status]}`)
    if (o.show !== l.show) out.push(`${l.name} logo: ${o.show ? 'Shown' : 'Hidden'} -> ${l.show ? 'Shown' : 'Hidden'}`)
    if (o.verifyUrl !== l.verifyUrl) out.push(`${l.name} verify link changed`)
  }
  return out
}

export async function saveJournalMetrics(journal: JournalCode, next: JournalMetricsConfig): Promise<{ changes: number }> {
  await delay(null, 400, 800)
  const store = useMetricsStore.getState()
  const prev = store.configs[journal]
  const diff = diffMetrics(prev, next)
  if (diff.length === 0) return { changes: 0 }
  store.set({ ...store.configs, [journal]: { ...structuredClone(next), updatedAt: new Date().toISOString(), updatedBy: currentActor() } })
  recordAudit({ journal, action: 'Public metrics changed', target: `${journal} journal metrics`, oldValue: undefined, newValue: diff.join('\n') })
  return { changes: diff.length }
}
