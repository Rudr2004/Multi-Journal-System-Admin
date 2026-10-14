import { create } from 'zustand'
import { registerReset } from '../reset'
import { buildCampaigns, buildSubscribers, type Campaign, type Subscriber } from '../data/newsletter'

interface NewsletterState {
  subscribers: Subscriber[]
  campaigns: Campaign[]
  reset: () => void
  patch: (p: Partial<Omit<NewsletterState, 'reset' | 'patch'>>) => void
}

const seed = () => ({ subscribers: buildSubscribers(), campaigns: buildCampaigns() })

export const useNewsletterStore = create<NewsletterState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  patch: (p) => set(p),
}))

registerReset(() => useNewsletterStore.getState().reset())
