import { create } from 'zustand'
import type { JournalCode } from '@/shared/types'
import { buildMetricConfigs, type JournalMetricsConfig } from '../data/metrics'
import { registerReset } from '../reset'

interface MetricsState {
  configs: Record<JournalCode, JournalMetricsConfig>
  set: (configs: Record<JournalCode, JournalMetricsConfig>) => void
  reset: () => void
}

export const useMetricsStore = create<MetricsState>((set) => ({
  configs: buildMetricConfigs(),
  set: (configs) => set({ configs }),
  reset: () => set({ configs: buildMetricConfigs() }),
}))

registerReset(() => useMetricsStore.getState().reset())
