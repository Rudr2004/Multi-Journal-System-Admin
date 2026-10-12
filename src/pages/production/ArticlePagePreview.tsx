import { Download, Globe, Quote } from 'lucide-react'
import { formatDate } from '@/shared/formatters'
import { doiFor } from '@/shared/paperId'
import { journalByCode } from '@/mock/data/core'
import { NOW } from '@/mock/data/papers'
import { articleUrl } from '@/mock/api/production'
import type { ProductionRecord } from '@/mock/data/production'
import type { JournalCode } from '@/shared/types'
import { JOURNAL_COLORS } from '@/styles/tokens'
import { BlocksView } from './shared'

/** Mock of the public article page, as readers would see it on the journal website. */
export function ArticlePagePreview({ record, journal, paperId, issueLabel, pages, articleType, publishedOn }: {
  record: Pick<ProductionRecord, 'title' | 'authors' | 'abstract' | 'keywords' | 'references' | 'blocks' | 'seo' | 'finalFile'>
  journal: JournalCode; paperId: string; issueLabel?: string; pages?: string; articleType: string; publishedOn?: string
}) {
  const j = journalByCode(journal)
  const affiliations = Array.from(new Set(record.authors.map((a) => a.affiliation).filter(Boolean)))
  const when = formatDate(publishedOn ?? NOW.toISOString())
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-line bg-slate-100 px-3 py-2 text-xs text-slate-600">
        <Globe size={13} aria-hidden />
        <span className="truncate rounded bg-white px-2 py-0.5 ring-1 ring-slate-200">{articleUrl(journal, record.seo.slug || '…')}</span>
      </div>
      <header className="px-6 py-4 text-white" style={{ background: '#0F172A' }}>
        <div className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: JOURNAL_COLORS[journal] }} /><p className="text-sm font-semibold">{j.name}</p></div>
        <p className="mt-0.5 text-xs text-slate-300">ISSN {j.issn} · {j.domain}</p>
      </header>
      <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1fr_220px]">
        <article className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">{articleType}{issueLabel ? ` · ${issueLabel}` : ''}{pages ? ` · pp. ${pages}` : ''}</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold leading-snug text-slate-900">{record.title}</h2>
          <p className="mt-3 text-sm text-slate-800">
            {record.authors.map((a, i) => <span key={a.email + i}>{i > 0 && ', '}<span className="font-medium">{a.name || 'Unnamed author'}</span><sup className="text-slate-500">{affiliations.indexOf(a.affiliation) + 1 || ''}</sup></span>)}
          </p>
          <ol className="mt-1 space-y-0.5 text-xs text-slate-600">{affiliations.map((a, i) => <li key={a}><sup>{i + 1}</sup> {a}</li>)}</ol>
          <p className="mt-3 text-xs text-slate-600">Published online {when} · DOI: <span className="font-mono text-slate-800">{doiFor(paperId)}</span></p>
          <section className="mt-5 rounded-lg bg-slate-50 p-4" aria-label="Abstract">
            <h3 className="text-sm font-semibold text-slate-900">Abstract</h3>
            <p className="mt-1 text-[13.5px] leading-6 text-slate-800">{record.abstract}</p>
            <p className="mt-3 text-xs text-slate-600"><span className="font-semibold text-slate-800">Keywords: </span>{record.keywords.filter(Boolean).join(' · ')}</p>
          </section>
          <div className="mt-5"><BlocksView blocks={record.blocks} /></div>
          <section className="mt-6" aria-label="References">
            <h3 className="text-base font-semibold text-slate-900">References</h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-5 text-slate-700">{record.references.filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}</ol>
          </section>
        </article>
        <aside aria-label="Article tools" className="space-y-4 text-sm">
          <button type="button" tabIndex={-1} className="btn-primary w-full" aria-disabled="true"><Download size={15} aria-hidden /> Download PDF</button>
          {record.finalFile && <p className="-mt-2 text-xs text-slate-500">{record.finalFile.name}</p>}
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800"><Quote size={13} aria-hidden /> How to cite</p>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">{record.authors.map((a) => a.name.split(' ').slice(-1)[0]).join(', ')} ({new Date(publishedOn ?? NOW).getFullYear()}). {record.title}. <span className="italic">{j.name}</span>{issueLabel ? `, ${issueLabel}` : ''}. https://doi.org/{doiFor(paperId)}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
