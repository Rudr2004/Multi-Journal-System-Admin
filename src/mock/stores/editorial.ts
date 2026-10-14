import { create } from 'zustand'
import type { PaperEvent } from '@/shared/types'
import { registerReset } from '../reset'
import { buildPapers } from '../data/papers'
import { buildEditorialSeed, buildPanelOverrides, type DecisionRecord, type FileVersion, type ReminderState, type ReviewDraft, type ReviewRecord } from '../data/editorial'

interface EditorialState {
  reviews: ReviewRecord[]
  decisions: DecisionRecord[]
  /** Earlier timeline events seeded for every paper (live events live in the shared data store). */
  history: PaperEvent[]
  files: Record<string, FileVersion[]>
  reminders: Record<string, ReminderState>
  /** Reviewer drafts keyed by `${paperId}:${userId}`. */
  drafts: Record<string, ReviewDraft>
  /** paperId to external Review Panel Member id, applied at read time (see buildPanelOverrides). */
  panelOverrides: Record<string, string>
  reset: () => void
  patch: (p: Partial<Omit<EditorialState, 'reset' | 'patch'>>) => void
}

const seed = () => {
  const papers = buildPapers()
  return { ...buildEditorialSeed(papers), drafts: {} as Record<string, ReviewDraft>, panelOverrides: buildPanelOverrides(papers) }
}

export const useEditorialStore = create<EditorialState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  patch: (p) => set(p),
}))

registerReset(() => useEditorialStore.getState().reset())

export const draftKey = (paperId: string, userId: string) => `${paperId}:${userId}`
