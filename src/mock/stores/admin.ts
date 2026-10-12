import { create } from 'zustand'
import type { JournalCode } from '@/shared/types'
import { DEMO_USER_LABELS } from '../data/core'
import { NOW } from '../data/papers'
import { SEED_LAST_ACTIVE_HOURS, buildJournalSettings, restoreJournalIdentity, type JournalSettings } from '../data/settings'
import { registerReset } from '../reset'
import { useSession } from '../store'

export interface InviteMeta {
  invitedAt: string
  invitedBy: string
  token: string
  link: string
  /** Set when the invited person first signs in. */
  acceptedAt?: string
}

const seedLastActive = () =>
  Object.fromEntries(Object.entries(SEED_LAST_ACTIVE_HOURS).map(([id, h]) => [id, new Date(NOW.getTime() - h * 3_600_000).toISOString()])) as Record<string, string>

interface AdminState {
  invites: Record<string, InviteMeta>
  lastActive: Record<string, string>
  /** Users whose access was reset (password + 2-step re-enrolment required). */
  accessReset: Record<string, string>
  journalSettings: Record<JournalCode, JournalSettings>
  /** Demo-login chips added for invited users, so reset can remove them. */
  addedLabels: string[]
  patch: (p: Partial<Omit<AdminState, 'patch' | 'reset'>>) => void
  reset: () => void
}

export const useAdminStore = create<AdminState>((set, get) => ({
  invites: {},
  lastActive: seedLastActive(),
  accessReset: {},
  journalSettings: buildJournalSettings(),
  addedLabels: [],
  patch: (p) => set(p),
  reset: () => {
    for (const id of get().addedLabels) delete DEMO_USER_LABELS[id]
    restoreJournalIdentity()
    set({ invites: {}, lastActive: seedLastActive(), accessReset: {}, journalSettings: buildJournalSettings(), addedLabels: [] })
  },
}))

registerReset(() => useAdminStore.getState().reset())

/** Track sign-ins: marks users active and accepts a pending invitation on first sign-in. */
useSession.subscribe((state, prev) => {
  if (state.userId && state.userId !== prev.userId) {
    const { lastActive, invites, patch } = useAdminStore.getState()
    const now = new Date().toISOString()
    const inv = invites[state.userId]
    patch({
      lastActive: { ...lastActive, [state.userId]: now },
      invites: inv && !inv.acceptedAt ? { ...invites, [state.userId]: { ...inv, acceptedAt: now } } : invites,
    })
  }
})
