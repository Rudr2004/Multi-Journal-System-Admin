import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bold, Eye, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, RotateCcw, Save } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PageHeader } from '@/layout/PageHeader'
import { SectionCard } from '@/components/Card'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { AutosaveIndicator } from '@/components/Autosave'
import { CharCount, FormField } from '@/components/Form'
import { ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { JournalBadge } from '@/components/Badges'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import { usePermission } from '@/permissions/hooks'
import { formatDate } from '@/shared/formatters'
import { journalByCode } from '@/mock/data/core'
import { COVER_TONES, POST_CATEGORIES, type CmsEntry, type EntryDraft } from '@/mock/data/website'
import { ApiError } from '@/mock/api/latency'
import { autosaveEntry, discardAutosave, getEntry, saveEntry, slugify } from '@/mock/api/cms'
import { Markdown } from '../Markdown'
import { COVER_CLASS } from '../shared'
import { EntryStatusBadge } from './CmsPage'

const schema = z
  .object({
    title: z.string().trim().min(3, 'Enter a title of at least 3 characters.').max(120, 'Keep the title under 120 characters.'),
    slug: z.string().min(1, 'Enter a URL address.').max(80, 'Keep the address under 80 characters.').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens only.'),
    content: z.string(),
    status: z.enum(['draft', 'published']),
    seoTitle: z.string().max(60, 'SEO title must be 60 characters or fewer.'),
    metaDescription: z.string().max(160, 'Meta description must be 160 characters or fewer.'),
    author: z.string(),
    category: z.string(),
    publishDate: z.string(),
    cover: z.enum(COVER_TONES),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'published' && v.content.trim().length < 40) ctx.addIssue({ code: 'custom', path: ['content'], message: 'Add at least a few sentences of content before publishing.' })
  })

const toDraft = (e: CmsEntry): EntryDraft => ({
  title: e.title, slug: e.slug, content: e.content, status: e.status, seoTitle: e.seoTitle, metaDescription: e.metaDescription,
  author: e.author, category: e.category, publishDate: e.publishDate, cover: e.cover,
})

type Wrap = { before: string; after?: string; placeholder: string }

function Toolbar({ onWrap, onLines, disabled }: { onWrap: (w: Wrap) => void; onLines: (prefix: string | ((i: number) => string)) => void; disabled: boolean }) {
  const btn = 'btn-ghost h-8 w-8 px-0'
  const items = [
    { label: 'Bold', icon: Bold, run: () => onWrap({ before: '**', after: '**', placeholder: 'bold text' }) },
    { label: 'Italic', icon: Italic, run: () => onWrap({ before: '*', after: '*', placeholder: 'italic text' }) },
    { label: 'Heading', icon: Heading2, run: () => onLines('## ') },
    { label: 'Sub-heading', icon: Heading3, run: () => onLines('### ') },
    { label: 'Bulleted list', icon: List, run: () => onLines('- ') },
    { label: 'Numbered list', icon: ListOrdered, run: () => onLines((i) => `${i + 1}. `) },
    { label: 'Quote', icon: Quote, run: () => onLines('> ') },
    { label: 'Link', icon: Link2, run: () => onWrap({ before: '[', after: '](https://)', placeholder: 'link text' }) },
  ]
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
      {items.map((i) => (
        <button key={i.label} type="button" className={btn} aria-label={i.label} title={i.label} disabled={disabled} onClick={i.run}><i.icon size={16} strokeWidth={1.5} aria-hidden /></button>
      ))}
    </div>
  )
}

function SitePreview({ values, entry, onClose }: { values: EntryDraft; entry: CmsEntry; onClose: () => void }) {
  const j = journalByCode(entry.journal)
  return (
    <Dialog open onClose={onClose} title="Preview" description="How this appears on the public website." width={880}>
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="flex items-center gap-2 border-b border-line bg-subtle px-3 py-2 text-xs text-muted">
          <span className="flex gap-1" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-slate-300" /><i className="h-2.5 w-2.5 rounded-full bg-slate-300" /><i className="h-2.5 w-2.5 rounded-full bg-slate-300" /></span>
          <span className="truncate rounded bg-surface px-2 py-0.5">https://{j.domain}/{entry.kind === 'post' ? 'blog/' : ''}{values.slug}</span>
        </div>
        {values.status === 'draft' && <p className="bg-amber-50 px-4 py-2 text-xs text-amber-800">Draft preview — this {entry.kind} is not visible to the public yet.</p>}
        <div className="max-h-[60vh] overflow-y-auto bg-white">
          <div className="border-b border-line bg-slate-900 px-6 py-3 text-white">
            <p className="text-sm font-semibold">{j.name}</p>
            <p className="text-xs text-slate-300">ISSN {j.issn}</p>
          </div>
          {entry.kind === 'post' && <div className={cn('h-40 bg-gradient-to-br', COVER_CLASS[values.cover])} aria-hidden />}
          <article className="mx-auto max-w-2xl px-6 py-8">
            {entry.kind === 'post' && <p className="text-xs font-medium uppercase tracking-wide text-accent">{values.category}</p>}
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{values.title || 'Untitled'}</h1>
            {entry.kind === 'post' && <p className="mt-1 text-sm text-muted">{values.author}{values.publishDate && ` · ${formatDate(values.publishDate)}`}</p>}
            {values.content.trim() ? <Markdown source={values.content} /> : <p className="mt-6 text-sm text-muted">No content yet.</p>}
          </article>
        </div>
      </div>
    </Dialog>
  )
}

function EditorForm({ entry, reload }: { entry: CmsEntry; reload: () => void }) {
  const { can, why } = usePermission('cms')
  const canEdit = can('work')
  const canPublish = can('approve')
  const saved = useMemo(() => toDraft(entry), [entry])
  const recovered = entry.autosave?.values
  const { register, handleSubmit, watch, setValue, reset, setError, getValues, formState: { errors, isDirty, isSubmitting } } = useForm<EntryDraft>({
    resolver: zodResolver(schema), defaultValues: saved, mode: 'onBlur',
  })
  const values = watch()
  const snapshot = JSON.stringify(values)
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [previewing, setPreviewing] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState<EntryDraft | null>(null)
  const [banner, setBanner] = useState(!!recovered)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Restore autosaved edits once, marking the form as modified
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || !recovered) return
    restored.current = true
    ;(Object.keys(recovered) as (keyof EntryDraft)[]).forEach((k) => setValue(k, recovered[k] as never, { shouldDirty: recovered[k] !== saved[k] }))
  }, [recovered, saved, setValue])

  // Debounced background autosave of the working copy
  useEffect(() => {
    if (!isDirty || !canEdit) return
    const t = setTimeout(() => { void autosaveEntry(entry.id, getValues()) }, 700)
    return () => clearTimeout(t)
  }, [snapshot, isDirty, canEdit, entry.id, getValues])

  useUnsavedChanges(isDirty)

  const persist = async (v: EntryDraft) => {
    try {
      const next = await saveEntry(entry.id, v)
      reset(toDraft(next))
      setBanner(false)
      toast.success(v.status === 'published' && entry.status !== 'published' ? `Published “${v.title}”.` : 'Changes saved.')
      reload()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'slug_taken') setError('slug', { message: e.message })
      else toast.error((e as Error).message)
    }
  }
  const onSubmit = handleSubmit((v) => {
    if (v.status === 'published' && entry.status !== 'published') setConfirmPublish(v)
    else return persist(v)
  })

  const discard = async () => {
    await discardAutosave(entry.id)
    reset(saved)
    setBanner(false)
    reload()
    toast.info('Autosaved changes discarded.')
  }

  const setContent = (text: string, selStart?: number, selEnd?: number) => {
    setValue('content', text, { shouldDirty: true, shouldValidate: false })
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (ta && selStart !== undefined) { ta.focus(); ta.setSelectionRange(selStart, selEnd ?? selStart) }
    })
  }
  const wrap = ({ before, after = '', placeholder }: Wrap) => {
    const ta = taRef.current
    const text = values.content
    const s = ta?.selectionStart ?? text.length
    const e = ta?.selectionEnd ?? text.length
    const sel = text.slice(s, e) || placeholder
    setContent(text.slice(0, s) + before + sel + after + text.slice(e), s + before.length, s + before.length + sel.length)
  }
  const lines = (prefix: string | ((i: number) => string)) => {
    const ta = taRef.current
    const text = values.content
    const s = ta?.selectionStart ?? 0
    const e = ta?.selectionEnd ?? 0
    const start = text.lastIndexOf('\n', s - 1) + 1
    const endIdx = text.indexOf('\n', e)
    const end = endIdx === -1 ? text.length : endIdx
    const block = text.slice(start, end).split('\n').map((l, i) => (typeof prefix === 'function' ? prefix(i) : prefix) + l).join('\n')
    setContent(text.slice(0, start) + block + text.slice(end), start, start + block.length)
  }

  const j = journalByCode(entry.journal)
  const seoTitle = values.seoTitle || values.title
  const isPost = entry.kind === 'post'

  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader
        title={entry.title}
        crumbs={[{ label: isPost ? 'Blog post' : 'Page' }]}
        description={`${j.code} · ${isPost ? 'Blog post' : 'Page'} · last edited ${entry.updatedBy}`}
        actions={<>
          <AutosaveIndicator watch={snapshot} />
          <button type="button" className="btn-secondary" onClick={() => setPreviewing(true)}><Eye size={15} strokeWidth={1.5} aria-hidden /> Preview</button>
          <GuardedButton allowed={canEdit} why={why('work')} type="submit" className="btn-primary" disabled={isSubmitting || !isDirty}><Save size={15} strokeWidth={1.5} aria-hidden /> {isSubmitting ? 'Saving…' : 'Save changes'}</GuardedButton>
        </>}
      />
      {banner && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>We recovered unsaved edits from {entry.autosave && <RelativeTime value={entry.autosave.at} />}. Review them and save, or discard to go back to the saved version.</span>
          <button type="button" className="btn-secondary" onClick={discard}><RotateCcw size={14} strokeWidth={1.5} aria-hidden /> Discard recovered edits</button>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <SectionCard title="Content">
            <div className="space-y-4">
              <FormField label="Title" required error={errors.title?.message}>
                {(a) => <input {...a} {...register('title')} className="input" disabled={!canEdit} />}
              </FormField>
              <FormField label="URL address" required error={errors.slug?.message} hint={`https://${j.domain}/${isPost ? 'blog/' : ''}${values.slug || '…'}`}>
                {(a) => (
                  <div className="flex gap-2">
                    <input {...a} {...register('slug')} className="input font-mono text-sm" disabled={!canEdit} />
                    <button type="button" className="btn-secondary shrink-0" disabled={!canEdit} onClick={() => setValue('slug', slugify(values.title), { shouldDirty: true, shouldValidate: true })}>From title</button>
                  </div>
                )}
              </FormField>
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="entry-content" className="label !mb-0">Body (Markdown)</label>
                  <div role="tablist" aria-label="Editor mode" className="inline-flex rounded-md bg-subtle p-0.5 text-sm">
                    {(['write', 'preview'] as const).map((m) => (
                      <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                        className={cn('rounded px-3 py-1 font-medium capitalize', mode === m ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink')}>{m}</button>
                    ))}
                  </div>
                </div>
                <div className={cn('rounded-md border', errors.content ? 'border-red-400' : 'border-line')}>
                  <div className="border-b border-line bg-page px-2 py-1"><Toolbar onWrap={wrap} onLines={lines} disabled={!canEdit || mode === 'preview'} /></div>
                  {mode === 'write' ? (
                    <textarea id="entry-content" ref={taRef} value={values.content} disabled={!canEdit} rows={18} aria-invalid={!!errors.content}
                      onChange={(e) => setValue('content', e.target.value, { shouldDirty: true })}
                      className="block w-full resize-y rounded-b-md bg-surface px-3 py-2 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      placeholder={'## Heading\n\nWrite in Markdown. Use the toolbar for bold, lists and links.'} />
                  ) : (
                    <div className="min-h-[360px] rounded-b-md bg-surface px-4 py-2">{values.content.trim() ? <Markdown source={values.content} /> : <p className="py-8 text-center text-sm text-muted">Nothing to preview yet.</p>}</div>
                  )}
                </div>
                {errors.content && <p role="alert" className="mt-1 text-xs text-red-600">{errors.content.message}</p>}
                <p className="mt-1 text-xs text-muted">{values.content.trim() ? values.content.trim().split(/\s+/).length : 0} words</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Search engine listing">
            <div className="space-y-4">
              <FormField label="SEO title" error={errors.seoTitle?.message} hint="Shown as the blue headline in search results. Falls back to the page title.">
                {(a) => (
                  <div>
                    <input {...a} {...register('seoTitle')} className="input" disabled={!canEdit} />
                    <div className="mt-1 text-right"><CharCount value={values.seoTitle} max={60} /></div>
                  </div>
                )}
              </FormField>
              <FormField label="Meta description" error={errors.metaDescription?.message} hint="One or two sentences that summarise the page for search results.">
                {(a) => (
                  <div>
                    <textarea {...a} {...register('metaDescription')} rows={3} className="input !h-auto py-2" disabled={!canEdit} />
                    <div className="mt-1 text-right"><CharCount value={values.metaDescription} max={160} /></div>
                  </div>
                )}
              </FormField>
              <figure aria-label="Search result preview" className="rounded-lg border border-line bg-white p-4">
                <figcaption className="mb-2 text-xs font-medium text-muted">Search result preview</figcaption>
                <p className="truncate text-xs text-slate-600">https://{j.domain} › {isPost ? 'blog › ' : ''}{values.slug}</p>
                <p className="mt-0.5 truncate text-lg leading-6 text-[#1a0dab]">{seoTitle || 'Untitled'}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{values.metaDescription || 'No meta description. Search engines will pick text from the page.'}</p>
              </figure>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Publishing">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Journal</span><JournalBadge code={entry.journal} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Live version</span><EntryStatusBadge status={entry.status} />
              </div>
              <FormField label="Status" hint={canPublish ? 'Publishing makes it visible on the website.' : why('approve')}>
                {(a) => (
                  <select {...a} {...register('status')} className="input" disabled={!canPublish}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                )}
              </FormField>
              <p className="text-xs text-muted">Last saved <RelativeTime value={entry.updatedAt} /> by {entry.updatedBy}.</p>
              <Link to={isPost ? '/pages?tab=posts' : '/pages'} className="text-sm text-accent hover:underline">Back to {isPost ? 'blog posts' : 'pages'}</Link>
            </div>
          </SectionCard>

          {isPost && (
            <SectionCard title="Post details">
              <div className="space-y-4">
                <FormField label="Author" error={errors.author?.message}>{(a) => <input {...a} {...register('author')} className="input" disabled={!canEdit} />}</FormField>
                <FormField label="Category">
                  {(a) => <select {...a} {...register('category')} className="input" disabled={!canEdit}>{POST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}
                </FormField>
                <FormField label="Publish date" hint="Future dates keep the post hidden until then.">
                  {(a) => <input {...a} type="date" {...register('publishDate')} className="input" disabled={!canEdit} />}
                </FormField>
                <fieldset>
                  <legend className="label">Cover image</legend>
                  <div className={cn('mb-2 flex h-24 items-end rounded-lg bg-gradient-to-br p-3', COVER_CLASS[values.cover])}>
                    <span className="rounded bg-black/25 px-2 py-0.5 text-xs text-white">Cover placeholder</span>
                  </div>
                  <div className="flex gap-2" role="radiogroup" aria-label="Cover colour">
                    {COVER_TONES.map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={values.cover === t} aria-label={t} disabled={!canEdit}
                        onClick={() => setValue('cover', t, { shouldDirty: true })}
                        className={cn('h-7 w-7 rounded-full bg-gradient-to-br ring-offset-2', COVER_CLASS[t], values.cover === t && 'ring-2 ring-accent')} />
                    ))}
                  </div>
                </fieldset>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
      {previewing && <SitePreview values={values} entry={entry} onClose={() => setPreviewing(false)} />}
      <ConfirmDialog open={!!confirmPublish} onClose={() => setConfirmPublish(null)} title={`Publish “${confirmPublish?.title ?? ''}”?`} confirmLabel="Save and publish"
        consequences={[`Make /${confirmPublish?.slug ?? ''} visible on ${j.domain} immediately`, 'Allow search engines to index it', 'Record the change in the audit log']}
        onConfirm={() => confirmPublish && persist(confirmPublish)} />
    </form>
  )
}

export default function EntryEditorPage() {
  const { id = '' } = useParams()
  const { data, loading, error, reload } = useAsync(() => getEntry(id), [id])
  if (loading && !data) {
    return (
      <div aria-busy="true" aria-label="Loading editor" className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]"><Skeleton className="h-[480px]" /><Skeleton className="h-60" /></div>
      </div>
    )
  }
  if (error || !data) return <div className="card"><ErrorState message={error?.message ?? 'We could not load this page.'} onRetry={reload} /></div>
  return <EditorForm key={data.id} entry={data} reload={reload} />
}
