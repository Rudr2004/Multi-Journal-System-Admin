import { useMemo, useState } from 'react'
import { Download, FileText, FileUp, Pencil, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { FormField, Switch } from '@/components/Form'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import type { JournalCode } from '@/shared/types'
import { RESOURCE_CATEGORIES, type BlogResource, type ResourceCategory } from '@/mock/data/blog'
import { deleteResource, listResources, recordDownload, saveResource, setResourcePublished } from '@/mock/api/blog'
import { useJournalKey } from '../shared'
import { formatBytes } from './parts'

const schema = z.object({
  title: z.string().trim().min(3, 'Enter a title of at least 3 characters.').max(120, 'Keep the title under 120 characters.'),
  journal: z.string().min(1, 'Choose a journal.'),
  category: z.enum(RESOURCE_CATEGORIES, { error: 'Choose a category.' }),
  description: z.string().trim().min(10, 'Describe the file in at least 10 characters.').max(240, 'Keep the description under 240 characters.'),
  file: z.object({ name: z.string(), sizeKb: z.number() }, { error: 'Choose a file to upload.' }),
})
type FormValues = z.infer<typeof schema>

function ResourceDialog({ resource, journals, onClose, onSaved }: { resource?: BlogResource; journals: JournalCode[]; onClose: () => void; onSaved: () => void }) {
  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: resource?.title ?? '', journal: resource?.journal ?? journals[0], category: resource?.category ?? 'Templates', description: resource?.description ?? '',
      file: resource ? { name: resource.fileName, sizeKb: resource.sizeKb } : undefined,
    },
  })
  const submit = handleSubmit(async (v) => {
    try {
      await saveResource(resource?.id, { journal: v.journal as JournalCode, title: v.title, category: v.category as ResourceCategory, description: v.description, fileName: v.file.name, sizeKb: v.file.sizeKb })
      toast.success(resource ? 'Resource updated.' : 'Resource added. Switch it to Published when it is ready for readers.')
      onSaved()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })
  return (
    <Dialog open onClose={onClose} title={resource ? 'Edit resource' : 'Add resource'} description="Files are stored for the prototype only; the name and size are recorded."
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={isSubmitting}>{isSubmitting ? 'Saving…' : resource ? 'Save changes' : 'Add resource'}</button>
      </>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormField label="Title" required error={errors.title?.message}>
          {(a) => <input {...a} {...register('title')} autoFocus className="input" placeholder="e.g. Manuscript template (Word)" />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Category" required error={errors.category?.message}>
            {(a) => <select {...a} {...register('category')} className="input">{RESOURCE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}
          </FormField>
          <FormField label="Journal" required error={errors.journal?.message}>
            {(a) => <select {...a} {...register('journal')} className="input" disabled={journals.length < 2}>{journals.map((j) => <option key={j}>{j}</option>)}</select>}
          </FormField>
        </div>
        <FormField label="Description" required error={errors.description?.message}>
          {(a) => <textarea {...a} {...register('description')} rows={3} className="input !h-auto py-2" />}
        </FormField>
        <Controller control={control} name="file" render={({ field }) => (
          <FormField label="File" required error={errors.file?.message} hint={field.value ? `${field.value.name} · ${formatBytes(field.value.sizeKb)}` : 'PDF, Word or Excel, up to 10 MB.'}>
            {(a) => (
              <input {...a} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="input !h-auto py-2"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > 10 * 1024 * 1024) { toast.error('Choose a file smaller than 10 MB.'); e.target.value = ''; return }
                  field.onChange({ name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) })
                }} />
            )}
          </FormField>
        )} />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  )
}

export function ResourcesTab() {
  const { journals, key } = useJournalKey()
  const all = useIsAllJournals()
  const { can, why } = usePermission('blog')
  const canManage = can('approve')
  const { data, loading, error, reload } = useAsync(() => listResources({ journals, publishedOnly: !canManage }), [key, canManage])
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<BlogResource | 'new' | null>(null)
  const [deleting, setDeleting] = useState<BlogResource | null>(null)

  const rows = useMemo(() => (data ?? []).filter((r) => !category || r.category === category), [data, category])
  const run = async (fn: () => Promise<void>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); reload() } catch (e) { toast.error((e as Error).message) }
  }

  const columns: Column<BlogResource>[] = [
    {
      id: 'title', header: 'Resource', locked: true, sort: (r) => r.title.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0">
          <p className="line-clamp-2 font-medium" title={r.title}>{r.title}</p>
          <p className="line-clamp-1 max-w-md text-xs text-muted" title={r.description}>{r.description}</p>
        </div>
      ),
    },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (r: BlogResource) => r.journal, cell: (r: BlogResource) => <JournalBadge code={r.journal} /> }] : []),
    { id: 'category', header: 'Category', sort: (r) => r.category, cell: (r) => <Badge tone="accent">{r.category}</Badge> },
    { id: 'file', header: 'File', mobileHide: true, cell: (r) => <div className="text-sm"><span className="break-all">{r.fileName}</span><p className="text-xs text-muted">{formatBytes(r.sizeKb)}</p></div> },
    { id: 'downloads', header: 'Downloads', align: 'right', sort: (r) => r.downloads, cell: (r) => <span className="tabular-nums">{r.downloads.toLocaleString('en-IN')}</span> },
    {
      id: 'published', header: 'Published', sort: (r) => Number(r.published),
      cell: (r) => canManage
        ? <Switch checked={r.published} label={`${r.published ? 'Unpublish' : 'Publish'} ${r.title}`} onChange={(v) => run(() => setResourcePublished(r.id, v), v ? `"${r.title}" is now visible to readers.` : `"${r.title}" is hidden from readers.`)} />
        : <Badge tone={r.published ? 'success' : 'neutral'}>{r.published ? 'Published' : 'Hidden'}</Badge>,
    },
    { id: 'updated', header: 'Updated', sort: (r) => r.updatedAt, mobileHide: true, cell: (r) => <RelativeTime value={r.updatedAt} /> },
    {
      id: 'actions', header: '', locked: true,
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <button className="btn-ghost h-8 px-2" aria-label={`Download ${r.fileName}`} onClick={() => run(() => recordDownload(r.id), `${r.fileName} downloaded (mock file).`)}><Download size={15} strokeWidth={1.5} /></button>
          <GuardedButton allowed={canManage} why={why('approve')} className="btn-ghost h-8 px-2" aria-label={`Edit ${r.title}`} onClick={() => setEditing(r)}><Pencil size={15} strokeWidth={1.5} /></GuardedButton>
          <GuardedButton allowed={canManage} why={why('approve')} className="btn-ghost h-8 px-2 hover:!text-red-600" aria-label={`Delete ${r.title}`} onClick={() => setDeleting(r)}><Trash2 size={15} strokeWidth={1.5} /></GuardedButton>
        </div>
      ),
    },
  ]

  return (
    <>
      {!canManage && <p className="mb-3 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">You can download published resources. The Editor adds and publishes them.</p>}
      <DataTable<BlogResource>
        id="blog-resources" data={rows} columns={columns} rowKey={(r) => r.id} loading={loading && !data} error={!!error} onRetry={reload}
        search={{ placeholder: 'Search resources…', text: (r) => `${r.title} ${r.fileName} ${r.description}` }}
        filters={<SelectFilter label="Category" value={category} onChange={setCategory} options={RESOURCE_CATEGORIES.map((c) => ({ value: c, label: c }))} />}
        toolbarRight={<GuardedButton allowed={canManage && journals.length > 0} why={why('approve')} className="btn-primary" onClick={() => setEditing('new')}><FileUp size={15} strokeWidth={1.5} aria-hidden /> Add resource</GuardedButton>}
        empty={{ icon: FileText, title: 'No resources match', hint: canManage ? 'Add a template, guide or checklist for authors.' : 'Nothing has been published for your journals yet.' }}
      />
      {editing && <ResourceDialog resource={editing === 'new' ? undefined : editing} journals={journals} onClose={() => setEditing(null)} onSaved={reload} />}
      <ConfirmDialog open={!!deleting} danger onClose={() => setDeleting(null)} title={`Delete "${deleting?.title ?? ''}"?`} confirmLabel="Delete permanently"
        consequences={['Remove the file and its download count', 'Remove it from the website if it is published', 'This cannot be undone']}
        onConfirm={() => deleting && run(() => deleteResource(deleting.id), `Deleted "${deleting.title}".`)} />
    </>
  )
}
