/** Every mock store registers a reset function so "Reset demo data" restores the whole prototype. */
const resets = new Set<() => void>()
export const registerReset = (fn: () => void) => {
  resets.add(fn)
}
export const resetAll = () => resets.forEach((fn) => fn())
