import type { JournalCode } from '@/shared/types'
import { JOURNAL_CODES } from './core'
import { NOW } from './papers'
import { buildJournalSettings } from './settings'

/* Journal Metrics: manual ratings, system figures that are calculated from the data store, website visibility/order, indexing logos. */

export interface SjifRating { value: string; year: string; link: string; certificate: string }
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
export interface IndexLogo { id: string; name: string; status: ListingStatus; verifyUrl: string; show: boolean }

export interface JournalMetricsConfig {
  sjif: SjifRating
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

export const statKeys = (c: Pick<JournalMetricsConfig, 'sjif' | 'ratings'>): string[] => [
  ...SYSTEM_STATS.map((s) => s.key as string),
  ...(c.sjif.value.trim() ? ['sjif'] : []),
  ...c.ratings.map((r) => `rating:${r.id}`),
]

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
    const sjif: SjifRating = i === 0 ? { value: '6.521', year: '2025', link: 'https://sjifactor.com/passport.php?id=23001', certificate: 'IJMAT-sjif-2025.pdf' } : { value: '', year: '', link: '', certificate: '' }
    const ratings = (RATING_SEED[j] ?? []).map((r) => ({ ...r }))
    const logos: IndexLogo[] = LOGO_DEFS.map((d) => {
      const on = d.settingsId ? !!settings[j].indexing[d.settingsId] : i % 2 === 0
      const status: ListingStatus = on ? 'indexed' : d.id === 'scopus' ? 'applied' : d.id === 'wos' ? 'applied' : d.id === 'doaj' || d.id === 'ugc' ? 'evaluation' : 'applied'
      return { id: d.id, name: d.name, status, verifyUrl: on ? d.verify : '', show: on }
    })
    const base = { sjif, ratings }
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
