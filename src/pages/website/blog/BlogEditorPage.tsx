import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bold, CalendarClock, Check, ClipboardPaste, Code2, Eraser, FileCode2, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Quote, RotateCcw, Save, Send, Trash2, X } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PageHeader } from '@/layout/PageHeader'
import { SectionCard } from '@/components/Card'
import { AutosaveIndicator } from '@/components/Autosave'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { CharCount, FormField } from '@/components/Form'
import { ReasonDialog } from '@/components/ReasonDialog'
import { ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { JournalBadge } from '@/components/Badges'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import { formatDateTime } from '@/shared/formatters'
import { journalByCode } from '@/mock/data/core'
import { COVER_TONES, type BlogDraft, type BlogPost } from '@/mock/data/blog'
import { approvePost, autosavePost, discardAutosave, getPost, publishPost, rejectPost, savePost, schedulePost, slugify, submitForApproval } from '@/mock/api/blog'
import { Markdown } from '../Markdown'
import { COVER_CLASS, fromLocalInput, toLocalInput } from '../shared'
import { BlogStatusBadge, EDITABLE_BY_APPROVER, EDITABLE_BY_AUTHOR } from './parts'

const STARTER_PAGE = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Page title</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 16px;color:#0f172a;line-height:1.7}h1{font-size:28px}a{color:#4f46e5}</style></head>
<body>
<h1>Page heading</h1>
<p>Write or paste the content built in your external HTML tool.</p>
</body>
</html>`

/** Scripts, inline handlers and javascript: links never reach the preview or the website. */
const safeHtml = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/javascript:/gi, '')

const schema = z.object({
  title: z.string().trim().min(3, 'Enter a title of at least 3 characters.').max(120, 'Keep the title under 120 characters.'),
  slug: z.string().min(1, 'Enter a URL address.').max(80, 'Keep the address under 80 characters.').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens only.'),
  content: z.string().max(40000, 'Keep the post under 40,000 characters.'),
  excerpt: z.string().max(200, 'Keep the summary under 200 characters.'),
  seoTitle: z.string().max(60, 'SEO title must be 60 characters or fewer.'),
  metaDescription: z.string().max(160, 'Meta description must be 160 characters or fewer.'),
  keywords: z.string().max(200, 'Keep keywords under 200 characters.').refine((v) => v.split(',').filter((k) => k.trim()).length <= 10, 'Use at most 10 keywords.'),
  cover: z.enum(COVER_TONES),
  coverImage: z.string().max(3_000_000).optional(),
  format: z.enum(['markdown', 'html']).optional(),
})

const toDraft = (p: BlogPost): BlogDraft => ({
  title: p.title, slug: p.slug, content: p.content, excerpt: p.excerpt, seoTitle: p.seoTitle, metaDescription: p.metaDescription, keywords: p.keywords, cover: p.cover, coverImage: p.coverImage, format: p.format ?? 'markdown',
})

export default function BlogEditorPage() {
  const { id = '' } = useParams()
  const q = useAsync(() => getPost(id), [id])
  const crumbs = [{ label: 'Post' }]
  if (q.error) {
    return (
      <>
        <PageHeader title="Blog post" crumbs={crumbs} />
        <div className="card">
          <ErrorState message={q.error.message} onRetry={q.error.message.includes('no longer exists') ? undefined : q.reload} />
          <div className="pb-6 text-center"><Link to="/blog" className="btn-secondary">Back to Blog &amp; Resources</Link></div>
        </div>
      </>
    )
  }
  if (!q.data) {
    return (
      <>
        <PageHeader title="Blog post" crumbs={crumbs} />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]" aria-busy="true" aria-label="Loading post"><Skeleton className="h-96" /><Skeleton className="h-72" /></div>
      </>
    )
  }
  return <Editor key={id} post={q.data} />
}

const TOOLS = [
  { id: 'bold', label: 'Bold', icon: Bold },
  { id: 'italic', label: 'Italic', icon: Italic },
  { id: 'heading', label: 'Heading', icon: Heading2 },
  { id: 'bullets', label: 'Bulleted list', icon: List },
  { id: 'numbers', label: 'Numbered list', icon: ListOrdered },
  { id: 'quote', label: 'Quote', icon: Quote },
  { id: 'link', label: 'Link', icon: Link2 },
]

function Editor({ post }: { post: BlogPost }) {
  const user = useCurrentUser()
  const { level, can, why } = usePermission('blog')
  const j = journalByCode(post.journal)
  const isAuthor = !!user && post.authorId === user.id
  const canEdit = can('approve') ? EDITABLE_BY_APPROVER.includes(post.status) : can('work') && isAuthor && EDITABLE_BY_AUTHOR.includes(post.status)
  const canSubmit = canEdit && (post.status === 'draft' || post.status === 'rejected') && (isAuthor || can('approve'))
  const canRelease = can('approve') && (post.status === 'approved' || post.status === 'scheduled')

  const restorable = post.autosave && post.autosave.at > post.updatedAt ? post.autosave : undefined
  const saved = useMemo(() => toDraft(post), [post])
  const { control, register, handleSubmit, reset, setValue, getValues, formState: { errors, isDirty, isSubmitting } } = useForm<BlogDraft>({
    resolver: zodResolver(schema), defaultValues: saved, mode: 'onTouched',
  })
  const values = useWatch({ control })
  const snapshot = JSON.stringify(values)
  const [current, setCurrent] = useState(post)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const isHtml = values.format === 'html'
  const coverImage = values.coverImage
  const readCover = (f: File) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { toast.error('Choose a PNG, JPG or WebP image.'); return }
    if (f.size > 2 * 1024 * 1024) { toast.error('The cover image must be under 2 MB.'); return }
    const r = new FileReader()
    r.onload = () => setValue('coverImage', String(r.result), { shouldDirty: true })
    r.readAsDataURL(f)
  }
  const pasteHtml = async () => {
    try { setValue('content', await navigator.clipboard.readText(), { shouldDirty: true }) } catch { toast.info('Paste is blocked here. Click in the box and press Ctrl+V.') }
  }
  const [rejecting, setRejecting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [when, setWhen] = useState(() => toLocalInput(post.scheduledAt ?? new Date(Date.now() + 86_400_000).toISOString()))
  const [slugTouched, setSlugTouched] = useState(post.slug !== slugify(post.title) ? true : false)
  const [banner, setBanner] = useState(!!restorable)
  const area = useRef<HTMLTextAreaElement | null>(null)

  useUnsavedChanges(isDirty && canEdit, 'You have unsaved changes to this post. Leave without saving?')

  // Background autosave of the working copy (never touches the saved version).
  useEffect(() => {
    if (!isDirty || !canEdit) return
    const t = setTimeout(() => { void autosavePost(post.id, JSON.parse(snapshot) as BlogDraft) }, 1200)
    return () => clearTimeout(t)
  }, [snapshot, isDirty, canEdit, post.id])

  const persist = async (v: BlogDraft) => {
    const next = await savePost(post.id, v)
    setCurrent(next)
    reset(toDraft(next))
    return next
  }

  const refresh = async () => { const p = await getPost(post.id); setCurrent(p); reset(toDraft(p)) }
  const act = (fn: () => Promise<void>, ok: string) => async () => {
    setBusy(true)
    try {
      if (canEdit && isDirty) {
        const v = await new Promise<BlogDraft | undefined>((resolve) => { void handleSubmit((x) => resolve(x), () => resolve(undefined))() })
        if (!v) { toast.error('Fix the highlighted fields first.'); return }
        await persist(v)
      }
      await fn()
      await refresh()
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const wrap = (before: string, after = before, placeholder = 'text') => {
    const el = area.current
    const text = getValues('content')
    const s = el?.selectionStart ?? text.length
    const e = el?.selectionEnd ?? text.length
    const sel = text.slice(s, e) || placeholder
    setValue('content', `${text.slice(0, s)}${before}${sel}${after}${text.slice(e)}`, { shouldDirty: true, shouldValidate: true })
    setTimeout(() => { el?.focus(); el?.setSelectionRange(s + before.length, s + before.length + sel.length) }, 0)
  }
  const linePrefix = (prefix: string | ((i: number) => string)) => {
    const el = area.current
    const text = getValues('content')
    const s = el?.selectionStart ?? text.length
    const e = el?.selectionEnd ?? text.length
    const start = text.lastIndexOf('\n', s - 1) + 1
    const block = text.slice(start, e) || 'List item'
    const out = block.split('\n').map((l, i) => `${typeof prefix === 'string' ? prefix : prefix(i)}${l}`).join('\n')
    setValue('content', `${text.slice(0, start)}${out}${text.slice(e)}`, { shouldDirty: true, shouldValidate: true })
    setTimeout(() => el?.focus(), 0)
  }
  const runTool = (id: string) => {
    switch (id) {
      case 'bold': return wrap('**')
      case 'italic': return wrap('*')
      case 'heading': return linePrefix('## ')
      case 'bullets': return linePrefix('- ')
      case 'numbers': return linePrefix((i) => `${i + 1}. `)
      case 'quote': return linePrefix('> ')
      case 'link': return wrap('[', '](https://)', 'link text')
    }
  }

  const status = current.status
  const readOnlyReason = canEdit ? undefined : status === 'published' ? 'This post is published and can no longer be edited here.' : can('approve') ? undefined : !isAuthor ? 'You can only edit your own drafts.' : 'Only drafts and rejected posts can be edited. Ask the Editor if it needs changes.'

  return (
    <>
      <PageHeader title={current.title || 'Untitled post'} crumbs={[{ label: 'Post' }]} description={`${j.code} · last edited ${current.updatedBy}`}
        actions={<Link to="/blog" className="btn-secondary">Back to posts</Link>} />

      {banner && restorable && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>An autosaved version from <RelativeTime value={restorable.at} /> is newer than the saved post.</span>
          <span className="flex gap-2">
            <button className="btn-secondary !h-8" onClick={() => { reset(restorable.values, { keepDefaultValues: true }); setBanner(false) }}><RotateCcw size={14} aria-hidden /> Restore</button>
            <button className="btn-ghost !h-8" onClick={() => { void discardAutosave(post.id); setBanner(false) }}>Discard</button>
          </span>
        </div>
      )}
      {status === 'rejected' && current.rejectionReason && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">Rejected by the Editor</p>
          <p className="mt-1">{current.rejectionReason}</p>
        </div>
      )}
      {readOnlyReason && <p role="note" className="mb-4 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">{readOnlyReason}</p>}

      <form noValidate onSubmit={handleSubmit(async (v) => { setBusy(true); try { await persist(v); toast.success('Post saved.') } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) } })}
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset disabled={!canEdit} className="min-w-0 space-y-5">
          <SectionCard title="Content">
            <div className="space-y-4">
              <FormField label="Title" required error={errors.title?.message}>
                {(a) => <input {...a} {...register('title', { onChange: (e) => { if (!slugTouched) setValue('slug', slugify(e.target.value), { shouldDirty: true }) } })} className="input" />}
              </FormField>
              <FormField label="Summary" error={errors.excerpt?.message} hint="One or two sentences shown on the blog listing.">
                {(a) => <textarea {...a} {...register('excerpt')} rows={2} className="input !h-auto py-2" />}
              </FormField>
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="label !mb-0" id="content-label">Body</span>
                  <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg bg-subtle p-0.5" role="group" aria-label="Body format">
                    {([['markdown', 'Markdown', FileCode2], ['html', 'HTML page builder', Code2]] as const).map(([f, label, Icon]) => (
                      <button key={f} type="button" aria-pressed={isHtml === (f === 'html')} onClick={() => setValue('format', f, { shouldDirty: true })}
                        className={cn('inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium', isHtml === (f === 'html') ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}><Icon size={13} aria-hidden /> {label}</button>
                    ))}
                  </div>
                  <div className="inline-flex rounded-lg bg-subtle p-0.5" role="group" aria-label="Editor mode">
                    {(['write', 'preview'] as const).map((m) => (
                      <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                        className={cn('rounded-md px-3 py-1 text-xs font-medium capitalize', mode === m ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>{m}</button>
                    ))}
                  </div>
                  </div>
                </div>
                {isHtml ? (
                  mode === 'write' ? (
                    <div className="rounded-lg border border-line focus-within:ring-2 focus-within:ring-accent">
                      <div role="toolbar" aria-label="HTML page builder" className="flex flex-wrap items-center gap-2 border-b border-line bg-page px-2 py-1.5">
                        <button type="button" className="btn-secondary !h-8" onClick={pasteHtml}><ClipboardPaste size={14} aria-hidden /> Paste HTML</button>
                        <button type="button" className="btn-secondary !h-8" onClick={() => setValue('content', STARTER_PAGE, { shouldDirty: true })}><Code2 size={14} aria-hidden /> Starter page</button>
                        <button type="button" className="btn-ghost !h-8" onClick={() => setValue('content', '', { shouldDirty: true })}><Eraser size={14} aria-hidden /> Clear</button>
                        <span className="text-xs text-muted">Build the page in any external HTML tool, then paste the code here.</span>
                      </div>
                      <Controller control={control} name="content" render={({ field }) => (
                        <textarea aria-labelledby="content-label" aria-invalid={!!errors.content} rows={18} value={field.value} onChange={field.onChange} onBlur={field.onBlur} spellCheck={false}
                          placeholder="Paste or write the page HTML here. Use Preview to see the page."
                          className="block w-full resize-y rounded-b-lg bg-surface p-3 font-mono text-xs leading-5 outline-none disabled:opacity-70" />
                      )} />
                      {/<script[\s>]|\son\w+\s*=|javascript:/i.test(values.content ?? '') && <p role="alert" className="border-t border-line bg-amber-50 px-3 py-2 text-xs text-amber-900">Scripts, inline event handlers and javascript: links are removed when the page is shown on the website.</p>}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-line bg-white" aria-label="Page preview">
                      {values.content?.trim() ? <iframe title="HTML page preview" sandbox="" srcDoc={safeHtml(values.content)} className="h-[28rem] w-full border-0" /> : <p className="p-4 text-sm text-muted">Nothing to preview yet. Paste some HTML first.</p>}
                    </div>
                  )
                ) : mode === 'write' ? (
                  <div className="rounded-lg border border-line focus-within:ring-2 focus-within:ring-accent">
                    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-0.5 border-b border-line bg-page px-1.5 py-1">
                      {TOOLS.map((t) => (
                        <button key={t.label} type="button" title={t.label} aria-label={t.label} className="btn-ghost !h-8 !w-8 !px-0" onClick={() => runTool(t.id)}><t.icon size={15} strokeWidth={1.5} /></button>
                      ))}
                    </div>
                    <Controller control={control} name="content" render={({ field }) => (
                      <textarea aria-labelledby="content-label" aria-invalid={!!errors.content} rows={16} value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                        ref={(el) => { field.ref(el); area.current = el }}
                        placeholder="Write in Markdown: ## headings, **bold**, - lists. Use Preview to see the result."
                        className="block w-full resize-y rounded-b-lg bg-surface p-3 font-mono text-sm leading-6 outline-none disabled:opacity-70" />
                    )} />
                  </div>
                ) : (
                  <div className="min-h-[18rem] rounded-lg border border-line bg-surface p-4" aria-label="Post preview">
                    {values.content?.trim() ? <Markdown source={values.content} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
                  </div>
                )}
                {errors.content && <p role="alert" className="mt-1 text-xs text-red-600">{errors.content.message}</p>}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Search engine listing (SEO)">
            <div className="space-y-4">
              <FormField label="SEO title" error={errors.seoTitle?.message} hint="Shown as the headline in search results. Aim for 60 characters or fewer.">
                {(a) => <input {...a} {...register('seoTitle')} className="input" />}
              </FormField>
              <div className="-mt-3 text-right"><CharCount value={values.seoTitle ?? ''} max={60} /></div>
              <FormField label="Meta description" error={errors.metaDescription?.message} hint="The snippet under the headline. 160 characters or fewer.">
                {(a) => <textarea {...a} {...register('metaDescription')} rows={3} className="input !h-auto py-2" />}
              </FormField>
              <div className="-mt-3 text-right"><CharCount value={values.metaDescription ?? ''} max={160} /></div>
              <FormField label="URL address (slug)" required error={errors.slug?.message} hint={`https://${j.domain}/blog/${values.slug || '…'}`}>
                {(a) => <input {...a} {...register('slug', { onChange: () => setSlugTouched(true) })} className="input font-mono text-sm" />}
              </FormField>
              <FormField label="Keywords" error={errors.keywords?.message} hint="Separate with commas, up to 10.">
                {(a) => <input {...a} {...register('keywords')} className="input" placeholder="peer review, manuscript preparation" />}
              </FormField>
              <div className="rounded-lg border border-line bg-page p-3" aria-label="Search result preview">
                <p className="truncate text-xs text-green-700">https://{j.domain} › blog › {values.slug}</p>
                <p className="truncate text-base text-blue-700">{values.seoTitle || values.title || 'Untitled post'}</p>
                <p className="line-clamp-2 text-sm text-muted">{values.metaDescription || values.excerpt || 'Add a meta description to control this snippet.'}</p>
              </div>
            </div>
          </SectionCard>
        </fieldset>

        <aside className="space-y-5 lg:sticky lg:top-4" aria-label="Post workflow">
          <SectionCard title="Status">
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><BlogStatusBadge status={status} /><JournalBadge code={current.journal} /></div>
              <p className="text-muted">Author: {current.authorName}</p>
              {status === 'scheduled' && current.scheduledAt && <p className="text-muted">Goes live {formatDateTime(current.scheduledAt)}</p>}
              {status === 'published' && current.publishedAt && <p className="text-muted">Published {formatDateTime(current.publishedAt)}</p>}
              <ol className="space-y-1 text-xs text-muted" aria-label="Workflow">
                {['Draft', 'Pending approval', 'Approved', 'Scheduled or published'].map((s, i) => {
                  const at = status === 'rejected' ? 0 : ({ draft: 0, pending: 1, approved: 2, scheduled: 3, published: 3, rejected: 0 } as const)[status]
                  return <li key={s} className={cn('flex items-center gap-2', i <= at && 'font-medium text-ink')}><Check size={12} className={i <= at ? 'text-green-600' : 'opacity-0'} aria-hidden />{s}</li>
                })}
              </ol>
              {canEdit && <AutosaveIndicator watch={snapshot} />}
            </div>
          </SectionCard>

          <SectionCard title="Actions">
            <div className="flex flex-col gap-2">
              {canEdit && <button type="submit" className="btn-secondary" disabled={busy || isSubmitting || !isDirty}><Save size={15} aria-hidden /> Save changes</button>}
              {(status === 'draft' || status === 'rejected') && (
                <GuardedButton allowed={canSubmit} why={why('work') ?? 'You can only submit your own drafts.'} className="btn-primary" disabled={busy}
                  onClick={act(() => submitForApproval(post.id), 'Submitted for approval. The Editor has been notified.')}><Send size={15} aria-hidden /> Submit for approval</GuardedButton>
              )}
              {status === 'pending' && !can('approve') && <p className="text-sm text-muted">Waiting for the Editor to approve or reject this post.</p>}
              {status === 'pending' && can('approve') && (
                <>
                  <button type="button" className="btn-primary" disabled={busy} onClick={act(() => approvePost(post.id), 'Post approved. Publish it or schedule it.')}><Check size={15} aria-hidden /> Approve</button>
                  <button type="button" className="btn-danger" disabled={busy} onClick={() => setRejecting(true)}><X size={15} aria-hidden /> Reject…</button>
                </>
              )}
              {(status === 'approved' || status === 'scheduled') && (
                <>
                  <GuardedButton allowed={canRelease} why={why('approve')} className="btn-primary" disabled={busy} onClick={() => setPublishing(true)}>Publish now</GuardedButton>
                  <GuardedButton allowed={canRelease} why={why('approve')} className="btn-secondary" disabled={busy} onClick={() => setScheduling(true)}><CalendarClock size={15} aria-hidden /> {status === 'scheduled' ? 'Change schedule' : 'Schedule…'}</GuardedButton>
                </>
              )}
              {status === 'published' && <p className="text-sm text-muted">Live on the website. Ask a Super Admin if it must be taken down.</p>}
              {level === 'work' && status === 'approved' && <p className="text-sm text-muted">Approved. The Editor will publish or schedule it.</p>}
            </div>
          </SectionCard>

          <SectionCard title="Cover image">
            <fieldset disabled={!canEdit}>
              <Controller control={control} name="cover" render={({ field }) => (
                <div>
                  {coverImage
                    ? <img src={coverImage} alt="Cover preview" className="mb-3 h-28 w-full rounded-lg object-cover" />
                    : <div className={cn('mb-3 flex h-28 items-center justify-center rounded-lg bg-gradient-to-br text-white', COVER_CLASS[field.value])} aria-label="Cover placeholder"><ImagePlus size={28} strokeWidth={1.5} aria-hidden /></div>}
                  <div className="mb-3 flex flex-wrap gap-2">
                    <label className="btn-secondary !h-8 cursor-pointer"><ImagePlus size={14} aria-hidden /> {coverImage ? 'Change image' : 'Upload image'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload cover image" onChange={(e) => { const f = e.target.files?.[0]; if (f) readCover(f); e.target.value = '' }} /></label>
                    {coverImage && <button type="button" className="btn-ghost !h-8 hover:!text-red-600" onClick={() => setValue('coverImage', undefined, { shouldDirty: true })}><Trash2 size={14} aria-hidden /> Remove</button>}
                  </div>
                  <div role="radiogroup" aria-label="Cover colour" className="flex flex-wrap gap-2">
                    {COVER_TONES.map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={field.value === t} aria-label={t} onClick={() => field.onChange(t)}
                        className={cn('h-7 w-7 rounded-full bg-gradient-to-br ring-offset-2 focus-visible:ring-2 focus-visible:ring-accent', COVER_CLASS[t], field.value === t && 'ring-2 ring-ink')} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">The colour is used when no image is uploaded.</p>
                </div>
              )} />
            </fieldset>
          </SectionCard>
        </aside>
      </form>

      <ReasonDialog open={rejecting} onClose={() => setRejecting(false)} title="Reject this post" confirmLabel="Reject post" danger label="Reason for the author"
        description="The author sees this reason and can revise and resubmit."
        onSubmit={(reason) => { void act(() => rejectPost(post.id, reason), 'Post rejected. The author can revise and resubmit.')() }} />
      <ConfirmDialog open={publishing} onClose={() => setPublishing(false)} title={`Publish "${current.title}"?`} confirmLabel="Publish now"
        consequences={[`Make /blog/${current.slug} visible on the ${current.journal} website immediately`, 'Allow search engines to index it', 'Record the change in the audit log']}
        onConfirm={() => { void act(() => publishPost(post.id), 'Post published.')() }} />
      <Dialog open={scheduling} onClose={() => setScheduling(false)} title="Schedule publication" description="The post goes live automatically at this time."
        footer={<>
          <button className="btn-secondary" onClick={() => setScheduling(false)}>Cancel</button>
          <button className="btn-primary" onClick={() => {
            if (new Date(when).getTime() <= Date.now()) { toast.error('Choose a date and time in the future.'); return }
            setScheduling(false)
            void act(() => schedulePost(post.id, fromLocalInput(when)), `Scheduled for ${formatDateTime(fromLocalInput(when))}.`)()
          }}>Schedule</button>
        </>}>
        <FormField label="Publish on" required>
          {(a) => <input {...a} type="datetime-local" value={when} min={toLocalInput(new Date().toISOString())} onChange={(e) => setWhen(e.target.value)} className="input" />}
        </FormField>
      </Dialog>
    </>
  )
}
