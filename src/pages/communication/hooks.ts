import { useEffect, useState } from 'react'

/** Re-renders every `ms` milliseconds and returns the current time (for countdowns). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const h = () => setMatch(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [query])
  return match
}

/** 5 h 12 min 08 s */
export function formatCountdown(ms: number, withSeconds = true): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`
  return withSeconds ? `${h} h ${pad(m)} min ${pad(s)} s` : `${h} h ${pad(m)} min`
}
