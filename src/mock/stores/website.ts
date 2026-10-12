import { create } from 'zustand'
import { registerReset } from '../reset'
import {
  buildAnnouncements, buildBoard, buildCycles, buildEntries, buildSubmissions,
  type Announcement, type AwardCycle, type BoardMember, type CmsEntry, type FormSubmission,
} from '../data/website'

interface WebsiteState {
  entries: CmsEntry[]
  board: BoardMember[]
  announcements: Announcement[]
  cycles: AwardCycle[]
  submissions: FormSubmission[]
  reset: () => void
  set: (p: Partial<Omit<WebsiteState, 'reset' | 'set'>>) => void
}

const seed = () => ({
  entries: buildEntries(),
  board: buildBoard(),
  announcements: buildAnnouncements(),
  cycles: buildCycles(),
  submissions: buildSubmissions(),
})

export const useWebsiteStore = create<WebsiteState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  set: (p) => set(p),
}))

registerReset(() => useWebsiteStore.getState().reset())
