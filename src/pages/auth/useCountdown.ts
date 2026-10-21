import { useCallback, useEffect, useState } from 'react'

/** Counts down whole seconds from `start(seconds)`; `remaining` is 0 when idle or finished. */
export function useCountdown() {
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [deadline])
  const start = useCallback((seconds: number) => {
    const t = Date.now()
    setNow(t)
    setDeadline(t + seconds * 1000)
  }, [])
  const remaining = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))
  return { remaining, start }
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
