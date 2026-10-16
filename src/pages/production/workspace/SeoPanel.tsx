import { Copy, RefreshCw } from 'lucide-react'
import { toast } from '@/components/Toasts'
import { CharCount, FormField } from '@/components/Form'
import { doiFor } from '@/shared/paperId'
import { draftSeo, isValidSlug, slugify } from '@/mock/data/production'
import { articleUrl } from '@/mock/api/production'
import type { JournalCode } from '@/shared/types'
import type { Draft } from './MetadataChecklist'

/** SEO title/description are drafted from the article; any manual edit sticks until regenerated. */
export function SeoPanel({ draft, update, readOnly, journal, paperId, originalAbstract }: { draft: Draft; update: (p: Partial<Draft>) => void; readOnly: boolean; journal: JournalCode; paperId: string; originalAbstract?: string }) {
  const copyAbstract = async () => {
    try { await navigator.clipboard.writeText(originalAbstract || draft.abstract); toast.success('Abstract copied. Use it to rewrite the SEO title and description.') } catch { toast.info('Copy is not available here. Select the abstract in the manuscript tab and copy it manually.') }
  }
  const { seo } = draft
  const setSeo = (p: Partial<Draft['seo']>) => update({ seo: { ...seo, ...p } })
  const regenerate = () => {
    const d = draftSeo(draft.title, draft.abstract, draft.keywords)
    update({ seo: { ...d, titleEdited: false, descriptionEdited: false, slugEdited: false } })
  }
  const slugErr = seo.slug && !isValidSlug(seo.slug) ? 'Use lowercase letters, numbers and hyphens (5–80 characters).' : undefined
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Drafted automatically from the title, abstract and keywords. Edit any field to override it.</p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={copyAbstract}><Copy size={14} aria-hidden /> Copy abstract</button>
            <button type="button" className="btn-secondary" disabled={readOnly} onClick={regenerate}><RefreshCw size={14} aria-hidden /> Regenerate</button>
          </div>
        </div>
        <FormField label="SEO title" required error={seo.title.length > 60 ? 'Keep the SEO title to 60 characters or fewer.' : !seo.title.trim() ? 'The SEO title is required.' : undefined}>
          {(a) => (
            <>
              <input {...a} className="input" value={seo.title} disabled={readOnly} onChange={(e) => setSeo({ title: e.target.value, titleEdited: true })} />
              <div className="mt-1 flex justify-between"><span className="text-xs text-muted">{seo.titleEdited ? 'Manually edited' : 'Auto-generated'}</span><CharCount value={seo.title} max={60} /></div>
            </>
          )}
        </FormField>
        <FormField label="SEO description" required error={seo.description.length > 160 ? 'Keep the description to 160 characters or fewer.' : !seo.description.trim() ? 'The SEO description is required.' : undefined}>
          {(a) => (
            <>
              <textarea {...a} rows={3} className="input !h-auto py-2" value={seo.description} disabled={readOnly} onChange={(e) => setSeo({ description: e.target.value, descriptionEdited: true })} />
              <div className="mt-1 flex justify-between"><span className="text-xs text-muted">{seo.descriptionEdited ? 'Manually edited' : 'Auto-generated'}</span><CharCount value={seo.description} max={160} /></div>
            </>
          )}
        </FormField>
        <FormField label="Article slug" required error={slugErr}>
          {(a) => (
            <>
              <div className="flex items-center gap-1">
                <span className="hidden whitespace-nowrap text-sm text-muted sm:inline">/articles/</span>
                <input {...a} className="input" value={seo.slug} disabled={readOnly} onChange={(e) => setSeo({ slug: slugify(e.target.value, 80), slugEdited: true })} />
              </div>
              <p className="mt-1 text-xs text-muted">{seo.slugEdited ? 'Manually edited' : 'Auto-generated from the title'}</p>
            </>
          )}
        </FormField>
        <FormField label="DOI" hint="Assigned from the Paper ID and cannot be edited.">
          {(a) => <input {...a} className="input bg-subtle font-mono text-sm" readOnly value={doiFor(paperId)} />}
        </FormField>
      </div>
      <aside aria-label="Search result preview" className="h-fit rounded-lg border border-line bg-surface p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Search result preview</p>
        <p className="truncate text-xs text-slate-600">{articleUrl(journal, seo.slug || '…')}</p>
        <p className="mt-0.5 text-[17px] leading-snug text-blue-800">{seo.title || 'SEO title'}</p>
        <p className="mt-1 text-sm leading-5 text-slate-700">{seo.description || 'The SEO description appears here.'}</p>
      </aside>
    </div>
  )
}
