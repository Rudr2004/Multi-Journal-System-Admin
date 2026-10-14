import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, FileImage, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { SectionCard } from '@/components/Card'
import { Badge, JournalBadge } from '@/components/Badges'
import { CharCount, FormField } from '@/components/Form'
import { ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { usePermission } from '@/permissions/hooks'
import { BLOCK_LABEL, PAGE_GROUPS, newBlock, type BlockType, type StaticPage } from '@/mock/data/pageMgmt'
import { getStaticPage, saveStaticPage } from '@/mock/api/pageMgmt'
import { SortableList } from '../SortableList'
import { TagInput } from '../TagInput'
import { BlocksPreview } from './BlocksPreview'

const BLOCK_TYPES = ['heading', 'paragraph', 'list', 'callout', 'link'] as const
const urlOk = (v: string) => v === '' || /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v)

const schema = z
  .object({
    title: z.string().trim().min(3, 'Enter a title of at least 3 characters.').max(120, 'Keep the title under 120 characters.'),
    group: z.enum(PAGE_GROUPS),
    status: z.enum(['draft', 'published']),
    blocks: z.array(z.object({
      type: z.enum(BLOCK_TYPES), text: z.string(), level: z.enum(['2', '3']), ordered: z.boolean(), tone: z.enum(['info', 'warning']), url: z.string(),
    }).superRefine((b, ctx) => {
      if (b.type === 'link' && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(b.url.trim())) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Enter a full link starting with https://' })
      if (b.type === 'link' && !b.text.trim()) ctx.addIssue({ code: 'custom', path: ['text'], message: 'Enter the link text.' })
    })),
    seo: z.object({
      title: z.string().max(60, 'SEO title must be 60 characters or fewer.'),
      description: z.string().max(160, 'Meta description must be 160 characters or fewer.'),
      keywords: z.array(z.string()).max(12, 'Use at most 12 keywords.'),
      canonical: z.string().trim().refine(urlOk, 'Enter a full URL starting with https://'),
      ogImage: z.string(),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'published' && v.blocks.every((b) => !b.text.trim())) ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'Add some content before publishing.' })
  })
type Values = z.infer<typeof schema>

const toValues = (p: StaticPage): Values => ({ title: p.title, group: p.group, status: p.status, blocks: p.blocks, seo: p.seo })

export default function StaticPageEditor() {
  const { id = '' } = useParams()
  const { data, loading, error, reload } = useAsync(() => getStaticPage(id), [id])
  return (
    <>
      <PageHeader title={data?.title ?? 'Page'} crumbs={[{ label: 'Static pages', to: '/pages' }, { label: data?.title ?? 'Page' }]} description="Build the page from blocks, set its search-engine details and preview it before publishing." />
      {error ? <div className="card"><ErrorState message="This page could not be loaded." onRetry={reload} /></div>
        : loading || !data ? <div className="space-y-4" aria-busy="true"><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></div>
        : <Editor key={data.id} page={data} />}
    </>
  )
}

function Editor({ page }: { page: StaticPage }) {
  const { can, why } = usePermission('cms')
  const canEdit = can('work')
  const canPublish = can('approve')
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [saved, setSaved] = useState(page)
  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors, isDirty, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(page) })
  const { fields, append, remove, move } = useFieldArray({ control, name: 'blocks' })
  useUnsavedChanges(isDirty)
  const v = watch()

  const submit = handleSubmit(async (values) => {
    if (values.status !== saved.status && !canPublish) { toast.error(why('approve') ?? 'You cannot publish pages.'); return }
    try {
      const next = await saveStaticPage(page.id, values)
      setSaved(next)
      reset(toValues(next))
      toast.success(values.status === 'published' ? 'Page saved. Changes go live on the website within minutes.' : 'Draft saved. It stays off the website.')
    } catch (e) { toast.error((e as Error).message) }
  })

  const addBlock = (t: BlockType) => append(newBlock(t))
  const ogName = v.seo?.ogImage ?? ''

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <JournalBadge code={page.journal} /> <span>/{page.slug}</span>
          <Badge tone={saved.status === 'published' ? 'success' : 'neutral'}>{saved.status === 'published' ? 'Published' : 'Draft'}</Badge>
          <span>Last updated <RelativeTime value={saved.updatedAt} /> by {saved.updatedBy}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Editor view" className="inline-flex rounded-lg bg-subtle p-1">
            {([['edit', 'Edit', Pencil], ['preview', 'Preview', Eye]] as const).map(([k, label, Icon]) => (
              <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium ${view === k ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}><Icon size={14} strokeWidth={1.5} aria-hidden /> {label}</button>
            ))}
          </div>
          <Link to="/pages" className="btn-secondary">Back to pages</Link>
          <GuardedButton type="submit" allowed={canEdit} why={why('work')} className="btn-primary" disabled={isSubmitting || !isDirty}><Save size={15} strokeWidth={1.5} aria-hidden /> {isSubmitting ? 'Saving…' : 'Save'}</GuardedButton>
        </div>
      </div>

      {view === 'preview' ? (
        <div className="card p-6"><BlocksPreview title={v.title} blocks={v.blocks ?? []} /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <SectionCard title="Page details">
              <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
                <FormField label="Title" required error={errors.title?.message} className="sm:col-span-2">{(a) => <input {...a} className="input" {...register('title')} />}</FormField>
                <FormField label="Group" hint="Where it appears in the website menu.">{(a) => <select {...a} className="input" {...register('group')}>{PAGE_GROUPS.map((g) => <option key={g}>{g}</option>)}</select>}</FormField>
                <FormField label="Status" error={errors.status?.message} hint={canPublish ? undefined : 'Publishing needs Approve access.'}>
                  {(a) => <select {...a} className="input" {...register('status')} disabled={!canPublish}><option value="draft">Draft</option><option value="published">Published</option></select>}
                </FormField>
              </fieldset>
            </SectionCard>

            <SectionCard title={`Content blocks (${fields.length})`}>
              <fieldset disabled={!canEdit}>
                {fields.length === 0 && <p className="rounded-md border border-dashed border-line p-4 text-center text-sm text-muted">No blocks yet. Add a heading or paragraph to start.</p>}
                <SortableList items={fields} getId={(f) => f.id} getLabel={(f) => `${BLOCK_LABEL[f.type]} block`} disabled={!canEdit} onMove={move}
                  renderItem={(f, i, handle) => {
                    const t = v.blocks?.[i]?.type ?? f.type
                    const be = errors.blocks?.[i]
                    return (
                      <div className="rounded-lg border border-line bg-surface p-3">
                        <div className="mb-2 flex items-center gap-2">
                          {handle}
                          <select aria-label={`Block ${i + 1} type`} className="input !h-8 !w-auto" {...register(`blocks.${i}.type`)}>{BLOCK_TYPES.map((x) => <option key={x} value={x}>{BLOCK_LABEL[x]}</option>)}</select>
                          {t === 'heading' && <select aria-label={`Block ${i + 1} heading level`} className="input !h-8 !w-auto" {...register(`blocks.${i}.level`)}><option value="2">Large</option><option value="3">Small</option></select>}
                          {t === 'callout' && <select aria-label={`Block ${i + 1} tone`} className="input !h-8 !w-auto" {...register(`blocks.${i}.tone`)}><option value="info">Information</option><option value="warning">Warning</option></select>}
                          {t === 'list' && <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" className="accent-indigo-600" {...register(`blocks.${i}.ordered`)} /> Numbered</label>}
                          <span className="ml-auto text-xs text-faint">Block {i + 1}</span>
                          <button type="button" className="btn-ghost h-8 px-2 hover:!text-red-600" aria-label={`Delete block ${i + 1}`} onClick={() => remove(i)}><Trash2 size={15} strokeWidth={1.5} /></button>
                        </div>
                        {t === 'heading' && <input aria-label={`Block ${i + 1} heading text`} className="input" placeholder="Heading text" {...register(`blocks.${i}.text`)} />}
                        {(t === 'paragraph' || t === 'callout') && <textarea aria-label={`Block ${i + 1} text`} rows={3} className="input !h-auto py-2" placeholder={t === 'callout' ? 'Callout message' : 'Write the paragraph'} {...register(`blocks.${i}.text`)} />}
                        {t === 'list' && <textarea aria-label={`Block ${i + 1} list items`} rows={4} className="input !h-auto py-2" placeholder="One item per line" {...register(`blocks.${i}.text`)} />}
                        {t === 'link' && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div><input aria-label={`Block ${i + 1} link text`} aria-invalid={!!be?.text} className="input" placeholder="Link text" {...register(`blocks.${i}.text`)} />{be?.text && <p role="alert" className="mt-0.5 text-xs text-red-600">{be.text.message}</p>}</div>
                            <div><input aria-label={`Block ${i + 1} link address`} aria-invalid={!!be?.url} className="input" type="url" placeholder="https://" {...register(`blocks.${i}.url`)} />{be?.url && <p role="alert" className="mt-0.5 text-xs text-red-600">{be.url.message}</p>}</div>
                          </div>
                        )}
                      </div>
                    )
                  }} />
                {errors.blocks?.message && <p role="alert" className="mt-2 text-xs text-red-600">{errors.blocks.message}</p>}
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Add a block">
                  {BLOCK_TYPES.map((t) => <button key={t} type="button" className="btn-secondary h-8" onClick={() => addBlock(t)}><Plus size={13} strokeWidth={1.5} aria-hidden /> {BLOCK_LABEL[t]}</button>)}
                </div>
                <p className="mt-2 text-xs text-muted">Drag the handle to reorder. With the keyboard: focus the handle, press Space, use the arrow keys, then Space again.</p>
              </fieldset>
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard title="SEO metadata">
              <fieldset disabled={!canEdit} className="space-y-4">
                <FormField label="SEO title" error={errors.seo?.title?.message}>{(a) => <div><input {...a} className="input" {...register('seo.title')} /><div className="mt-1 text-right"><CharCount value={v.seo?.title ?? ''} max={60} /></div></div>}</FormField>
                <FormField label="Meta description" error={errors.seo?.description?.message}>{(a) => <div><textarea {...a} rows={3} className="input !h-auto py-2" {...register('seo.description')} /><div className="mt-1 text-right"><CharCount value={v.seo?.description ?? ''} max={160} /></div></div>}</FormField>
                <FormField label="Keywords" error={errors.seo?.keywords?.message} hint="Press Enter or comma after each keyword.">
                  {(a) => <Controller control={control} name="seo.keywords" render={({ field }) => <TagInput id={a.id} value={field.value} onChange={field.onChange} placeholder="Add a keyword" disabled={!canEdit} max={12} />} />}
                </FormField>
                <FormField label="Canonical URL" error={errors.seo?.canonical?.message}>{(a) => <input {...a} type="url" inputMode="url" className="input" placeholder="https://" {...register('seo.canonical')} />}</FormField>
                <div>
                  <p className="label">Social share image (Open Graph)</p>
                  <div className="flex items-center gap-3 rounded-md border border-dashed border-line p-3">
                    <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-subtle text-faint" aria-hidden><FileImage size={20} strokeWidth={1.5} /></span>
                    <div className="min-w-0 text-xs text-muted">
                      <p className="truncate">{ogName || 'No image chosen. 1200 x 630 px recommended.'}</p>
                      <label className="mt-1 inline-flex cursor-pointer items-center text-accent hover:underline">
                        {ogName ? 'Replace image' : 'Choose image (placeholder)'}
                        <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setValue('seo.ogImage', f.name, { shouldDirty: true }) }} />
                      </label>
                      {ogName && <button type="button" className="ml-3 text-red-600 hover:underline" onClick={() => setValue('seo.ogImage', '', { shouldDirty: true })}>Remove</button>}
                    </div>
                  </div>
                </div>
              </fieldset>
            </SectionCard>
            <SectionCard title="Search result preview">
              <div className="rounded-md bg-subtle p-3">
                <p className="truncate text-xs text-muted">{v.seo?.canonical || `https://${page.journal.toLowerCase()}.example.org/${page.slug}`}</p>
                <p className="line-clamp-1 text-base font-medium text-blue-700">{v.seo?.title || v.title}</p>
                <p className="line-clamp-2 text-sm text-muted">{v.seo?.description || 'Add a meta description so search engines show a useful summary.'}</p>
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </form>
  )
}
