import { create } from 'zustand'
import type { JournalCode } from '@/shared/types'
import { buildJournalSettings, restoreJournalIdentity, type JournalSettings } from '../data/settings'
import { registerReset } from '../reset'

interface AdminState {
  journalSettings: Record<JournalCode, JournalSettings>
  patch: (p: Partial<Omit<AdminState, 'patch' | 'reset'>>) => void
  reset: () => void
}

export const useAdminStore = create<AdminState>((set) => ({
  journalSettings: buildJournalSettings(),
  patch: (p) => set(p),
  reset: () => {
    restoreJournalIdentity()
    set({ journalSettings: buildJournalSettings() })
  },
}))

registerReset(() => useAdminStore.getState().reset())
