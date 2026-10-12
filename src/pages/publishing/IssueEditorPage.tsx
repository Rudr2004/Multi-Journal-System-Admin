import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowRight, Check, GripVertical, Hash, Lock, Plus, Rocket, Save, Search, X } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { SectionCard } from '@/components/Card'
import { ConfirmDialog } from '@/components/Dialog'
import { CharCount, FormField } from '@/components/Form'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { StatusBadge } from '@/components/Badges'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import { usePermission } from '@/permissions/hooks'
import { advanceIssue, getIssue, publishIssue, saveIssue, type IssueDetail } from '@/mock/api/issues'
import { ISSUE_FLOW, ISSUE_STATUS_META } from '@/mock/data/publishing'
import { journalByCode } from '@/mock/data/core'
import { formatDate } from '@/shared/formatters'
import type { Paper } from '@/shared/types'
import { ImageField, fromMonthValue, toMonthValue, type ImageValue } from './parts'

const PAGE_RE = /^\d{1,4}([–-]\d{1,4})?$/
const normPages = (v: string) => v.trim().replace(/\s*-\s*/, '–')
const pagesError = (v: string) => {
  const n = normPages(v)
  if (!n) return 'Enter page numbers, e.g. 12–19'
  if (!PAGE_RE.test(n)) return 'Use a number or range like 12–19'
  const [a, b] = n.split('–').map(Number)
  return b !== undefined && b < a ? 'End page is before the start page' : undefined
}

const schema = z.object({
  number: z.number({ error: 'Enter the issue number' }).int().min(1, 'Issue number must be 1 or higher').max(99),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Choose the issue month'),
  submissionDeadline: z.string().min(1, 'Set a submission deadline'),
  publicationDate: z.string().min(1, 'Set a publication date'),
  callForPapers: z.string().trim().min(20, 'Call for papers needs at least 20 characters').max(600, 'Keep it to 600 characters or fewer'),
}).refine((v) => v.submissionDeadline <= v.publicationDate, { path: ['publicationDate'], message: 'Publication date must be on or after the submission deadline' })

export function IssueEditorPage() {
  const { issueId = '' } = useParams()
  const r = useAsync(() => getIssue(issueId), [issueId])
  return (
    <>
      {r.error ? (
        <>
          <PageHeader title="Issue not found" crumbs={[{ label: issueId }]} />
          <div className="card"><ErrorState message="We could not load this issue." onRetry={r.reload} /></div>
        </>
      ) : !r.data ? (
        <>
          <PageHeader title="Loading issue…" crumbs={[{ label: issueId }]} />
          <div className="grid gap-5 lg:grid-cols-5"><Skeleton className="h-96 lg:col-span-2" /><Skeleton className="h-96 lg:col-span-3" /></div>
        </>
      ) : <IssueEditor key={r.data.issue.id} detail={r.data} reload={r.reload} />}
    </>
  )
}

function IssueEditor({ detail, reload }: { detail: IssueDetail; reload: () => void }) {
  const { issue } = detail
  const perm = usePermission('issues')
  const locked = issue.status === 'published' || !perm.can('manage')
  const jn = journalByCode(issue.journal)

  const initialForm = { number: issue.number, month: toMonthValue(issue.month), submissionDeadline: issue.submissionDeadline, publicationDate: issue.publicationDate, callForPapers: issue.callForPapers }
  const { register, handleSubmit, watch, reset, formState: { errors, isDirty, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: initialForm })

  const [articles, setArticles] = useState<Paper[]>(detail.articles)
  const [pages, setPages] = useState<Record<string, string>>(issue.pages)
  const [cover, setCover] = useState<ImageValue | null>(detail.cover ?? null)
  const [base, setBase] = useState<{ ids: string[]; pages: Record<string, string>; cover: ImageValue | null }>({ ids: issue.articleIds, pages: issue.pages, cover: detail.cover ?? null })
  const [pageErrs, setPageErrs] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [busy, setBusy] = useState(false)

  const ids = articles.map((a) => a.id)
  const articlesDirty = JSON.stringify(ids) !== JSON.stringify(base.ids) || ids.some((id) => (pages[id] ?? '') !== (base.pages[id] ?? ''))
  const coverDirty = (cover?.name ?? '') !== (base.cover?.name ?? '') || cover?.data !== base.cover?.data
  const dirty = isDirty || articlesDirty || coverDirty
  useUnsavedChanges(!locked && dirty)

  const candidates = useMemo(() => {
    const pool = [...detail.candidates, ...detail.articles]
    const taken = new Set(ids)
    const needle = q.trim().toLowerCase()
    return pool.filter((p) => !taken.has(p.id) && (!needle || `${p.id} ${p.title} ${p.author}`.toLowerCase().includes(needle)))
  }, [detail, ids, q])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    setArticles((list) => arrayMove(list, list.findIndex((a) => a.id === e.active.id), list.findIndex((a) => a.id === e.over!.id)))
  }

  const add = (p: Paper) => {
    setArticles((l) => [...l, p])
    setPages((m) => {
      const last = articles.map((a) => (m[a.id] ?? '').split('–').pop()).map(Number).filter(Boolean)
      const start = (last.length ? Math.max(...last) : 0) + 1
      return { ...m, [p.id]: m[p.id] || `${start}–${start + 7}` }
    })
  }
  const remove = (id: string) => setArticles((l) => l.filter((a) => a.id !== id))
  const autoNumber = () => {
    setPages(Object.fromEntries(articles.map((a, i) => [a.id, `${i * 8 + 1}–${i * 8 + 8}`])))
    setPageErrs({})
    toast.info('Page numbers re-assigned in order (8 pages each). Adjust any range as needed.')
  }

  const persist = async (v: z.infer<typeof schema>) => {
    const errs: Record<string, string> = {}
    for (const a of articles) {
      const e = pagesError(pages[a.id] ?? '')
      if (e) errs[a.id] = e
    }
    setPageErrs(errs)
    if (Object.keys(errs).length) { toast.error('Fix the highlighted page numbers before saving.'); return false }
    const cleanPages = Object.fromEntries(articles.map((a) => [a.id, normPages(pages[a.id] ?? '')]))
    try {
      await saveIssue(issue.id, { ...v, month: fromMonthValue(v.month), articleIds: ids, pages: cleanPages, cover })
      setPages(cleanPages)
      reset(v)
      setBase({ ids, pages: cleanPages, cover })
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    }
  }

  const save = handleSubmit(async (v) => {
    if (await persist(v)) { toast.success('Issue saved'); reload() }
  }, () => toast.error('Please fix the highlighted fields.'))

  const stepIdx = ISSUE_FLOW.indexOf(issue.status)
  const savedCount = base.ids.length
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok); reload() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const nextLabel = issue.status === 'draft' ? 'Open for submissions' : issue.status === 'open' ? 'Move to production' : undefined
  const guardDirty = dirty ? 'Save your changes first.' : undefined
  const publishBlocked = savedCount === 0 ? 'Add at least one article to this issue before publishing.' : guardDirty

  return (
    <>
      <PageHeader
        title={issue.label}
        crumbs={[{ label: issue.label }]}
        description={`${jn.name} · ${issue.conferenceId && detail.conferenceName ? `Proceedings of ${detail.conferenceName}` : `Planned for ${formatDate(issue.publicationDate)}`}`}
        actions={<>
          <GuardedButton className="btn-secondary" allowed={!locked} why={issue.status === 'published' ? 'Published issues are locked.' : perm.why('manage')} onClick={save} disabled={!dirty || isSubmitting}>
            <Save size={15} strokeWidth={1.5} aria-hidden /> {isSubmitting ? 'Saving…' : 'Save changes'}
          </GuardedButton>
          {nextLabel && (
            <GuardedButton className="btn-primary" allowed={perm.can('manage') && !dirty} why={perm.why('manage') ?? guardDirty} disabled={busy}
              onClick={() => run(() => advanceIssue(issue.id), `${issue.label} moved to “${ISSUE_STATUS_META[ISSUE_FLOW[stepIdx + 1]].label}”`)}>
              {nextLabel} <ArrowRight size={15} aria-hidden />
            </GuardedButton>
          )}
          {issue.status === 'in_production' && (
            <GuardedButton className="btn-primary" allowed={perm.can('manage') && !publishBlocked} why={perm.why('manage') ?? publishBlocked} disabled={busy} onClick={() => setConfirmPublish(true)}>
              <Rocket size={15} strokeWidth={1.5} aria-hidden /> Publish issue
            </GuardedButton>
          )}
        </>}
      />

      <nav aria-label="Issue status" className="card mb-5 p-4">
        <ol className="grid gap-3 sm:grid-cols-4">
          {ISSUE_FLOW.map((s, i) => {
            const done = i < stepIdx || issue.status === 'published'
            const cur = i === stepIdx
            return (
              <li key={s} aria-current={cur ? 'step' : undefined} className="flex items-center gap-3">
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset',
                  done ? 'bg-green-50 text-green-700 ring-green-200' : cur ? 'bg-accent text-white ring-accent' : 'bg-subtle text-muted ring-line')}>
                  {done ? <Check size={14} aria-hidden /> : i + 1}
                </span>
                <span className={cn('text-sm', cur ? 'font-semibold text-ink' : 'text-muted')}>{ISSUE_STATUS_META[s].label}<span className="sr-only">{done ? ' (done)' : cur ? ' (current)' : ''}</span></span>
              </li>
            )
          })}
        </ol>
      </nav>

      {locked && (
        <div role="status" className="mb-5 flex items-start gap-2 rounded-lg border border-line bg-subtle px-4 py-3 text-sm text-muted">
          <Lock size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
          {issue.status === 'published'
            ? <span>This issue was published{issue.actualOnlineDate ? ` on ${formatDate(issue.actualOnlineDate)}` : ''} and is locked. Corrections to published articles go through Post-publication changes.</span>
            : <span>{perm.why('manage')}</span>}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <SectionCard title="Issue details">
            <form onSubmit={save} noValidate>
              <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
                <legend className="sr-only">Issue details</legend>
                <FormField label="Journal and volume">{(a) => <input id={a.id} className="input" value={`${issue.journal} · Volume ${issue.volume}`} disabled readOnly />}</FormField>
                <FormField label="Issue number" required error={errors.number?.message}>
                  {(a) => <input {...a} type="number" min={1} className="input" {...register('number', { valueAsNumber: true })} disabled={locked || !!issue.conferenceId} />}
                </FormField>
                <FormField label="Issue month" required error={errors.month?.message} className="sm:col-span-2">
                  {(a) => <input {...a} type="month" className="input" {...register('month')} />}
                </FormField>
                <FormField label="Submission deadline" required error={errors.submissionDeadline?.message}>
                  {(a) => <input {...a} type="date" className="input" {...register('submissionDeadline')} />}
                </FormField>
                <FormField label="Publication date" required error={errors.publicationDate?.message}>
                  {(a) => <input {...a} type="date" className="input" {...register('publicationDate')} />}
                </FormField>
                <div className="sm:col-span-2">
                  <ImageField label="Cover image" value={cover} onChange={setCover} disabled={locked} hint="Placeholder upload — shown on the issue page. PNG, JPG or WebP up to 2 MB." />
                </div>
                <FormField label="Call for papers" required error={errors.callForPapers?.message} className="sm:col-span-2">
                  {(a) => (
                    <>
                      <textarea {...a} rows={5} className="input !h-auto py-2" {...register('callForPapers')} />
                      <div className="mt-1 text-right"><CharCount value={watch('callForPapers') ?? ''} max={600} min={20} /></div>
                    </>
                  )}
                </FormField>
              </fieldset>
              <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
            </form>
          </SectionCard>
        </div>

        <div className="space-y-5 lg:col-span-3">
          <SectionCard title={`Articles in this issue (${articles.length})`}
            action={<button className="btn-secondary" onClick={autoNumber} disabled={locked || articles.length === 0}><Hash size={15} strokeWidth={1.5} aria-hidden /> Auto-number pages</button>}>
            {articles.length === 0 ? (
              <EmptyState title="No articles yet" hint={locked ? 'This issue has no articles.' : 'Add published papers from the list below. An issue needs at least one article before it can be published.'} />
            ) : (
              <>
                {!locked && <p className="mb-3 text-xs text-muted">Drag the handle (or focus it and press Space, then the arrow keys) to reorder. The order here is the order on the issue page.</p>}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={locked}>
                    <ol className="space-y-2">
                      {articles.map((a, i) => (
                        <ArticleRow key={a.id} paper={a} index={i} locked={locked} pages={pages[a.id] ?? ''} error={pageErrs[a.id]}
                          onPages={(v) => { setPages((m) => ({ ...m, [a.id]: v })); setPageErrs((e) => { const { [a.id]: _drop, ...rest } = e; void _drop; return rest }) }}
                          onBlur={() => setPages((m) => ({ ...m, [a.id]: normPages(m[a.id] ?? '') }))}
                          onRemove={() => remove(a.id)} />
                      ))}
                    </ol>
                  </SortableContext>
                </DndContext>
              </>
            )}
          </SectionCard>

          {!locked && (
            <SectionCard title={`Add published articles (${candidates.length})`}>
              <p className="mb-3 text-sm text-muted">Published papers of {issue.journal} that are not yet part of any issue.</p>
              <div className="relative mb-3 max-w-sm">
                <Search size={15} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                <input aria-label="Search candidate articles" className="input pl-8" placeholder="Search by Paper ID, title or author" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {candidates.length === 0 ? (
                <EmptyState title={q ? 'No matching articles' : 'No unassigned published papers'} hint={q ? 'Try a different search.' : `Papers appear here once they are published in ${issue.journal} and are not yet in an issue.`} />
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {candidates.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="whitespace-nowrap text-sm font-medium">{p.id}</span><StatusBadge status={p.status} /></div>
                        <p className="line-clamp-2 text-sm text-muted" title={p.title}>{p.title}</p>
                        <p className="text-xs text-muted">{p.author}</p>
                      </div>
                      <button className="btn-secondary shrink-0" onClick={() => add(p)} aria-label={`Add ${p.id} to this issue`}><Plus size={15} aria-hidden /> Add</button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}
        </div>
      </div>

      <ConfirmDialog open={confirmPublish} onClose={() => setConfirmPublish(false)} title={`Publish ${issue.label}?`} confirmLabel="Publish issue"
        consequences={[
          `Make ${savedCount} article${savedCount === 1 ? '' : 's'} part of this issue on the ${issue.journal} website, with today as the online date.`,
          'Lock the issue: details, article order and page numbers can no longer be edited.',
          'Queue Crossref DOI deposits for any article that does not have one yet.',
          'This is public and cannot be undone from this screen.',
        ]}
        onConfirm={() => run(() => publishIssue(issue.id), `${issue.label} published`)} />
    </>
  )
}

function ArticleRow({ paper, index, locked, pages, error, onPages, onBlur, onRemove }: {
  paper: Paper; index: number; locked: boolean; pages: string; error?: string
  onPages: (v: string) => void; onBlur: () => void; onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: paper.id, disabled: locked })
  const inputId = `pg-${paper.id}`
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-start gap-3 rounded-lg border border-line bg-surface p-3', isDragging && 'relative z-10 shadow-overlay')}>
      <button ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={locked} aria-label={`Reorder ${paper.id}, position ${index + 1}`}
        className="mt-0.5 cursor-grab rounded p-1 text-faint hover:bg-subtle hover:text-ink disabled:cursor-default disabled:opacity-40"><GripVertical size={16} strokeWidth={1.5} /></button>
      <span className="mt-1 w-5 shrink-0 text-right text-sm tabular-nums text-muted" aria-hidden>{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="whitespace-nowrap text-sm font-medium">{paper.id}</p>
        <p className="line-clamp-2 text-sm text-muted" title={paper.title}>{paper.title}</p>
        <p className="text-xs text-muted">{paper.author}</p>
      </div>
      <div className="w-28 shrink-0">
        <label htmlFor={inputId} className="label">Pages</label>
        <input id={inputId} className="input" value={pages} disabled={locked} onChange={(e) => onPages(e.target.value)} onBlur={onBlur} aria-invalid={!!error} aria-describedby={error ? `${inputId}-e` : undefined} placeholder="12–19" />
        {error && <p id={`${inputId}-e`} role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      {!locked && <button className="btn-ghost mt-5 !h-8 !w-8 !px-0" onClick={onRemove} aria-label={`Remove ${paper.id} from this issue`}><X size={16} strokeWidth={1.5} /></button>}
    </li>
  )
}
