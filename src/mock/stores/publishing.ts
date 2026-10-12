import { create } from 'zustand'
import type { Issue } from '@/shared/types'
import { useDataStore } from '../store'
import { registerReset } from '../reset'
import {
  buildConferenceLinks, buildConferences, buildProceedingsIssues,
  type CertificateRecord, type Conference, type CoverImage,
} from '../data/publishing'

interface PublishingState {
  conferences: Conference[]
  /** conferenceId -> linked Paper IDs */
  links: Record<string, string[]>
  /** `${paperId}#${authorIndex}` -> certificate record */
  certs: Record<string, CertificateRecord>
  /** issueId -> cover image placeholder */
  covers: Record<string, CoverImage>
  reset: () => void
  patch: (p: Partial<Omit<PublishingState, 'reset' | 'patch'>>) => void
}

/**
 * Shapes the shared seed for the publishing demo: a few already-published papers are left unassigned
 * (published online, waiting for an issue) so the issue editor has candidates to pick from, and the
 * concluded conferences get their proceedings issues. Returns the freed articles by conference.
 */
function applyIssueDemoSeed(conferences: ReturnType<typeof buildConferences>) {
  const { issues, patch } = useDataStore.getState()
  const freed: Record<string, string[]> = {}
  const next: Issue[] = issues.map((i) => {
    if (i.volume !== 3 || i.number !== 3 || i.articleIds.length < 3) return i
    const drop = i.articleIds.slice(-2)
    const conf = conferences.find((c) => c.journal === i.journal && c.id === 'conf-findev-2026')
    if (conf) freed[conf.id] = drop
    const pages = { ...i.pages }
    drop.forEach((id) => delete pages[id])
    return { ...i, articleIds: i.articleIds.slice(0, -2), pages }
  })
  patch({ issues: [...next, ...buildProceedingsIssues(conferences, freed)] })
}

function seed() {
  const conferences = buildConferences()
  applyIssueDemoSeed(conferences)
  return {
    conferences,
    links: buildConferenceLinks(useDataStore.getState().papers, conferences),
    certs: {} as Record<string, CertificateRecord>,
    covers: {} as Record<string, CoverImage>,
  }
}

export const usePublishingStore = create<PublishingState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  patch: (p) => set(p),
}))

registerReset(() => usePublishingStore.getState().reset())
