const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 17)

const PALETTES: [string, string][] = [
  ['#C7D2FE', '#4F46E5'], ['#BAE6FD', '#0369A1'], ['#BBF7D0', '#15803D'], ['#FDE68A', '#B45309'],
  ['#FBCFE8', '#BE185D'], ['#DDD6FE', '#6D28D9'], ['#FECACA', '#B91C1C'], ['#A7F3D0', '#047857'],
]

/**
 * A portrait-style placeholder image (data URL) generated from a name. Stands in for the photo an author or
 * member uploads; the real photo replaces it once one exists.
 */
export function portraitDataUrl(name: string): string {
  const h = hash(name)
  const [bg, fg] = PALETTES[h % PALETTES.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${bg}"/><circle cx="48" cy="38" r="17" fill="${fg}" opacity="0.9"/><path d="M14 96c2-22 16-34 34-34s32 12 34 34z" fill="${fg}" opacity="0.9"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
