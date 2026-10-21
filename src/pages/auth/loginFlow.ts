import { create } from 'zustand'

/**
 * The 5-minute `mfaToken` between the password step and the second step. Kept in memory only (not in the URL, history
 * state or storage): a reload sends the person back to the sign-in page, which is what the server expects anyway.
 */
interface LoginFlow {
  step: 'verify' | 'setup' | null
  mfaToken: string | null
  begin: (step: 'verify' | 'setup', mfaToken: string) => void
  clear: () => void
}

export const useLoginFlow = create<LoginFlow>((set) => ({
  step: null,
  mfaToken: null,
  begin: (step, mfaToken) => set({ step, mfaToken }),
  clear: () => set({ step: null, mfaToken: null }),
}))
