import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  reload: () => void
}

interface Settled<T> {
  key: string
  data?: T
  error?: Error
}

/** Minimal async loader: re-runs when `deps` change; exposes reload() for retry buttons. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [tick, setTick] = useState(0)
  const [settled, setSettled] = useState<Settled<T>>({ key: '' })
  const key = JSON.stringify([...deps, tick])
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    let live = true
    fnRef.current().then(
      (data) => live && setSettled({ key, data }),
      (error: Error) => live && setSettled({ key, error }),
    )
    return () => {
      live = false
    }
  }, [key])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const loading = settled.key !== key
  return { data: settled.data, loading, error: loading ? undefined : settled.error, reload }
}
