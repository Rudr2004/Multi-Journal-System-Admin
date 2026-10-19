import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CalendarRange, Download } from 'lucide-react'
import type { DateRange } from '@/mock/api/dashboard'

/** Date and time filter for the dashboards: presets or a custom range with date and time (local time, IST in the prototype). */
const PRESETS = [
  { value: 'all', label: 'All time', hours: 0 },
  { value: '24h', label: 'Last 24 hours', hours: 24 },
  { value: '7d', label: 'Last 7 days', hours: 24 * 7 },
  { value: '30d', label: 'Last 30 days', hours: 24 * 30 },
  { value: '90d', label: 'Last 90 days', hours: 24 * 90 },
  { value: 'custom', label: 'Custom date and time', hours: 0 },
] as const

const localInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm")

export function useRangeState() {
  const [preset, setPreset] = useState<string>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const range = useMemo<DateRange>(() => {
    if (preset === 'custom') return { from: from || undefined, to: to || undefined }
    const p = PRESETS.find((x) => x.value === preset)
    return p && p.hours ? { from: localInput(new Date(Date.now() - p.hours * 3_600_000)) } : {}
  }, [preset, from, to])
  const clear = () => { setPreset('all'); setFrom(''); setTo('') }
  const label = useMemo(() => {
    if (preset === 'all') return 'All time'
    if (preset !== 'custom') return PRESETS.find((x) => x.value === preset)?.label ?? ''
    const f = (v: string) => (v ? format(new Date(v), 'd MMM yyyy, HH:mm') : 'start')
    return `${f(from)} to ${to ? format(new Date(to), 'd MMM yyyy, HH:mm') : 'now'}`
  }, [preset, from, to])
  return { preset, setPreset, from, setFrom, to, setTo, range, clear, label, active: preset !== 'all' }
}
export type RangeState = ReturnType<typeof useRangeState>

export function RangeBar({ s, onExport, exporting, disabled, what = 'submissions' }: { s: RangeState; onExport: () => void; exporting?: boolean; disabled?: boolean; what?: string }) {
  const bad = !!(s.from && s.to && s.to < s.from)
  return (
    <section aria-label="Date and time filter" className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      <span className="inline-flex items-center gap-2 text-sm font-medium"><CalendarRange size={16} aria-hidden /> Show {what} from</span>
      <select aria-label="Date range" className="input !w-auto min-w-[170px]" value={s.preset} onChange={(e) => s.setPreset(e.target.value)}>
        {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {s.preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <input type="datetime-local" aria-label="From date and time" className="input !w-auto" value={s.from} max={s.to || undefined} onChange={(e) => s.setFrom(e.target.value)} />
          <span aria-hidden>to</span>
          <input type="datetime-local" aria-label="To date and time" className="input !w-auto" value={s.to} min={s.from || undefined} onChange={(e) => s.setTo(e.target.value)} />
        </div>
      )}
      {s.active && <button type="button" className="btn-ghost !h-8" onClick={s.clear}>Clear</button>}
      {bad && <span role="alert" className="text-xs font-medium text-red-600">The end must be after the start.</span>}
      <span className="text-xs text-muted">Applies to the figures, pipeline and lists below.</span>
      <button type="button" className="btn-secondary ml-auto" onClick={onExport} disabled={disabled || exporting}>
        <Download size={15} strokeWidth={1.5} aria-hidden /> {exporting ? 'Exporting…' : 'Export CSV'}
      </button>
    </section>
  )
}
