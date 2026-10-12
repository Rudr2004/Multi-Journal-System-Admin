import { create } from 'zustand'
import type { JournalCode } from '@/shared/types'
import { JOURNAL_CODES } from '../data/core'
import { registerReset } from '../reset'

/** Real figures a journal website may display. */
export const PUBLIC_METRICS = [
  { id: 'views', label: 'Total article views', description: 'Lifetime article page views.' },
  { id: 'downloads', label: 'Total PDF downloads', description: 'Lifetime full-text downloads.' },
  { id: 'published', label: 'Articles published', description: 'Number of published articles in the last 12 months.' },
  { id: 'acceptance', label: 'Acceptance rate', description: 'Share of decided submissions that were accepted.' },
  { id: 'decisionTime', label: 'Average time to first decision', description: 'Mean days from submission to first editorial decision.' },
  { id: 'publicationTime', label: 'Average time to publication', description: 'Mean days from submission to publication online.' },
  { id: 'countries', label: 'Countries reached', description: 'Countries with at least one reader or author.' },
] as const

export type PublicMetricId = (typeof PUBLIC_METRICS)[number]['id']
export type PublicMetricsConfig = Record<JournalCode, Record<PublicMetricId, boolean>>

const seedMetrics = (): PublicMetricsConfig => {
  const out = {} as PublicMetricsConfig
  JOURNAL_CODES.forEach((c, i) => {
    out[c] = { views: true, downloads: true, published: true, acceptance: i % 2 === 0, decisionTime: i !== 3, publicationTime: false, countries: true }
  })
  return out
}

export interface ScholarCheck {
  /** Set when a recheck found the article indexed (overrides the paper status). */
  indexed?: boolean
  checkedAt: string
}

interface InsightsState {
  publicMetrics: PublicMetricsConfig
  scholar: Record<string, ScholarCheck>
  setPublicMetric: (journal: JournalCode, id: PublicMetricId, value: boolean) => void
  setScholarChecks: (checks: Record<string, ScholarCheck>) => void
  reset: () => void
}

export const useInsightsStore = create<InsightsState>((set) => ({
  publicMetrics: seedMetrics(),
  scholar: {},
  setPublicMetric: (journal, id, value) =>
    set((s) => ({ publicMetrics: { ...s.publicMetrics, [journal]: { ...s.publicMetrics[journal], [id]: value } } })),
  setScholarChecks: (checks) => set((s) => ({ scholar: { ...s.scholar, ...checks } })),
  reset: () => set({ publicMetrics: seedMetrics(), scholar: {} }),
}))

registerReset(() => useInsightsStore.getState().reset())
