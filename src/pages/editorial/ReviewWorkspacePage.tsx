import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, ChevronLeft, Download, EyeOff } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { AutosaveIndicator } from '@/components/Autosave'
import { Badge, JournalBadge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { ConfirmDialog } from '@/components/Dialog'
import { DueChip } from '@/components/Due'
import { DescriptionList, FormField } from '@/components/Form'
import { ErrorState, Skeleton } from '@/components/States'
import { toast } from '@/components/Toasts'
import { DocPreview, FileRow } from '@/components/Viewers'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import { formatDate } from '@/shared/formatters'
import { getReviewWorkspace, saveReviewDraft, submitReview } from '@/mock/api/reviews'
import { RECOMMENDATIONS, SCORE_CRITERIA, type ReviewRecord } from '@/mock/data/editorial'
import { ReviewReport } from './ReviewReport'
import { SubjectTags, useAccess } from './shared'

const score = (label: string) => z.number({ error: `Rate ${label} from 1 to 5.` }).int().min(1, `Rate ${label} from 1 to 5.`).max(5)
const schema = z.object({
  originality: score('originality'),
  methodology: score('methodology'),
  clarity: score('clarity'),
  significance: score('significance'),
  references: score('references'),
  commentsToAuthor: z.string().trim().min(50, 'Write at least 50 characters so the author can act on your feedback.').max(5000, 'Keep comments under 5,000 characters.'),
  commentsToEditor: z.string().trim().max(3000, 'Keep the reviewer justification under 3,000 characters.'),
  recommendation: z.enum(['accept', 'minor_revision', 'major_revision', 'reject'], { error: 'Choose a recommendation.' }),
})
type FormValues = z.infer<typeof schema>

export function ReviewWorkspacePage() {
  const { paperId = '' } = useParams()
  const ctx = useAccess('myReviews')
  const q = useAsync(() => getReviewWorkspace(paperId, ctx.userId, ctx.journals), [paperId, ctx])
  const crumbs = [{ label: paperId }]

  if (q.error) {
    return (
      <>
        <PageHeader title="Review workspace" crumbs={crumbs} />
        <div className="card">
          <ErrorState message={q.error.message} onRetry={q.error.message.includes('not assigned') ? undefined : q.reload} />
          <div className="pb-6 text-center"><Link to="/my-reviews" className="btn-secondary"><ChevronLeft size={14} aria-hidden /> Back to my reviews</Link></div>
        </div>
      </>
    )
  }
  if (!q.data) {
    return (
      <>
        <PageHeader title="Review workspace" crumbs={crumbs} />
        <div className="space-y-4" aria-busy="true" aria-label="Loading review workspace">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
        </div>
      </>
    )
  }
  return <Workspace key={paperId} ws={q.data} userId={ctx.userId} />
}

type WS = Awaited<ReturnType<typeof getReviewWorkspace>>

function Workspace({ ws, userId }: { ws: WS; userId: string }) {
  const [record, setRecord] = useState<ReviewRecord>()
  const [pending, setPending] = useState<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const done = record ?? (ws.status !== 'under_review' ? ws.submitted : undefined)

  return (
    <>
      <PageHeader title="Review workspace" crumbs={[{ label: ws.paperId }]}
        actions={<Link to="/my-reviews" className="btn-secondary"><ChevronLeft size={14} aria-hidden /> My reviews</Link>} />

      <section aria-label="Paper summary" className="card mb-6 p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="whitespace-nowrap text-base font-semibold">{ws.paperId}</span>
          <JournalBadge code={ws.journal} />
          <Badge>{ws.articleType}</Badge>
          {ws.reviewerKind === 'panel' && <Badge tone="accent">Review Panel</Badge>}
          {!done && <DueChip value={ws.reviewDue} />}
        </div>
        <h2 className="mt-2 max-w-4xl text-lg font-semibold leading-7">{ws.title}</h2>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted"><EyeOff size={14} strokeWidth={1.5} aria-hidden /> Author names, emails and affiliations are hidden from reviewers.</p>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <SectionCard title="Abstract">
            <p className="text-sm leading-6">{ws.abstract}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{ws.keywords.map((k) => <Badge key={k}>{k}</Badge>)}</div>
          </SectionCard>
          <SectionCard title="Manuscript">
            {ws.manuscript && (
              <FileRow name={ws.manuscript.name} meta={`Word · ${ws.manuscript.sizeKb} KB · ${ws.wordCount.toLocaleString('en-IN')} words`}
                action={<button className="btn-ghost !h-8 !px-2" aria-label="Download manuscript" onClick={() => toast.success(`${ws.manuscript?.name} downloaded`)}><Download size={15} strokeWidth={1.5} /></button>} />
            )}
            <div className="mt-3 rounded-lg bg-slate-100 p-4"><DocPreview title={ws.title} lines={18} className="mx-auto max-w-md" /></div>
          </SectionCard>
          <SectionCard title="Paper details">
            <DescriptionList items={[
              { label: 'Submitted', value: formatDate(ws.submittedAt) },
              { label: 'Review due', value: ws.reviewDue ? formatDate(ws.reviewDue) : '—' },
              { label: 'Subject areas', value: <SubjectTags subjects={ws.subjects} /> },
            ]} />
          </SectionCard>
        </div>

        <div>
          {done ? (
            <div className="space-y-4">
              <div role="status" className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <CheckCircle2 size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-green-600" aria-hidden />
                <div>
                  <p className="font-semibold text-green-800">{record ? 'Review submitted — thank you' : 'You have submitted your review'}</p>
                  <p className="text-sm text-green-800/80">{record ? 'The Editor has been notified and the paper is now awaiting a decision. ' : ''}Submitted on {formatDate(done.submittedAt)}. A PDF copy is shown below.</p>
                </div>
              </div>
              <ReviewReport review={done} paperTitle={ws.title} />
            </div>
          ) : ws.status !== 'under_review' ? (
            <div className="card"><ErrorState message="This paper is no longer waiting for your review." /></div>
          ) : (
            <ReviewForm ws={ws} userId={userId} submitting={submitting} onRequestSubmit={setPending} />
          )}
        </div>
      </div>

      <ConfirmDialog open={!!pending} onClose={() => setPending(undefined)} title="Submit your review?" confirmLabel={submitting ? 'Submitting…' : 'Submit review'}
        consequences={['Your scores, recommendation and comments are sent to the Editor and cannot be edited afterwards.', 'The paper moves to “Decision pending”.', 'Your comments to the author may be shared with them; confidential comments to the editor are not.']}
        onConfirm={async () => {
          if (!pending) return
          setSubmitting(true)
          try {
            const { originality, methodology, clarity, significance, references, ...rest } = pending
            const rec = await submitReview(ws.paperId, userId, { scores: { originality, methodology, clarity, significance, references }, ...rest })
            setRecord(rec)
            toast.success('Review submitted. The Editor has been notified.')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not submit the review.')
          } finally {
            setSubmitting(false)
            setPending(undefined)
          }
        }} />
    </>
  )
}

function ReviewForm({ ws, userId, submitting, onRequestSubmit }: { ws: WS; userId: string; submitting: boolean; onRequestSubmit: (v: FormValues) => void }) {
  const defaults = useMemo(() => ({
    ...ws.draft?.scores, commentsToAuthor: ws.draft?.commentsToAuthor ?? '', commentsToEditor: ws.draft?.commentsToEditor ?? '', recommendation: ws.draft?.recommendation,
  }), [ws.draft])
  const { control, register, handleSubmit, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema), defaultValues: defaults, mode: 'onTouched',
  })
  const values = useWatch({ control })
  const snapshot = JSON.stringify(values)

  // Debounced draft autosave, only after the reviewer has changed something.
  useEffect(() => {
    if (!isDirty) return
    const t = setTimeout(() => {
      const { commentsToAuthor, commentsToEditor, recommendation, ...scores } = JSON.parse(snapshot) as FormValues
      saveReviewDraft(ws.paperId, userId, { scores, commentsToAuthor: commentsToAuthor ?? '', commentsToEditor: commentsToEditor ?? '', recommendation })
    }, 700)
    return () => clearTimeout(t)
  }, [snapshot, isDirty, ws.paperId, userId])

  useUnsavedChanges(isDirty && !submitting, 'Your draft is saved, but the review has not been submitted. Leave this page anyway?')

  const hasPreviousRound = !!ws.submitted
  return (
    <form onSubmit={handleSubmit(onRequestSubmit)} noValidate className="card" aria-label="Structured review form">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[16px] font-semibold">Your review</h2>
        <AutosaveIndicator watch={snapshot} />
      </header>
      <div className="space-y-6 p-4">
        {hasPreviousRound && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 ring-1 ring-inset ring-blue-200">This paper was revised after your previous report. Please review the new version.</p>}
        {ws.draft && !isDirty && <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">Draft restored from {formatDate(ws.draft.savedAt)}.</p>}

        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Scores</legend>
          <p className="mb-3 text-xs text-muted">1 = very weak, 5 = excellent.</p>
          <div className="space-y-4">
            {SCORE_CRITERIA.map((c) => (
              <Controller key={c.key} control={control} name={c.key} render={({ field }) => (
                <div role="radiogroup" aria-labelledby={`lbl-${c.key}`} aria-invalid={!!errors[c.key]}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p id={`lbl-${c.key}`} className="text-sm font-medium">{c.label} <span className="text-red-600" aria-hidden>*</span></p><p className="text-xs text-muted">{c.hint}</p></div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label key={n} className={cn('flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2',
                          field.value === n ? 'border-accent bg-accent text-white' : 'border-line bg-surface hover:bg-subtle')}>
                          <input type="radio" className="sr-only" name={field.name} value={n} checked={field.value === n} onChange={() => field.onChange(n)} onBlur={field.onBlur} aria-label={`${c.label}: ${n} out of 5`} />
                          {n}
                        </label>
                      ))}
                    </div>
                  </div>
                  {errors[c.key] && <p role="alert" className="mt-1 text-xs text-red-600">{errors[c.key]?.message}</p>}
                </div>
              )} />
            ))}
          </div>
        </fieldset>

        <FormField label="Comments to the author" required error={errors.commentsToAuthor?.message} hint="Shared with the author. Be specific and constructive.">
          {(a) => <textarea {...a} {...register('commentsToAuthor')} rows={8} className="input !h-auto py-2" placeholder="Summarise the contribution, then list the strengths and the points that must be addressed." />}
        </FormField>
        <FormField label="Reviewer Justification" error={errors.commentsToEditor?.message} hint="Explain the reasons behind your recommendation. It appears in the review report.">
          {(a) => <textarea {...a} {...register('commentsToEditor')} rows={4} className="input !h-auto py-2" />}
        </FormField>

        <Controller control={control} name="recommendation" render={({ field }) => (
          <fieldset aria-describedby={errors.recommendation ? 'rec-err' : undefined}>
            <legend className="mb-2 text-sm font-semibold">Recommendation <span className="text-red-600" aria-hidden>*</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {RECOMMENDATIONS.map((r) => (
                <label key={r.value} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2', field.value === r.value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-page')}>
                  <input type="radio" className="accent-indigo-600" name={field.name} value={r.value} checked={field.value === r.value} onChange={() => field.onChange(r.value)} onBlur={field.onBlur} />
                  {r.label}
                </label>
              ))}
            </div>
            {errors.recommendation && <p id="rec-err" role="alert" className="mt-1 text-xs text-red-600">{errors.recommendation.message}</p>}
          </fieldset>
        )} />
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <p className="text-xs text-muted">Your draft is saved as you type. Nothing is sent until you submit.</p>
        <button type="submit" className="btn-primary" disabled={submitting}>Review and submit</button>
      </footer>
    </form>
  )
}
