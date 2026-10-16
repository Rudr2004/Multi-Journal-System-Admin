import { create } from 'zustand'
import { registerReset } from '../reset'

interface CredentialsState {
  /** Password by user id. A user without an entry still has the shared demo password. */
  passwords: Record<string, string>
  /** One-time reset links (token -> user id) issued by "Forgot password". */
  resetTokens: Record<string, string>
  patch: (p: Partial<Omit<CredentialsState, 'patch' | 'reset'>>) => void
  reset: () => void
}

export const useCredentials = create<CredentialsState>((set) => ({
  passwords: {},
  resetTokens: {},
  patch: (p) => set(p),
  reset: () => set({ passwords: {}, resetTokens: {} }),
}))

registerReset(() => useCredentials.getState().reset())
