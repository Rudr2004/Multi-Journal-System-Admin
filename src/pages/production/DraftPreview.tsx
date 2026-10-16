import { useMemo } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { JournalCode } from '@/shared/types'
import { Dialog } from '@/components/Dialog'
import { useDataStore } from '@/mock/store'
import { wordCount, type ProductionRecord } from '@/mock/data/production'
import { ArticlePagePreview } from './ArticlePagePreview'
import { nextPages } from '@/mock/api/production'

type Rec = Pick<ProductionRecord, 'title' | 'authors' | 'abstract' | 'keywords' | 'references' | 'blocks' | 'seo' | 'finalFile'>

/** Online preview of the draft article with the journal-guideline checks the team verifies before publishing. */
export function DraftPreview({ open, onClose, record, journal, paperId, articleType }: { open: boolean; onClose: () => void; record: Rec; journal: JournalCode; paperId: string; articleType: string }) {
  const issues = useDataStore((s) => s.issues)
  const issue = useMemo(() => issues.find((i) => i.articleIds.includes(paperId)) ?? issues.filter((i) => i.journal === journal && !i.conferenceId && (i.status === 'open' || i.status === 'in_production')).sort((a, b) => a.publicationDate.localeCompare(b.publicationDate))[0], [issues, paperId, journal])
  const words = wordCount(record.abstract)
  const headings = record.blocks.filter((b) => b.kind === 'heading').length
  const figs = record.blocks.filter((b) => b.kind === 'figure')
  const tables = record.blocks.filter((b) => b.kind === 'table')
  const checks: { group: string; label: string; pass: boolean }[] = [
    { group: 'Content', label: `Abstract is 100–300 words (${words})`, pass: words >= 100 && words <= 300 },
    { group: 'Content', label: `Body has section headings (${headings})`, pass: headings >= 2 },
    { group: 'Content', label: `References listed (${record.references.filter((r) => r.trim()).length}, at least 5)`, pass: record.references.filter((r) => r.trim()).length >= 5 },
    { group: 'Formatting', label: 'Every figure has a caption and alt text', pass: figs.every((f) => f.kind === 'figure' && f.caption.trim() && f.alt.trim()) },
    { group: 'Formatting', label: 'Every table has a caption', pass: tables.every((t) => t.kind === 'table' && t.caption.trim()) },
    { group: 'Metadata', label: 'Title is 10–200 characters', pass: record.title.trim().length >= 10 && record.title.trim().length <= 200 },
    { group: 'Metadata', label: 'Every author has a name, email and affiliation', pass: record.authors.length > 0 && record.authors.every((a) => a.name.trim() && a.email.trim() && a.affiliation.trim()) },
    { group: 'Metadata', label: '3–8 keywords', pass: record.keywords.filter((k) => k.trim()).length >= 3 && record.keywords.filter((k) => k.trim()).length <= 8 },
    { group: 'Layout', label: 'SEO title (60) and description (160) fit', pass: !!record.seo.title.trim() && record.seo.title.length <= 60 && !!record.seo.description.trim() && record.seo.description.length <= 160 },
    { group: 'Layout', label: 'Final typeset PDF is uploaded', pass: !!record.finalFile },
  ]
  const groups = [...new Set(checks.map((c) => c.group))]
  const failing = checks.filter((c) => !c.pass).length
  return (
    <Dialog open={open} onClose={onClose} width={1080} title="Draft article preview" description="How the article will look online. Nothing here is public until the Editor publishes it."
      footer={<button className="btn-primary" type="button" onClick={onClose}>Close preview</button>}>
      {open && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="max-h-[70vh] min-w-0 overflow-auto rounded-lg"><ArticlePagePreview record={record} journal={journal} paperId={paperId} articleType={articleType} issueLabel={issue?.label} pages={issue ? nextPages(issue, paperId) : undefined} publishedOn={issue?.publicationDate} /></div>
          <aside aria-label="Journal guideline checks" className="space-y-3">
            <p className={failing ? 'text-sm font-medium text-amber-800' : 'text-sm font-medium text-green-700'}>{failing ? `${failing} of ${checks.length} guideline checks need attention` : 'All guideline checks pass'}</p>
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g}</p>
                <ul className="space-y-1.5">
                  {checks.filter((c) => c.group === g).map((c) => (
                    <li key={c.label} className="flex items-start gap-2 text-sm">
                      {c.pass ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" aria-label="Pass" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-red-600" aria-label="Fail" />}
                      <span className={c.pass ? '' : 'text-red-700'}>{c.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>
        </div>
      )}
    </Dialog>
  )
}
