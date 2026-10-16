import { create } from 'zustand'
import type { JournalCode } from '@/shared/types'
import { registerReset } from '../reset'

/** An instruction from the Editor to the Associate Editor working on a paper. */
export interface EditorNote {
  id: string
  paperId: string
  journal: JournalCode
  text: string
  by: string
  at: string
}

interface NotesState {
  /** Notes by Paper ID, newest first. */
  notes: Record<string, EditorNote[]>
  patch: (p: Partial<Pick<NotesState, 'notes'>>) => void
  reset: () => void
}

export const useNotesStore = create<NotesState>((set) => ({
  notes: {},
  patch: (p) => set(p),
  reset: () => set({ notes: {} }),
}))

registerReset(() => useNotesStore.getState().reset())
