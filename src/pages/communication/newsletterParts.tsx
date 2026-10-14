import type { ReactNode } from 'react'
import { Badge } from '@/components/Badges'
import type { CampaignAudience, CampaignStatus, SubscriberStatus } from '@/mock/data/newsletter'

const SUB_TONE = { confirmed: 'success', pending: 'warning', unsubscribed: 'neutral' } as const
const SUB_LABEL: Record<SubscriberStatus, string> = { confirmed: 'Confirmed', pending: 'Pending', unsubscribed: 'Unsubscribed' }
export const SubscriberStatusBadge = ({ status }: { status: SubscriberStatus }) => <Badge tone={SUB_TONE[status]}>{SUB_LABEL[status]}</Badge>

const CMP_TONE = { draft: 'neutral', scheduled: 'info', sent: 'success' } as const
const CMP_LABEL: Record<CampaignStatus, string> = { draft: 'Draft', scheduled: 'Scheduled', sent: 'Sent' }
export const CampaignStatusBadge = ({ status }: { status: CampaignStatus }) => <Badge tone={CMP_TONE[status]}>{CMP_LABEL[status]}</Badge>

export const audienceSummary = (a: CampaignAudience) =>
  `${a.journals.length ? a.journals.join(', ') : 'All journals'} · ${a.sources.length ? a.sources.join(', ') : 'All sources'}`

/* ------------------ tiny markup renderer (no raw HTML is ever injected) ------------------ */

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined)

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let i = 0
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const key = `${keyBase}-${i++}`
    if (m[1] !== undefined) out.push(<strong key={key}>{m[1]}</strong>)
    else if (m[2] !== undefined) out.push(<em key={key}>{m[2]}</em>)
    else {
      const href = safeUrl(m[4])
      out.push(href ? <a key={key} href={href} target="_blank" rel="noreferrer" className="text-accent underline">{m[3]}</a> : m[3])
    }
    last = at + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Renders ## headings, "- " bullets, paragraphs, **bold**, _italic_ and [links](https://...). */
export function Markup({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <div className="space-y-3 text-sm leading-6">
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => l.startsWith('- '))) {
          return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.slice(2), `${i}-${j}`)}</li>)}</ul>
        }
        if (b.startsWith('## ')) return <h3 key={i} className="text-base font-semibold">{inline(b.slice(3), String(i))}</h3>
        return <p key={i} className="whitespace-pre-line">{inline(b, String(i))}</p>
      })}
    </div>
  )
}
