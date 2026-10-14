import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FilePlus2, Newspaper, Pencil, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { JournalBadge } from '@/components/Badges'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals } from '@/lib/scope'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import { formatDateTime } from '@/shared/formatters'
import type { JournalCode } from '@/shared/types'
import { BLOG_STATUSES, BLOG_STATUS_META, type BlogPost } from '@/mock/data/blog'
import { createPost, deletePost, listPosts } from '@/mock/api/blog'
import { useJournalKey } from '../shared'
import { BlogStatusBadge } from './parts'

const newSchema = z.object({
  title: z.string().trim().min(3, 'Enter a title of at least 3 characters.').max(120, 'Keep the title under 120 characters.'),
  journal: z.string().min(1, 'Choose a journal.'),
})
type NewForm = z.infer<typeof newSchema>

function NewPostDialog({ journals, onClose }: { journals: JournalCode[]; onClose: () => void }) {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<NewForm>({ resolver: zodResolver(newSchema), defaultValues: { title: '', journal: journals[0] } })
  const submit = handleSubmit(async (v) => {
    try {
      const p = await createPost({ journal: v.journal as JournalCode, title: v.title })
      toast.success('Draft created. Write the post and submit it for approval when ready.')
      onClose()
      navigate(`/blog/${p.id}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  })
  return (
    <Dialog open onClose={onClose} title="New blog post" description="It starts as a draft that only you and the Editor can see."
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create draft'}</button>
      </>}>
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Title" required error={errors.title?.message}>
          {(a) => <input {...a} {...register('title')} autoFocus className="input" placeholder="e.g. Volume 4 Issue 2 call for papers" />}
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

export function PostsTab() {
  const { journals, key } = useJournalKey()
  const all = useIsAllJournals()
  const user = useCurrentUser()
  const { level, can, why } = usePermission('blog')
  const ownOnly = !can('approve')
  const { data, loading, error, reload } = useAsync(() => listPosts({ journals, authorId: ownOnly ? user?.id : undefined }), [key, ownOnly, user?.id])
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<BlogPost | null>(null)

  const rows = useMemo(() => (data ?? []).filter((p) => !status || p.status === status), [data, status])
  const canDelete = (p: BlogPost) => p.status !== 'published' && (can('manage') || (level === 'work' && p.authorId === user?.id && ['draft', 'rejected'].includes(p.status)) || can('approve'))

  const columns: Column<BlogPost>[] = [
    {
      id: 'title', header: 'Post', locked: true, sort: (r) => r.title.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <Link to={`/blog/${r.id}`} className="line-clamp-2 font-medium text-accent hover:underline" title={r.title}>{r.title}</Link>
          <p className="text-xs text-muted">/blog/{r.slug}</p>
          {r.status === 'rejected' && r.rejectionReason && <p className="mt-1 line-clamp-2 max-w-md text-xs text-red-700" title={r.rejectionReason}>Reason: {r.rejectionReason}</p>}
        </div>
      ),
    },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (r: BlogPost) => r.journal, cell: (r: BlogPost) => <JournalBadge code={r.journal} /> }] : []),
    { id: 'author', header: 'Author', sort: (r) => r.authorName, mobileHide: true, cell: (r) => r.authorName },
    {
      id: 'status', header: 'Status', sort: (r) => BLOG_STATUS_META[r.status].order,
      cell: (r) => (
        <div className="space-y-1">
          <BlogStatusBadge status={r.status} />
          {r.status === 'scheduled' && r.scheduledAt && <p className="text-xs text-muted">{formatDateTime(r.scheduledAt)}</p>}
        </div>
      ),
    },
    { id: 'updated', header: 'Updated', sort: (r) => r.updatedAt, cell: (r) => <div className="text-sm"><RelativeTime value={r.updatedAt} /><p className="text-xs text-muted">by {r.updatedBy}</p></div> },
    {
      id: 'actions', header: '', locked: true,
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Link to={`/blog/${r.id}`} className="btn-ghost h-8 px-2" aria-label={`${r.status === 'pending' && can('approve') ? 'Review' : 'Open'} ${r.title}`}><Pencil size={15} strokeWidth={1.5} /></Link>
          <GuardedButton allowed={canDelete(r)} why={r.status === 'published' ? 'Published posts cannot be deleted here.' : why('work')} className="btn-ghost h-8 px-2 hover:!text-red-600" aria-label={`Delete ${r.title}`} onClick={() => setDeleting(r)}><Trash2 size={15} strokeWidth={1.5} /></GuardedButton>
        </div>
      ),
    },
  ]

  return (
    <>
      {ownOnly && <p className="mb-3 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">You see your own posts. Drafts you submit go to the Editor for approval before they are published.</p>}
      <DataTable<BlogPost>
        id="blog-posts" data={rows} columns={columns} rowKey={(r) => r.id} loading={loading && !data} error={!!error} onRetry={reload}
        search={{ placeholder: 'Search posts…', text: (r) => `${r.title} ${r.slug} ${r.authorName}` }}
        filters={<SelectFilter label="Status" value={status} onChange={setStatus} options={BLOG_STATUSES.map((s) => ({ value: s, label: BLOG_STATUS_META[s].label }))} />}
        toolbarRight={<GuardedButton allowed={can('work') && journals.length > 0} why={why('work')} className="btn-primary" onClick={() => setCreating(true)}><FilePlus2 size={15} strokeWidth={1.5} aria-hidden /> New post</GuardedButton>}
        empty={{ icon: Newspaper, title: 'No blog posts match', hint: 'Create a post or clear the filters.', action: can('work') ? <button className="btn-primary" onClick={() => setCreating(true)}>New post</button> : undefined }}
      />
      {creating && <NewPostDialog journals={journals} onClose={() => setCreating(false)} />}
      <ConfirmDialog open={!!deleting} danger onClose={() => setDeleting(null)} title={`Delete "${deleting?.title ?? ''}"?`} confirmLabel="Delete permanently"
        consequences={['Permanently delete the content, SEO fields and any autosaved draft', 'Record the deletion in the audit log', 'This cannot be undone']}
        onConfirm={async () => {
          if (!deleting) return
          try { await deletePost(deleting.id); toast.success(`Deleted "${deleting.title}".`); reload() } catch (e) { toast.error((e as Error).message) }
        }} />
    </>
  )
}
