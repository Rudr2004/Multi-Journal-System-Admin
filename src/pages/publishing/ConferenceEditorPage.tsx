import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { BookOpen, FileText, Link2, Rocket, Save, Search, Unlink } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { SectionCard } from '@/components/Card'
import { Badge, StatusBadge } from '@/components/Badges'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { DescriptionList } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { useCan, usePermission, useRole } from '@/permissions/hooks'
import { paperStagePath } from '@/lib/paperRoutes'
import {
  createProceedingsIssue, getConference, linkSubmissions, publishProceedings, saveConference, unlinkSubmission, type ConferenceDetail,
} from '@/mock/api/conferences'
import { conferenceStatus } from '@/mock/data/publishing'
import { journalByCode } from '@/mock/data/core'
import { formatDate } from '@/shared/formatters'
import type { Paper } from '@/shared/types'
import { ConferenceProductionDetail } from './ConferenceProduction'
import { ConferenceFields, conferenceSchema, toFormValues, toInput } from './conferenceForm'
import { IssueStatusBadge } from './parts'
import { HighlightsNoteCard, KeyMembersCard, MediaCard } from './ConferenceSections'

export function ConferenceEditorPage() {
  const { conferenceId = '' } = useParams()
  const perm = usePermission('conferences')
  if (!perm.can('manage')) return <ConferenceProductionDetail conferenceId={conferenceId} />
  return <ConferenceEditorLoader conferenceId={conferenceId} />
}

function ConferenceEditorLoader({ conferenceId }: { conferenceId: string }) {
  const r = useAsync(() => getConference(conferenceId), [conferenceId])
  if (r.error) return <><PageHeader title="Conference not found" crumbs={[{ label: conferenceId }]} /><div className="card"><ErrorState message="We could not load this conference." onRetry={r.reload} /></div></>
  if (!r.data) return <><PageHeader title="Loading conference…" crumbs={[{ label: conferenceId }]} /><div className="grid gap-5 lg:grid-cols-5"><Skeleton className="h-96 lg:col-span-3" /><Skeleton className="h-96 lg:col-span-2" /></div></>
  return <ConferenceEditor key={r.data.conference.id} detail={r.data} reload={r.reload} />
}

function ConferenceEditor({ detail, reload }: { detail: ConferenceDetail; reload: () => void }) {
  const { conference: c, issue, linked, candidates } = detail
  const perm = usePermission('conferences')
  const role = useRole()
  const canIssues = useCan('issues', 'view')
  const canEdit = perm.can('manage') && issue?.status !== 'published'
  const st = conferenceStatus(c, issue)

  const { register, handleSubmit, watch, control, setValue, reset, formState: { errors, isDirty, isSubmitting } } = useForm({ resolver: zodResolver(conferenceSchema), defaultValues: toFormValues(c) })
  const dirty = isDirty
  useUnsavedChanges(canEdit && dirty)

  const [linking, setLinking] = useState(false)
  const [confirmCreate, setConfirmCreate] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = handleSubmit(async (v) => {
    try {
      await saveConference(c.id, toInput(v))
      reset(v)
      toast.success('Conference saved')
      reload()
    } catch (e) { toast.error((e as Error).message) }
  }, () => toast.error('Please fix the highlighted fields.'))

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok); reload() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const noArticles = !issue || issue.articleIds.length === 0

  return (
    <>
      <PageHeader title={c.shortName} crumbs={[{ label: c.shortName }]} description={`${c.name} · ${journalByCode(c.journal).code}`}
        actions={<>
          <Badge tone={st.tone}>{st.label}</Badge>
          <GuardedButton className="btn-primary" allowed={canEdit && dirty} why={issue?.status === 'published' ? 'Published proceedings are locked.' : perm.why('manage')} disabled={isSubmitting || (canEdit && !dirty)} onClick={save}>
            <Save size={15} strokeWidth={1.5} aria-hidden /> {isSubmitting ? 'Saving…' : 'Save changes'}
          </GuardedButton>
        </>} />

      <div className="grid items-start gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <SectionCard title="Conference details">
            <form onSubmit={save} noValidate>
              <fieldset disabled={!canEdit}>
                <legend className="sr-only">Conference details</legend>
                <ConferenceFields register={register} errors={errors} watch={watch} journals={[c.journal]} lockJournal setApc={(on) => setValue('apcEnabled', on, { shouldDirty: true })} />
              </fieldset>
              <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
            </form>
          </SectionCard>
          <KeyMembersCard control={control} register={register} errors={errors} disabled={!canEdit} />
          <HighlightsNoteCard control={control} register={register} errors={errors} watch={watch} disabled={!canEdit} />
          <MediaCard conference={c} canEdit={perm.can('manage')} onSaved={reload} />
        </div>

        <div className="space-y-5 lg:col-span-2">
          <SectionCard title="Proceedings issue">
            {!issue ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Create a Proceedings issue in {c.journal} for this conference. Linked papers that are already published are added automatically.</p>
                <GuardedButton className="btn-primary" allowed={perm.can('manage')} why={perm.why('manage')} disabled={busy} onClick={() => setConfirmCreate(true)}><BookOpen size={15} strokeWidth={1.5} aria-hidden /> Create proceedings issue</GuardedButton>
              </div>
            ) : (
              <div className="space-y-4">
                <DescriptionList cols={1} items={[
                  { label: 'Issue', value: canIssues ? <Link to={`/issues/${issue.id}`} className="font-medium text-accent hover:underline">{issue.label}</Link> : <span className="font-medium">{issue.label}</span> },
                  { label: 'Status', value: <IssueStatusBadge status={issue.status} /> },
                  { label: 'Articles', value: issue.articleIds.length },
                  { label: issue.status === 'published' ? 'Published online' : 'Planned publication', value: formatDate(issue.publicationDate) },
                ]} />
                <div className="flex flex-wrap gap-2">
                  {canIssues && <Link to={`/issues/${issue.id}`} className="btn-secondary"><FileText size={15} strokeWidth={1.5} aria-hidden /> Open issue editor</Link>}
                  {issue.status !== 'published' && (
                    <GuardedButton className="btn-primary" allowed={perm.can('manage') && !noArticles}
                      why={perm.why('manage') ?? 'Add at least one article in the issue editor before publishing.'} disabled={busy} onClick={() => setConfirmPublish(true)}>
                      <Rocket size={15} strokeWidth={1.5} aria-hidden /> Publish proceedings
                    </GuardedButton>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title={`Linked submissions (${linked.length})`}
            action={<div className="flex flex-wrap gap-2">
              <GuardedButton className="btn-secondary" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setLinking(true)}><Link2 size={15} strokeWidth={1.5} aria-hidden /> Link papers</GuardedButton>
            </div>} flush>
            {linked.length === 0 ? (
              <EmptyState title="No submissions yet" hint={`Papers authors submit for ${c.shortName} show here and in Manuscript Submissions. You can also link existing papers now, then screen, review and publish them through the normal manuscript workflow.`}
                action={<GuardedButton className="btn-primary" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setLinking(true)}><Link2 size={15} strokeWidth={1.5} aria-hidden /> Link papers</GuardedButton>} />
            ) : (
              <ul className="divide-y divide-line">
                {linked.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/submissions/${p.id}`} className="whitespace-nowrap text-sm font-medium text-accent hover:underline">{p.id}</Link>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="line-clamp-2 text-sm text-muted" title={p.title}>{p.title}</p>
                      <p className="text-xs text-muted">{p.author} · <Link to={paperStagePath(role, p)} className="text-accent hover:underline">Open in workflow</Link></p>
                    </div>
                    <GuardedButton className="btn-ghost !h-8 !px-2" allowed={perm.can('manage') && issue?.status !== 'published'} why={perm.why('manage') ?? 'Proceedings are published.'} aria-label={`Unlink ${p.id}`}
                      onClick={() => run(() => unlinkSubmission(c.id, p.id), `${p.id} unlinked`)}><Unlink size={15} strokeWidth={1.5} aria-hidden /></GuardedButton>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <LinkDialog open={linking} onClose={() => setLinking(false)} candidates={candidates} journal={c.journal}
        onLink={(ids) => run(() => linkSubmissions(c.id, ids), `${ids.length} paper${ids.length === 1 ? '' : 's'} linked to ${c.shortName}`)} />

      <ConfirmDialog open={confirmCreate} onClose={() => setConfirmCreate(false)} title="Create proceedings issue?" confirmLabel="Create issue"
        consequences={[
          `Add a draft “Proceedings: ${c.shortName}” issue to ${c.journal}.`,
          'Pre-fill it with linked papers that are already published (others can be added later in the issue editor).',
          'Nothing is public until you publish the proceedings.',
        ]}
        onConfirm={() => run(() => createProceedingsIssue(c.id), 'Proceedings issue created')} />
      <ConfirmDialog open={confirmPublish} onClose={() => setConfirmPublish(false)} title={`Publish proceedings of ${c.shortName}?`} confirmLabel="Publish proceedings"
        consequences={[
          `Make ${issue?.articleIds.length ?? 0} article(s) public as ${issue?.label ?? 'the proceedings issue'} on the ${c.journal} website.`,
          'Lock the proceedings issue, its article order and page numbers.',
          'Queue Crossref DOI deposits for articles that have none.',
          'This is public and cannot be undone from this screen.',
        ]}
        onConfirm={() => run(() => publishProceedings(c.id), `Proceedings of ${c.shortName} published`)} />
    </>
  )
}

function LinkDialog({ open, onClose, candidates, journal, onLink }: { open: boolean; onClose: () => void; candidates: Paper[]; journal: string; onLink: (ids: string[]) => void }) {
  return (
    <Dialog open={open} onClose={onClose} width={640} title="Link papers to this conference" description={`Papers submitted to ${journal} that are not linked to another conference.`}>
      {open && <LinkPicker candidates={candidates} onCancel={onClose} onLink={(ids) => { onLink(ids); onClose() }} />}
    </Dialog>
  )
}

function LinkPicker({ candidates, onCancel, onLink }: { candidates: Paper[]; onCancel: () => void; onLink: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([])
  const [q, setQ] = useState('')
  const list = useMemo(() => candidates.filter((p) => !q.trim() || `${p.id} ${p.title} ${p.author}`.toLowerCase().includes(q.trim().toLowerCase())), [candidates, q])
  return (
    <div>
      <div className="relative mb-3">
        <Search size={15} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
        <input aria-label="Search papers" className="input pl-8" placeholder="Search by Paper ID, title or author" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? <EmptyState title="No papers available" hint="Every eligible paper is already linked, or none match your search." /> : (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {list.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-page">
                <input type="checkbox" className="mt-1 accent-indigo-600" checked={sel.includes(p.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><span className="whitespace-nowrap text-sm font-medium">{p.id}</span><StatusBadge status={p.status} /></span>
                  <span className="line-clamp-2 block text-sm text-muted" title={p.title}>{p.title}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={sel.length === 0} onClick={() => onLink(sel)}>Link {sel.length || ''} paper{sel.length === 1 ? '' : 's'}</button>
      </div>
    </div>
  )
}
