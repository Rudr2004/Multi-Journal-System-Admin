import { RelativeTime } from './Time'

export interface TimelineItem { id: string; at: string; actor: string; text: string; note?: string }

export function Timeline({ items, empty = 'No activity yet.' }: { items: TimelineItem[]; empty?: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {items.map((i) => (
        <li key={i.id} className="relative">
          <span aria-hidden className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent ring-1 ring-line" />
          <p className="text-sm"><span className="font-medium">{i.actor}</span> {i.text}</p>
          {i.note && <p className="mt-1 rounded-md bg-subtle px-3 py-2 text-sm text-muted">“{i.note}”</p>}
          <p className="mt-0.5 text-xs text-muted"><RelativeTime value={i.at} /></p>
        </li>
      ))}
    </ol>
  )
}
