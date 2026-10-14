import { create } from 'zustand'
import { registerReset } from '../reset'
import {
  buildAnnouncements, buildBoard, buildCycles, buildEntries, buildSubmissions,
  type Announcement, type AwardCycle, type BoardMember, type CmsEntry, type FormSubmission,
} from '../data/website'
import { buildHomeSections, buildSeoRules, buildStaticPages, type HomeSections, type SeoRule, type StaticPage } from '../data/pageMgmt'
import type { JournalCode } from '@/shared/types'

interface WebsiteState {
  entries: CmsEntry[]
  board: BoardMember[]
  announcements: Announcement[]
  cycles: AwardCycle[]
  submissions: FormSubmission[]
  staticPages: StaticPage[]
  homeSections: Record<JournalCode, HomeSections>
  seoRules: SeoRule[]
  reset: () => void
  set: (p: Partial<Omit<WebsiteState, 'reset' | 'set'>>) => void
}

const seed = () => ({
  entries: buildEntries(),
  board: buildBoard(),
  announcements: buildAnnouncements(),
  cycles: buildCycles(),
  submissions: buildSubmissions(),
  staticPages: buildStaticPages(),
  homeSections: buildHomeSections(),
  seoRules: buildSeoRules(),
})

export const useWebsiteStore = create<WebsiteState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  set: (p) => set(p),
}))

registerReset(() => useWebsiteStore.getState().reset())
