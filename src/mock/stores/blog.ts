import { create } from 'zustand'
import { registerReset } from '../reset'
import { buildPosts, buildResources, type BlogPost, type BlogResource } from '../data/blog'

interface BlogState {
  posts: BlogPost[]
  resources: BlogResource[]
  reset: () => void
  set: (p: Partial<Omit<BlogState, 'reset' | 'set'>>) => void
}

const seed = () => ({ posts: buildPosts(), resources: buildResources() })

export const useBlogStore = create<BlogState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  set: (p) => set(p),
}))

registerReset(() => useBlogStore.getState().reset())
