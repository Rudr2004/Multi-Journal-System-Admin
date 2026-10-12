import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, FilePlus2, FileText, Newspaper, Pencil, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Tabs } from '@/components/Tabs'
import { Badge, JournalBadge } from '@/components/Badges'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { formatDate } from '@/shared/formatters'
import type { JournalCode } from '@/shared/types'
import type { CmsEntry, EntryKind } from '@/mock/data/website'
import { POST_CATEGORIES } from '@/mock/data/website'
import { createEntry, deleteEntry, listEntries, setEntryStatus } from '@/mock/api/cms'
import { useJournalKey } from '../shared'

export function EntryStatusBadge({ status }: { status: CmsEntry['status'] }) {
  return <Badge tone={status === 'published' ? 'success' : 'neutral'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>
}

const newSchema = z.object({
  title: z.string().trim().min(3, 'Enter a title of at least 3 characters.').max(120, 'Keep the title under 120 characters.'),
  journal: z.string().min(1, 'Choose a journal.'),
})
type NewForm = z.infer<typeof newSchema>

function NewEntryDialog({ kind, journals, defaultJournal, onClose }: { kind: EntryKind; journals: JournalCode[]; defaultJournal: JournalCode; onClose: () => void }) {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<NewForm>({ resolver: zodResolver(newSchema), defaultValues: { title: '', journal: defaultJournal } })
  const submit = handleSubmit(async (v) => {
    try {
      const e = await createEntry({ journal: v.journal as JournalCode, kind, title: v.title })
      toast.success(`Draft ${kind} created. Add content and publish when ready.`)
      onClose()
      navigate(`/pages/${e.id}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  })
  return (
    <Dialog open onClose={onClose} title={kind === 'page' ? 'New page' : 'New blog post'} description="It is created as a draft and stays off the website until you publish it."
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create draft'}</button>
      </>}>
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Title" required error={errors.title?.message}>
          {(a) => <input {...a} {...register('title')} autoFocus className="input" placeholder={kind === 'page' ? 'e.g. Indexing & Abstracting' : 'e.g. Volume 4 Issue 1 call for papers'} />}
        </FormField>
        {journals.length > 1 && (
          <FormField label="Journal" required error={errors.journal?.message}>
            {(a) => <select {...a} {...register('journal')} className="input">{journals.map((j) => <option key={j}>{j}</option>)}</select>}
          </FormField>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  )
}

function EntryTable({ kind }: { kind: EntryKind }) {
  const { journals, key } = useJournalKey()
  const all = useIsAllJournals()
  const { can, why } = usePermission('cms')
  const { data, loading, error, reload } = useAsync(() => listEntries({ kind, journals }), [kind, key])
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [creating, setCreating] = useState(false)
  const [publishing, setPublishing] = useState<CmsEntry | null>(null)
  const [unpublishing, setUnpublishing] = useState<CmsEntry | null>(null)
  const [deleting, setDeleting] = useState<CmsEntry | null>(null)
  const noun = kind === 'page' ? 'page' : 'post'

  const rows = useMemo(() => (data ?? []).filter((e) => (!status || e.status === status) && (!category || e.category === category)), [data, status, category])

  const run = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast.success(ok); reload() } catch (e) { toast.error((e as Error).message) }
  }
  const canPublish = can('approve')

  const columns: Column<CmsEntry>[] = [
    {
      id: 'title', header: kind === 'page' ? 'Page' : 'Post', locked: true, sort: (r) => r.title.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <Link to={`/pages/${r.id}`} className="line-clamp-2 font-medium text-accent hover:underline" title={r.title}>{r.title}</Link>
          <p className="text-xs text-muted">/{r.slug}</p>
        </div>
      ),
    },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (r: CmsEntry) => r.journal, cell: (r: CmsEntry) => <JournalBadge code={r.journal} /> }] : []),
    ...(kind === 'post' ? [
      { id: 'category', header: 'Category', sort: (r: CmsEntry) => r.category, cell: (r: CmsEntry) => <Badge tone="accent">{r.category}</Badge> },
      { id: 'author', header: 'Author', sort: (r: CmsEntry) => r.author, cell: (r: CmsEntry) => r.author, mobileHide: true },
      { id: 'publishDate', header: 'Publish date', sort: (r: CmsEntry) => r.publishDate, cell: (r: CmsEntry) => (r.publishDate ? formatDate(r.publishDate) : '—') },
    ] : []),
    { id: 'status', header: 'Status', sort: (r) => r.status, cell: (r) => <EntryStatusBadge status={r.status} /> },
    {
      id: 'updated', header: 'Updated', sort: (r) => r.updatedAt,
      cell: (r) => <div className="text-sm"><RelativeTime value={r.updatedAt} /><p className="text-xs text-muted">by {r.updatedBy}</p></div>,
    },
    {
      id: 'actions', header: '', locked: true,
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Link to={`/pages/${r.id}`} className="btn-ghost h-8 px-2" aria-label={`Edit ${r.title}`}><Pencil size={15} strokeWidth={1.5} /></Link>
          {r.status === 'published'
            ? <GuardedButton allowed={canPublish} why={why('approve')} className="btn-ghost h-8 px-2" aria-label={`Unpublish ${r.title}`} onClick={() => setUnpublishing(r)}><EyeOff size={15} strokeWidth={1.5} /></GuardedButton>
            : <GuardedButton allowed={canPublish} why={why('approve')} className="btn-ghost h-8 px-2" aria-label={`Publish ${r.title}`} onClick={() => setPublishing(r)}><Eye size={15} strokeWidth={1.5} /></GuardedButton>}
          <GuardedButton allowed={can('manage')} why={why('manage')} className="btn-ghost h-8 px-2 hover:!text-red-600" aria-label={`Delete ${r.title}`} onClick={() => setDeleting(r)}><Trash2 size={15} strokeWidth={1.5} /></GuardedButton>
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable<CmsEntry>
        id={`cms-${kind}`} data={rows} columns={columns} rowKey={(r) => r.id} loading={loading && !data} error={!!error} onRetry={reload}
        search={{ placeholder: `Search ${noun}s…`, text: (r) => `${r.title} ${r.slug} ${r.author}` }}
        filters={<>
          <SelectFilter label="Status" value={status} onChange={setStatus} options={[{ value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }]} />
          {kind === 'post' && <SelectFilter label="Category" value={category} onChange={setCategory} options={POST_CATEGORIES.map((c) => ({ value: c, label: c }))} />}
        </>}
        toolbarRight={<GuardedButton allowed={can('work') && journals.length > 0} why={why('work')} className="btn-primary" onClick={() => setCreating(true)}><FilePlus2 size={15} strokeWidth={1.5} aria-hidden /> New {noun}</GuardedButton>}
        empty={{ icon: kind === 'page' ? FileText : Newspaper, title: `No ${noun}s match`, hint: `Create a ${noun} or clear the filters.`, action: <button className="btn-primary" onClick={() => setCreating(true)}>New {noun}</button> }}
      />
      {creating && <NewEntryDialog kind={kind} journals={journals} defaultJournal={journals[0]} onClose={() => setCreating(false)} />}
      <ConfirmDialog open={!!publishing} onClose={() => setPublishing(null)} title={`Publish “${publishing?.title ?? ''}”?`} confirmLabel="Publish"
        consequences={[`Make /${publishing?.slug ?? ''} visible on the ${publishing?.journal ?? ''} website immediately`, 'Allow search engines to index it', 'Record the change in the audit log']}
        onConfirm={() => publishing && run(() => setEntryStatus(publishing.id, 'published'), `Published “${publishing.title}”.`)} />
      <ConfirmDialog open={!!unpublishing} onClose={() => setUnpublishing(null)} title={`Unpublish “${unpublishing?.title ?? ''}”?`} confirmLabel="Unpublish"
        consequences={[`Remove /${unpublishing?.slug ?? ''} from the public website (visitors will see a not-found page)`, 'Keep the content here as a draft so you can republish it', 'Record the change in the audit log']}
        onConfirm={() => unpublishing && run(() => setEntryStatus(unpublishing.id, 'draft'), `Unpublished “${unpublishing.title}”.`)} />
      <ConfirmDialog open={!!deleting} danger onClose={() => setDeleting(null)} title={`Delete “${deleting?.title ?? ''}”?`} confirmLabel="Delete permanently"
        consequences={['Permanently delete the content, SEO fields and any autosaved draft', 'Remove it from the website if it is published', 'This cannot be undone']}
        onConfirm={() => deleting && run(() => deleteEntry(deleting.id), `Deleted “${deleting.title}”.`)} />
    </>
  )
}

export default function CmsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'posts' ? 'posts' : 'pages'
  return (
    <>
      <PageHeader title="Pages & blog" description="Edit each journal's website pages, SEO fields and blog posts. Changes go live only when published." />
      <Tabs value={tab} onChange={(t) => setParams(t === 'posts' ? { tab: 'posts' } : {}, { replace: true })}
        tabs={[
          { id: 'pages', label: 'Pages', content: <EntryTable kind="page" /> },
          { id: 'posts', label: 'Blog posts', content: <EntryTable kind="post" /> },
        ]} />
    </>
  )
}
