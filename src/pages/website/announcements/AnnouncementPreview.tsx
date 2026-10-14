import { ArrowUpRight, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnnouncementChannel, AnnouncementType } from '@/mock/data/website'

export interface PreviewItem { id?: string; text: string; detail?: string; link?: string; type: AnnouncementType; highlight: boolean; pinned: boolean }

const TICKER_CSS = `
@keyframes ann-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.ann-ticker .ann-track { display: inline-flex; width: max-content; animation: ann-ticker 28s linear infinite; }
.ann-ticker:hover .ann-track, .ann-ticker:focus-within .ann-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .ann-ticker .ann-track { animation: none; } .ann-ticker { overflow-x: auto; } }
`

function TickerItem({ it, current }: { it: PreviewItem; current?: boolean }) {
  return (
    <span className={cn('mx-6 inline-flex items-center gap-2 whitespace-nowrap text-sm', current && 'font-medium')}>
      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', it.highlight ? 'bg-amber-400 text-slate-900' : 'bg-white/15 text-white')}>{it.type}</span>
      {it.pinned && <Pin size={12} strokeWidth={2} aria-label="Pinned" />}
      <span>{it.text || 'Your notification text appears here'}</span>
      {it.link && <span className="inline-flex items-center gap-0.5 underline underline-offset-2">Read more <ArrowUpRight size={12} aria-hidden /></span>}
    </span>
  )
}

/** Mock of the website: the scrolling notification strip (pauses on hover) or the Notices tab on the home page. */
export function AnnouncementPreview({ channel, current, others, journalName }: { channel: AnnouncementChannel; current: PreviewItem; others: PreviewItem[]; journalName: string }) {
  const list = [current, ...others].sort((a, b) => Number(b.pinned) - Number(a.pinned))
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-surface" aria-label="Live preview of the website">
      <figcaption className="flex items-center justify-between border-b border-line bg-subtle px-3 py-1.5 text-xs text-muted">
        <span>Live preview: {channel === 'scrolling' ? 'scrolling notifications' : 'Notices tab'}</span>
        <span>{journalName}</span>
      </figcaption>
      {channel === 'scrolling' ? (
        <div>
          <style>{TICKER_CSS}</style>
          <div className="ann-ticker overflow-hidden bg-slate-900 py-2 text-white" role="marquee" aria-label="Scrolling notifications preview, hover to pause">
            <div className="ann-track">
              {[0, 1].map((n) => (
                <span key={n} className="inline-flex" aria-hidden={n === 1}>
                  {list.map((it, i) => <TickerItem key={`${n}-${i}`} it={it} current={it === current} />)}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-1 p-3" aria-hidden>
            <div className="h-3 w-1/3 rounded bg-slate-200" />
            <div className="h-2 w-2/3 rounded bg-slate-100" />
            <div className="h-2 w-1/2 rounded bg-slate-100" />
          </div>
          <p className="border-t border-line px-3 py-1.5 text-xs text-muted">Appears above every page of the website. Hover to pause.</p>
        </div>
      ) : (
        <div className="p-3">
          <div role="tablist" aria-label="Home page tabs (preview)" className="mb-2 flex gap-4 border-b border-line text-sm">
            <span className="border-b-2 border-transparent pb-1.5 text-muted">Latest articles</span>
            <span className="border-b-2 border-accent pb-1.5 font-medium text-accent">Notices <span className="rounded-full bg-accent-soft px-1.5 text-xs">{list.length}</span></span>
            <span className="border-b-2 border-transparent pb-1.5 text-muted">Most read</span>
          </div>
          <ul className="space-y-2">
            {list.map((it, i) => (
              <li key={i} className={cn('rounded-md border p-2.5 text-sm', it.highlight ? 'border-amber-300 bg-amber-50' : 'border-line', it === current && 'ring-2 ring-accent/40')}>
                <p className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 font-semibold text-accent">{it.type}</span>
                  {it.pinned && <span className="inline-flex items-center gap-0.5 text-muted"><Pin size={11} strokeWidth={2} aria-hidden /> Pinned</span>}
                  {it === current && <span className="text-accent">This notice</span>}
                </p>
                <p className="mt-1 font-medium">{it.text || 'Your notification text appears here'}</p>
                {it.detail && <p className="mt-0.5 text-xs text-muted">{it.detail}</p>}
                {it.link && <p className="mt-1 inline-flex items-center gap-0.5 text-xs text-accent underline">Read more <ArrowUpRight size={11} aria-hidden /></p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  )
}
