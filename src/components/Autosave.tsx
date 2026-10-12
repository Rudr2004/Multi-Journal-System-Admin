import { useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { formatRelative } from '@/shared/formatters'

/** Fake autosave: pass any value that changes when the user edits; shows Saving… then Saved. */
export function AutosaveIndicator({ watch }: { watch: unknown }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [at, setAt] = useState<Date>()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setState('saving')
    const t = setTimeout(() => { setState('saved'); setAt(new Date()) }, 900)
    return () => clearTimeout(t)
  }, [watch])
  if (state === 'idle') return <span className="text-xs text-muted">Changes save automatically</span>
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted">
      {state === 'saving' ? <><Loader2 size={13} className="animate-spin" aria-hidden /> Saving…</> : <><Check size={13} className="text-green-600" aria-hidden /> Saved {at && formatRelative(at)}</>}
    </span>
  )
}
