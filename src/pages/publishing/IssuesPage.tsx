import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BookOpen, Plus } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { SectionCard } from '@/components/Card'
import { Badge, JournalBadge } from '@/components/Badges'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { GuardedButton } from '@/components/Tooltip'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { SelectFilter } from '@/components/DataTable'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { createIssue, issueExists, listIssues, volumesFor, type IssueSummary } from '@/mock/api/issues'
import { useDataStore } from '@/mock/store'
import { ISSUE_STATUS_META } from '@/mock/data/publishing'
import { formatDate } from '@/shared/formatters'
import { journalByCode } from '@/mock/data/core'
import type { JournalCode } from '@/shared/types'
import { fromMonthValue, IssueStatusBadge } from './parts'
import { DurationField } from './fields'

export function IssuesPage() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const perm = usePermission('issues')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const r = useAsync(() => listIssues(journals), [journals.join()])

  const groups = useMemo(() => {
    const map = new Map<string, IssueSummary[]>()
    for (const i of (r.data ?? []).filter((x) => !status || x.status === status)) {
      const k = `${i.journal}|${i.volume}`
      map.set(k, [...(map.get(k) ?? []), i])
    }
    return [...map.entries()].map(([k, items]) => ({ key: k, journal: items[0].journal, volume: items[0].volume, items: items.sort((a, b) => b.number - a.number) }))
  }, [r.data, status])

  return (
    <>
      <PageHeader
        title="Volumes & issues"
        description="Plan volumes, fill issues with published articles, and publish when ready."
        actions={<GuardedButton className="btn-primary" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New issue</GuardedButton>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SelectFilter label="Status" value={status} onChange={setStatus} options={Object.entries(ISSUE_STATUS_META).map(([value, m]) => ({ value, label: m.label }))} />
        {r.data && <span className="text-sm text-muted" aria-live="polite">{groups.reduce((a, g) => a + g.items.length, 0)} issues in {groups.length} volumes</span>}
      </div>

      {r.error ? <div className="card"><ErrorState onRetry={r.reload} /></div>
        : r.loading && !r.data ? <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
        : groups.length === 0 ? (
          <div className="card"><EmptyState icon={BookOpen} title="No issues match" hint={status ? 'Clear the status filter to see every issue.' : 'Create the first issue to start planning a volume.'}
            action={perm.can('manage') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New issue</button>} /></div>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <SectionCard key={g.key} flush title={`Volume ${g.volume}`}
                action={<span className="flex items-center gap-2 text-sm text-muted">{all && <JournalBadge code={g.journal} />}{g.items.length} issue{g.items.length === 1 ? '' : 's'}</span>}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Issues in {g.journal} volume {g.volume}</caption>
                    <thead className="border-b border-line text-xs text-muted">
                      <tr>{['Issue', 'Month', 'Submission deadline', 'Publication date', 'Articles', 'Status'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-2 text-left font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {g.items.map((i) => (
                        <tr key={i.id} className="hover:bg-page">
                          <td className="px-4" style={{ paddingBlock: 'var(--cell-py)' }}>
                            <Link to={`/issues/${i.id}`} className="font-medium text-accent hover:underline">{i.label}</Link>
                            {i.conferenceId && <Badge tone="accent" className="ml-2">Proceedings{i.conferenceName ? ` · ${i.conferenceName}` : ''}</Badge>}
                          </td>
                          <td className="whitespace-nowrap px-4" style={{ paddingBlock: 'var(--cell-py)' }}>{new Date(i.month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</td>
                          <td className="whitespace-nowrap px-4" style={{ paddingBlock: 'var(--cell-py)' }}>{formatDate(i.submissionDeadline)}</td>
                          <td className="whitespace-nowrap px-4" style={{ paddingBlock: 'var(--cell-py)' }}>{formatDate(i.publicationDate)}</td>
                          <td className="px-4 tabular-nums" style={{ paddingBlock: 'var(--cell-py)' }}>{i.articleCount}</td>
                          <td className="px-4" style={{ paddingBlock: 'var(--cell-py)' }}><IssueStatusBadge status={i.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      <NewIssueDialog open={creating} onClose={() => setCreating(false)} journals={journals} />
    </>
  )
}

const schema = z.object({
  journal: z.string().min(1, 'Choose a journal'),
  volume: z.number({ error: 'Enter the volume number' }).int().min(1, 'Volume must be 1 or higher').max(99),
  number: z.number({ error: 'Enter the issue number' }).int().min(1, 'Issue number must be 1 or higher').max(99),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Choose the issue month'),
  submissionDeadline: z.string().min(1, 'Set a submission deadline'),
  publicationDate: z.string().min(1, 'Set a publication date'),
  firstReviewValue: z.number({ error: 'Enter a number' }).min(1, 'Enter 1 or more').max(999, 'Too large'),
  firstReviewUnit: z.enum(['hours', 'days']),
  publicationValue: z.number({ error: 'Enter a number' }).min(1, 'Enter 1 or more').max(999, 'Too large'),
  publicationUnit: z.enum(['hours', 'days']),
}).refine((v) => !v.submissionDeadline || !v.publicationDate || v.submissionDeadline <= v.publicationDate, { path: ['publicationDate'], message: 'Publication date must be on or after the submission deadline' })

function NewIssueDialog({ open, onClose, journals }: { open: boolean; onClose: () => void; journals: JournalCode[] }) {
  return (
    <Dialog open={open} onClose={onClose} title="New issue" description="Creates a draft you can fill with articles before opening it for submissions."
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" form="new-issue-form" type="submit">Create issue</button></>}>
      <NewIssueForm journals={journals} onDone={onClose} />
    </Dialog>
  )
}

function NewIssueForm({ journals, onDone }: { journals: JournalCode[]; onDone: () => void }) {
  const navigate = useNavigate()
  const issues = useDataStore((s) => s.issues)
  const j0 = journals[0]
  const mine = issues.filter((i) => i.journal === j0 && !i.conferenceId)
  const volume0 = Math.max(1, ...mine.map((i) => i.volume))
  const number0 = Math.max(0, ...mine.filter((i) => i.volume === volume0).map((i) => i.number)) + 1
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { journal: j0 ?? '', volume: volume0, number: number0, month: '', submissionDeadline: '', publicationDate: '', firstReviewValue: 2, firstReviewUnit: 'days' as const, publicationValue: 15, publicationUnit: 'days' as const },
  })
  const j = watch('journal') as JournalCode

  const submit = handleSubmit(async (v) => {
    if (issueExists(v.journal as JournalCode, v.volume, v.number)) return setError('number', { message: `Volume ${v.volume}, Issue ${v.number} already exists in ${v.journal}` })
    try {
      const issue = await createIssue({
        journal: v.journal as JournalCode, volume: v.volume, number: v.number, month: fromMonthValue(v.month),
        submissionDeadline: v.submissionDeadline, publicationDate: v.publicationDate,
        firstReviewTime: { value: v.firstReviewValue, unit: v.firstReviewUnit }, publicationTime: { value: v.publicationValue, unit: v.publicationUnit },
        callForPapers: 'We invite original research articles, reviews and case studies. All submissions are peer reviewed and receive a DOI on publication.',
      })
      toast.success(`${issue.label} created as a draft`)
      onDone()
      navigate(`/issues/${issue.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <form id="new-issue-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <FormField label="Journal" required error={errors.journal?.message} className="sm:col-span-2">
        {(a) => <select {...a} className="input" {...register('journal')}>{journals.map((c) => <option key={c} value={c}>{c} — {journalByCode(c).name}</option>)}</select>}
      </FormField>
      <FormField label="Volume" required error={errors.volume?.message} hint={j ? `Existing: ${volumesFor(j).join(', ') || 'none'}` : undefined}>
        {(a) => <input {...a} type="number" min={1} className="input" {...register('volume', { valueAsNumber: true })} />}
      </FormField>
      <FormField label="Issue number" required error={errors.number?.message}>
        {(a) => <input {...a} type="number" min={1} className="input" {...register('number', { valueAsNumber: true })} />}
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
      <DurationField label="First review" error={errors.firstReviewValue?.message} hint="Time to the first review decision, e.g. 2 days or 36 hours."
        valueProps={register('firstReviewValue', { valueAsNumber: true })} unitProps={register('firstReviewUnit')} />
      <DurationField label="Publication" error={errors.publicationValue?.message} hint="Time from acceptance to publication, e.g. 15 days."
        valueProps={register('publicationValue', { valueAsNumber: true })} unitProps={register('publicationUnit')} />
    </form>
  )
}
