import { ExternalLink, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PageBlock } from '@/mock/data/pageMgmt'

/** Renders page blocks the way the journal website shows them. */
export function BlocksPreview({ title, blocks }: { title: string; blocks: PageBlock[] }) {
  return (
    <article className="mx-auto max-w-2xl space-y-3 text-[15px] leading-7">
      <h1 className="text-2xl font-semibold tracking-tight">{title || 'Untitled page'}</h1>
      {blocks.length === 0 && <p className="text-sm text-muted">This page has no content yet.</p>}
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return b.level === '2'
              ? <h2 key={i} className="pt-2 text-xl font-semibold">{b.text || 'Heading'}</h2>
              : <h3 key={i} className="pt-1 text-base font-semibold">{b.text || 'Sub-heading'}</h3>
          case 'paragraph':
            return <p key={i} className="whitespace-pre-line">{b.text || 'Paragraph text'}</p>
          case 'list': {
            const items = b.text.split('\n').map((x) => x.trim()).filter(Boolean)
            const Tag = b.ordered ? 'ol' : 'ul'
            return <Tag key={i} className={cn('space-y-1 pl-5', b.ordered ? 'list-decimal' : 'list-disc')}>{(items.length ? items : ['List item']).map((x, k) => <li key={k}>{x}</li>)}</Tag>
          }
          case 'callout':
            return (
              <div key={i} role="note" className={cn('flex gap-2 rounded-md border p-3 text-sm', b.tone === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900')}>
                {b.tone === 'warning' ? <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> : <Info size={16} className="mt-0.5 shrink-0" aria-hidden />}
                <p>{b.text || 'Callout text'}</p>
              </div>
            )
          case 'link':
            return <p key={i}><span className="inline-flex items-center gap-1 text-accent underline">{b.text || 'Link text'} <ExternalLink size={13} aria-hidden /></span>{b.url && <span className="ml-2 text-xs text-muted">{b.url}</span>}</p>
        }
      })}
    </article>
  )
}
