import { create } from 'zustand'
import type { JournalCode } from '@/shared/types'
import { JOURNAL_CODES } from '../data/core'
import { buildPapers } from '../data/papers'
import { generatedAuthors } from '../data/authors'
import { registerReset } from '../reset'
import { useDataStore } from '../store'
import { seedBackdated, seedChangeRequests, type BackdatedItem, type BackdatedSubmission, type ChangeRequest, type ProductionRecord } from '../data/production'

interface ProductionState {
  /** Production workspace records, created lazily per paper. */
  records: Record<string, ProductionRecord>
  /** Next backdated sequence number per journal (starts at 100). */
  backdatedSeq: Record<JournalCode, number>
  backdated: BackdatedItem[]
  /** Form data saved by the Editor for backdated articles, keyed by the article's current Paper ID. */
  backdatedSubmissions: Record<string, BackdatedSubmission>
  changeRequests: ChangeRequest[]
  reset: () => void
  patch: (p: Partial<Omit<ProductionState, 'reset' | 'patch'>>) => void
}

function seed() {
  const seq = Object.fromEntries(JOURNAL_CODES.map((c) => [c, 100])) as Record<JournalCode, number>
  const backdated = seedBackdated()
  // one backdated article is still in production so the Associate Editor's Backdated view is not empty
  const { papers, issues } = useDataStore.getState()
  const inProd = papers.find((p) => p.journal === 'JIMRT' && p.status === 'in_production')
  const past = issues.filter((i) => i.journal === 'JIMRT' && i.status === 'published' && !i.conferenceId).sort((a, b) => b.publicationDate.localeCompare(a.publicationDate))[1]
  if (inProd && past) {
    backdated.unshift({
      id: `bd-${inProd.id}`, journal: 'JIMRT', originalId: inProd.id, finalId: inProd.id, generatedId: false, title: inProd.title, originalStatus: 'Rejected',
      issueId: past.id, issueLabel: past.label, issueDate: past.publicationDate, createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), createdBy: 'Rohan Mehta',
      note: 'Rejection was issued in error after a reviewer mix-up; the Editor re-accepted the paper for the issue it was originally submitted for.', status: 'in_production',
    })
  }
  for (const b of backdated.filter((x) => x.generatedId)) seq[b.journal] = Math.max(seq[b.journal], Number(b.finalId.split('.').pop()) + 1)
  return {
    records: {} as Record<string, ProductionRecord>,
    backdatedSeq: seq,
    backdated,
    backdatedSubmissions: {} as Record<string, BackdatedSubmission>,
    changeRequests: seedChangeRequests(buildPapers(), generatedAuthors),
  }
}

export const useProductionStore = create<ProductionState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  patch: (p) => set(p),
}))

registerReset(() => useProductionStore.getState().reset())
