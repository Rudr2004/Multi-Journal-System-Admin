import { create } from 'zustand'
import type { JournalCode } from '@/shared/types'
import { JOURNAL_CODES } from '../data/core'
import { buildPapers } from '../data/papers'
import { generatedAuthors } from '../data/authors'
import { registerReset } from '../reset'
import { seedBackdated, seedChangeRequests, type BackdatedItem, type ChangeRequest, type ProductionRecord } from '../data/production'

interface ProductionState {
  /** Production workspace records, created lazily per paper. */
  records: Record<string, ProductionRecord>
  /** Next backdated sequence number per journal (starts at 100). */
  backdatedSeq: Record<JournalCode, number>
  backdated: BackdatedItem[]
  changeRequests: ChangeRequest[]
  reset: () => void
  patch: (p: Partial<Omit<ProductionState, 'reset' | 'patch'>>) => void
}

function seed() {
  const seq = Object.fromEntries(JOURNAL_CODES.map((c) => [c, 100])) as Record<JournalCode, number>
  const backdated = seedBackdated()
  for (const b of backdated) seq[b.journal] = Math.max(seq[b.journal], Number(b.finalId.split('.').pop()) + 1)
  return {
    records: {} as Record<string, ProductionRecord>,
    backdatedSeq: seq,
    backdated,
    changeRequests: seedChangeRequests(buildPapers(), generatedAuthors),
  }
}

export const useProductionStore = create<ProductionState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  patch: (p) => set(p),
}))

registerReset(() => useProductionStore.getState().reset())
