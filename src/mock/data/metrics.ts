import type { JournalCode } from '@/shared/types'
import { JOURNAL_CODES } from './core'
import { NOW } from './papers'
import { buildJournalSettings } from './settings'

/* Journal Metrics: manual ratings, system figures that are calculated from the data store, website visibility/order, indexing logos. */

export interface SjifRating { value: string; year: string; link: string; certificate: string }
/** One year of the SJIF impact factor history (year-wise management). */
export interface SjifYear { id: string; year: string; value: string; link: string; certificate: string }

/** The newest entered year, used as the journal's current SJIF on the website. */
export function latestSjif(years: SjifYear[]): SjifRating {
  const valid = years.filter((y) => /^\d{4}$/.test(y.year) && y.value.trim()).sort((a, b) => Number(b.year) - Number(a.year))
  const y = valid[0]
  return y ? { value: y.value, year: y.year, link: y.link, certificate: y.certificate } : { value: '', year: '', link: '', certificate: '' }
}

/**
 * SJIF for a publication year. Exact match when that year was entered; otherwise the closest earlier year
 * (flagged as not exact) so a backdated article still shows a sensible, clearly labelled value.
 */
export function sjifForYear(years: SjifYear[], year: number): { entry: SjifYear; exact: boolean } | undefined {
  const valid = years.filter((y) => /^\d{4}$/.test(y.year) && y.value.trim())
  const exact = valid.find((y) => Number(y.year) === year)
  if (exact) return { entry: exact, exact: true }
  const earlier = valid.filter((y) => Number(y.year) < year).sort((a, b) => Number(b.year) - Number(a.year))[0]
  return earlier ? { entry: earlier, exact: false } : undefined
}
/** A statistic the Super Admin defines (e.g. "Reviewers worldwide"), shown beside the calculated ones. */
export interface CustomStat { id: string; label: string; value: string; unit: string }
export interface ExternalRating { id: string; name: string; value: string; year: string; link: string; certificate: string }

export type SystemStatKey = 'papers' | 'countries' | 'reviewTime' | 'acceptance'
export const SYSTEM_STATS: { key: SystemStatKey; label: string; unit: string; help: string }[] = [
  { key: 'papers', label: 'Published papers', unit: '', help: 'Articles with a published DOI page.' },
  { key: 'countries', label: 'Countries', unit: '', help: 'Distinct author countries of published papers.' },
  { key: 'reviewTime', label: 'Average review time', unit: 'days', help: 'Submission to decision, over decided papers.' },
  { key: 'acceptance', label: 'Acceptance rate', unit: '%', help: 'Accepted papers out of all decided papers.' },
]

export interface StatPlacement { key: string; show: boolean }

export type ListingStatus = 'indexed' | 'evaluation' | 'applied'
export const LISTING_LABEL: Record<ListingStatus, string> = { indexed: 'Indexed', evaluation: 'Under evaluation', applied: 'Applied' }
export interface IndexLogo { id: string; name: string; status: ListingStatus; verifyUrl: string; show: boolean; image?: { name: string; data?: string } }

export interface JournalMetricsConfig {
  /** Derived from sjifYears (the newest year); kept for the website preview. */
  sjif: SjifRating
  sjifYears: SjifYear[]
  customStats: CustomStat[]
  ratings: ExternalRating[]
  home: StatPlacement[]
  table: StatPlacement[]
  logos: IndexLogo[]
  updatedAt: string
  updatedBy: string
}

export const LOGO_DEFS: { id: string; name: string; settingsId?: string; verify: string }[] = [
  { id: 'scholar', name: 'Google Scholar', settingsId: 'scholar', verify: 'https://scholar.google.com/' },
  { id: 'crossref', name: 'Crossref', settingsId: 'crossref', verify: 'https://search.crossref.org/' },
  { id: 'doaj', name: 'DOAJ', settingsId: 'doaj', verify: 'https://doaj.org/search/journals' },
  { id: 'scopus', name: 'Scopus', settingsId: 'scopus', verify: 'https://www.scopus.com/sources' },
  { id: 'wos', name: 'Web of Science', settingsId: 'wos', verify: 'https://mjl.clarivate.com/home' },
  { id: 'road', name: 'ROAD', verify: 'https://road.issn.org/' },
  { id: 'ugc', name: 'UGC-CARE', settingsId: 'ugc', verify: 'https://ugccare.unipune.ac.in/' },
  { id: 'base', name: 'BASE', settingsId: 'base', verify: 'https://www.base-search.net/' },
]

/** Keep a stored ordering in step with the stats that exist now: drop vanished keys, append new ones. */
export function reconcile(list: StatPlacement[], keys: string[], defaultShow: (k: string) => boolean = () => true): StatPlacement[] {
  const kept = list.filter((p) => keys.includes(p.key))
  const add = keys.filter((k) => !kept.some((p) => p.key === k)).map((key) => ({ key, show: defaultShow(key) }))
  return [...kept, ...add]
}

export const statKeys = (c: Pick<JournalMetricsConfig, 'sjif' | 'ratings'> & { customStats?: CustomStat[] }): string[] => [
  ...SYSTEM_STATS.map((s) => s.key as string),
  ...(c.sjif.value.trim() ? ['sjif'] : []),
  ...c.ratings.map((r) => `rating:${r.id}`),
  ...(c.customStats ?? []).filter((x) => x.label.trim() && x.value.trim()).map((x) => `custom:${x.id}`),
]

const SJIF_SEED: Record<string, Omit<SjifYear, 'id'>[]> = {
  IJMAT: [
    { year: '2025', value: '6.521', link: 'https://sjifactor.com/passport.php?id=23001', certificate: 'IJMAT-sjif-2025.pdf' },
    { year: '2024', value: '6.213', link: 'https://sjifactor.com/passport.php?id=23001', certificate: 'IJMAT-sjif-2024.pdf' },
    { year: '2023', value: '5.874', link: 'https://sjifactor.com/passport.php?id=23001', certificate: '' },
  ],
  JIMRT: [{ year: '2025', value: '5.902', link: 'https://sjifactor.com/passport.php?id=23002', certificate: '' }, { year: '2024', value: '5.431', link: 'https://sjifactor.com/passport.php?id=23002', certificate: '' }],
  IJCSD: [{ year: '2025', value: '7.118', link: 'https://sjifactor.com/passport.php?id=23003', certificate: 'IJCSD-sjif-2025.pdf' }, { year: '2024', value: '6.744', link: 'https://sjifactor.com/passport.php?id=23003', certificate: '' }],
  IJECM: [{ year: '2025', value: '6.047', link: 'https://sjifactor.com/passport.php?id=23004', certificate: '' }],
  IJFRD: [],
}

const CUSTOM_SEED: Record<string, Omit<CustomStat, 'id'>[]> = {
  IJMAT: [{ label: 'Reviewers worldwide', value: '1,240', unit: '' }, { label: 'Average time to publication', value: '21', unit: 'days' }],
  JIMRT: [{ label: 'Institutions represented', value: '86', unit: '' }],
  IJCSD: [{ label: 'Open-access downloads', value: '48,500', unit: '' }],
  IJECM: [],
  IJFRD: [],
}

const RATING_SEED: Record<string, ExternalRating[]> = {
  IJMAT: [{ id: 'r-ijmat-1', name: 'Index Copernicus (ICV)', value: '82.14', year: '2025', link: 'https://journals.indexcopernicus.com/', certificate: '' }],
  JIMRT: [],
  IJCSD: [{ id: 'r-ijcsd-1', name: 'ASI Impact Factor', value: '4.12', year: '2025', link: 'https://asi-impactfactor.example.org/', certificate: 'IJCSD-asi-2025.pdf' }],
  IJECM: [],
  IJFRD: [],
}

export function buildMetricConfigs(): Record<JournalCode, JournalMetricsConfig> {
  const settings = buildJournalSettings()
  const out = {} as Record<JournalCode, JournalMetricsConfig>
  JOURNAL_CODES.forEach((j, i) => {
    const sjifYears: SjifYear[] = (SJIF_SEED[j] ?? []).map((y, k) => ({ id: `sj-${j}-${k}`, ...y }))
    const sjif = latestSjif(sjifYears)
    const ratings = (RATING_SEED[j] ?? []).map((r) => ({ ...r }))
    const logos: IndexLogo[] = LOGO_DEFS.map((d) => {
      const on = d.settingsId ? !!settings[j].indexing[d.settingsId] : i % 2 === 0
      const status: ListingStatus = on ? 'indexed' : d.id === 'scopus' ? 'applied' : d.id === 'wos' ? 'applied' : d.id === 'doaj' || d.id === 'ugc' ? 'evaluation' : 'applied'
      return { id: d.id, name: d.name, status, verifyUrl: on ? d.verify : '', show: on }
    })
    const customStats: CustomStat[] = (CUSTOM_SEED[j] ?? []).map((x, k) => ({ id: `cs-${j}-${k}`, ...x }))
    const base = { sjif, sjifYears, ratings, customStats }
    const keys = statKeys(base)
    out[j] = {
      ...base,
      home: reconcile([], keys, (k) => k !== 'reviewTime' || i % 2 === 0),
      table: reconcile([], keys),
      logos,
      updatedAt: new Date(NOW.getTime() - (6 + i) * 86_400_000).toISOString(),
      updatedBy: ['Priya Menon', 'Rohan Mehta', 'Karan Shah'][i % 3],
    }
  })
  return out
}
