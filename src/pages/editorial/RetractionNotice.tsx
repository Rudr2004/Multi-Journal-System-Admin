import { Ban, Globe, ShieldCheck } from 'lucide-react'
import { SectionCard } from '@/components/Card'
import { DescriptionList } from '@/components/Form'
import { formatDate } from '@/shared/formatters'
import { journalByCode } from '@/mock/data/core'
import type { ProductionRecord } from '@/mock/data/production'
import type { Paper } from '@/shared/types'

/** The formal retraction notice that replaces the article page at its original URL, plus the consent record. */
export function RetractionNotice({ paper, record }: { paper: Paper; record: ProductionRecord }) {
  const r = record.retraction
  if (!r) return null
  const j = journalByCode(paper.journal)
  return (
    <div className="space-y-5">
      <SectionCard title="Article page at the original URL">
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-line bg-slate-100 px-3 py-2 text-xs text-slate-600"><Globe size={13} aria-hidden /><span className="truncate rounded bg-white px-2 py-0.5 ring-1 ring-slate-200">{r.url}</span></div>
          <div className="px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{j.name}</p>
            <div className="mt-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"><Ban size={16} aria-hidden /> RETRACTED ARTICLE</div>
            <h2 className="mt-4 font-serif text-xl font-semibold text-slate-900">Retraction notice: {record.title}</h2>
            <p className="mt-2 text-sm text-slate-700">{record.authors.map((a) => a.name).join(', ')}</p>
            <p className="mt-1 text-xs text-slate-600">DOI: <span className="font-mono text-slate-800">{r.doi}</span> · Retracted {formatDate(r.at)}</p>
            <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-800">{r.notice}</p>
            <p className="mt-4 text-xs text-slate-500">The original article is no longer available. Its DOI and bibliographic record are kept for transparency and research integrity.</p>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Retraction record">
        <DescriptionList cols={2} items={[
          { label: 'Status', value: 'Retracted' },
          { label: 'Retracted by (Editor approval)', value: `${r.approvedBy} · ${formatDate(r.at)}` },
          { label: 'Stage when retracted', value: r.wasPublished ? 'After publication' : 'Before publication' },
          { label: 'Reason', value: r.reason },
          { label: 'Author consent received from', value: `${r.consent.from} · ${formatDate(r.consent.date)}` },
          { label: 'Consent email', value: r.consent.fileName ?? 'Pasted text only' },
        ]} />
        <blockquote className="mt-3 rounded-md border-l-4 border-slate-300 bg-subtle px-3 py-2 text-sm text-muted">{r.consent.excerpt}</blockquote>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><ShieldCheck size={14} aria-hidden /> Recorded in the timeline and the audit log. A confirmation email was sent to the author.</p>
      </SectionCard>
    </div>
  )
}
