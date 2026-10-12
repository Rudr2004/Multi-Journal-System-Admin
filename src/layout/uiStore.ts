import { create } from 'zustand'

interface UiState {
  paletteOpen: boolean
  mobileNavOpen: boolean
  setPalette: (v: boolean) => void
  setMobileNav: (v: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  mobileNavOpen: false,
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
}))
