import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, History, Search } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { DataTable, type Column } from '@/components/DataTable'
import { DescriptionList, FormField } from '@/components/Form'
import { EmptyState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { ConfirmDialog } from '@/components/Dialog'
import { RelativeTime } from '@/components/Time'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { backdatedId } from '@/shared/paperId'
import { formatDate } from '@/shared/formatters'
import type { Paper } from '@/shared/types'
import { listBackdated, listPastIssues, nextBackdatedSeq, searchBackdatable, submitBackdated, type BackdateMatch } from '@/mock/api/production'
import type { BackdatedItem } from '@/mock/data/production'
import { useProductionStore } from '@/mock/stores/production'
import { IssueVsOnline } from './shared'
import { BackdatedProductionView } from './BackdatedProductionView'

const STEPS = ['Find article', 'Edit details', 'Re-accept', 'Issue & ID', 'Move to production'] as const
const ARTICLE_TYPES = ['Research article', 'Review article', 'Case study', 'Short communication']

/** Editor and Super Admin run the full wizard; the Associate Editor only completes the production step. */
export function BackdatedPage() {
  const perm = usePermission('backdated')
  return perm.can('approve') ? <BackdatedWizard /> : <BackdatedProductionView />
}

function BackdatedWizard() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const perm = usePermission('backdated')
  const [step, setStep] = useState(0)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [paper, setPaper] = useState<Paper | null>(null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [articleType, setArticleType] = useState(ARTICLE_TYPES[0])
  const [accepted, setAccepted] = useState(false)
  const [note, setNote] = useState('')
  const [issueId, setIssueId] = useState('')
  const [generate, setGenerate] = useState(true)
  const [touched, setTouched] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<BackdatedItem | null>(null)
  const seqTick = useProductionStore((s) => s.backdatedSeq)
  const history = useProductionStore((s) => s.backdated)

  useEffect(() => { const t = setTimeout(() => setDebounced(query), 300); return () => clearTimeout(t) }, [query])
  const search = useAsync(() => searchBackdatable(debounced, journals), [debounced, journals.join(',')])
  const prior = useAsync(() => listBackdated(journals), [journals.join(','), history.map((h) => h.id + h.status).join()])
  const dirty = !done && (!!paper && step > 0)
  useUnsavedChanges(dirty)

  const pastIssues = useMemo(() => (paper ? listPastIssues(paper.journal) : []), [paper])
  const issue = pastIssues.find((i) => i.id === issueId)
  const seq = paper ? nextBackdatedSeq(paper.journal) : 100
  const newId = paper && issue ? backdatedId(paper.journal, issue.volume, issue.number, seq) : undefined
  void seqTick

  const choose = (m: BackdateMatch) => {
    if (!m.eligible) return
    const p = m.paper
    setPaper(p); setTitle(p.title); setAuthor(p.author); setArticleType(p.articleType)
    setGenerate(p.status === 'rejected'); setIssueId(''); setAccepted(false); setNote('')
  }

  const errors = {
    title: title.trim().length < 10 ? 'Enter the full title (at least 10 characters).' : undefined,
    author: author.trim().length < 3 ? 'Enter the corresponding author’s name.' : undefined,
    note: !accepted ? 'Confirm the re-acceptance.' : note.trim().length < 10 ? 'Record why the paper is being re-accepted (at least 10 characters).' : undefined,
    issue: !issue ? 'Choose a past issue.' : undefined,
  }
  const canNext = [!!paper, !errors.title && !errors.author, !errors.note, !errors.issue, true][step]

  const next = () => { setTouched(true); if (canNext) { setTouched(false); setStep((s) => s + 1) } }
  const submit = async () => {
    if (!paper) return
    setBusy(true)
    try {
      const item = await submitBackdated({ paperId: paper.id, title, author, articleType, acceptNote: note, issueId, generateId: generate })
      setDone(item)
      toast.success(`${item.finalId} moved to production.`)
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const restart = () => { setDone(null); setStep(0); setPaper(null); setQuery(''); setDebounced(''); setTouched(false); search.reload() }

  const columns: Column<BackdatedItem>[] = [
    { id: 'id', header: 'Article ID', locked: true, cell: (r) => <div><span className="whitespace-nowrap font-medium">{r.finalId}</span>{r.generatedId && <p className="whitespace-nowrap text-xs text-muted">was {r.originalId}</p>}</div>, sort: (r) => r.finalId },
    { id: 'title', header: 'Title', cell: (r) => <p className="line-clamp-2 max-w-[360px] text-sm" title={r.title}>{r.title}</p> },
    ...(all ? [{ id: 'journal', header: 'Journal', cell: (r: BackdatedItem) => <JournalBadge code={r.journal} /> } as Column<BackdatedItem>] : []),
    { id: 'issue', header: 'Issue (date)', cell: (r) => <span className="whitespace-nowrap">{r.issueLabel} · {formatDate(r.issueDate)}</span>, sort: (r) => r.issueDate },
    { id: 'was', header: 'Was', cell: (r) => r.originalStatus, defaultHidden: true },
    { id: 'by', header: 'By', cell: (r) => r.createdBy },
    { id: 'at', header: 'Created', cell: (r) => <RelativeTime value={r.createdAt} />, sort: (r) => r.createdAt },
    { id: 'status', header: 'Status', cell: (r) => (r.status === 'published' ? <Badge tone="success">Published</Badge> : r.status === 'in_production' ? <Badge tone="info">In production</Badge> : <Badge tone="accent">In final approval</Badge>) },
  ]

  return (
    <>
      <PageHeader title="Backdated publication" description="Publish an older or previously rejected article into a past issue. The issue date stays in the past; the real online date is always recorded." />

      {done ? (
        <div className="card p-6" role="status">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={24} className="mt-0.5 shrink-0 text-green-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Moved to production</h2>
              <p className="mt-1 text-sm text-muted"><span className="font-medium text-ink">{done.finalId}</span>{done.generatedId && <> (generated; the original ID {done.originalId} was unavailable)</>} is now in production for {done.issueLabel}. {done.unassigned ? 'No Associate Editor is assigned to this journal yet, so it is unassigned: assign one in User Management.' : 'It is assigned to the journal’s Associate Editor, who completes production and sends it for final approval.'}</p>
              <div className="mt-4 max-w-xl"><IssueVsOnline issueDate={done.issueDate} /></div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to={`/production/${done.finalId}`} className="btn-primary">Open production workspace <ArrowRight size={14} aria-hidden /></Link>
                <button className="btn-secondary" onClick={restart}>Backdate another article</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <section aria-label="Backdated publication wizard" className="card">
          <ol className="grid grid-cols-5 gap-1 border-b border-line p-3" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === step ? 'step' : undefined} className="min-w-0">
                <div className={cn('h-1 rounded-full', i <= step ? 'bg-accent' : 'bg-slate-200')} />
                <p className={cn('mt-1.5 flex items-center gap-1 truncate text-xs', i === step ? 'font-semibold text-ink' : 'text-muted')}>
                  {i < step ? <Check size={12} className="text-accent" aria-hidden /> : <span className="tabular-nums">{i + 1}.</span>}<span className="truncate">{s}</span>
                </p>
              </li>
            ))}
          </ol>
          <div className="p-5">
            {step === 0 && (
              <div className="max-w-2xl space-y-4">
                <FormField label="Paper ID or title" hint="Search unpublished and rejected papers in your journals, e.g. a Paper ID such as JIMRT2026000113. Rejected papers are suggested below.">
                  {(a) => (
                    <div className="relative">
                      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
                      <input {...a} className="input !pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" autoFocus />
                    </div>
                  )}
                </FormField>
                <div aria-live="polite">
                  {search.loading ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
                    : (search.data ?? []).length === 0 ? <EmptyState icon={Search} title="No matching paper" hint="Check the Paper ID, or switch to the journal it belongs to." />
                    : (
                      <>
                        <p className="mb-2 text-xs font-medium text-muted">{debounced.trim().length < 3 ? 'Suggested: rejected papers' : `${search.data?.length} result(s)`}</p>
                        <ul className="space-y-2">
                          {(search.data ?? []).map((m) => {
                            const sel = paper?.id === m.paper.id
                            return (
                              <li key={m.paper.id}>
                                <button type="button" disabled={!m.eligible} aria-pressed={sel} onClick={() => choose(m)}
                                  className={cn('flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors', sel ? 'border-accent bg-indigo-50' : 'border-line hover:bg-subtle', !m.eligible && 'cursor-not-allowed opacity-60 hover:bg-transparent')}>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2"><span className="whitespace-nowrap font-medium">{m.paper.id}</span><JournalBadge code={m.paper.journal} /><StatusBadge status={m.paper.status} /></div>
                                    <p className="mt-0.5 line-clamp-2 text-sm text-muted" title={m.paper.title}>{m.paper.title}</p>
                                    {!m.eligible && <p className="mt-1 text-xs text-amber-800">{m.reason}</p>}
                                  </div>
                                  {sel && <Check size={18} className="mt-1 text-accent" aria-label="Selected" />}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </>
                    )}
                </div>
              </div>
            )}

            {step === 1 && paper && (
              <div className="max-w-2xl space-y-4">
                <p className="text-sm text-muted">Correct anything that was wrong in the original submission. Changes are written to the paper’s history.</p>
                <FormField label="Title" required error={touched ? errors.title : undefined}>{(a) => <textarea {...a} rows={2} className="input !h-auto py-2" value={title} onChange={(e) => setTitle(e.target.value)} />}</FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Corresponding author" required error={touched ? errors.author : undefined}>{(a) => <input {...a} className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />}</FormField>
                  <FormField label="Article type" required>{(a) => <select {...a} className="input" value={articleType} onChange={(e) => setArticleType(e.target.value)}>{ARTICLE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>}</FormField>
                </div>
              </div>
            )}

            {step === 2 && paper && (
              <div className="max-w-2xl space-y-4">
                <p className="text-sm text-muted">This paper is currently <span className="font-medium text-ink">{paper.status.replace(/_/g, ' ')}</span>. Re-accepting records the Editor’s decision to publish it despite its earlier outcome.</p>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                  <span>I re-accept <span className="font-medium">{paper.id}</span> for publication and confirm that any publication charges have been settled or waived.</span>
                </label>
                <FormField label="Reason for re-acceptance" required error={touched ? errors.note : undefined} hint="Stored on the paper timeline and audit log.">
                  {(a) => <textarea {...a} rows={4} className="input !h-auto py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rejection was issued in error; reviewers’ concerns were resolved in the revised file." />}
                </FormField>
              </div>
            )}

            {step === 3 && paper && (
              <div className="max-w-2xl space-y-4">
                <FormField label="Past issue" required error={touched ? errors.issue : undefined} hint="Only already-published issues of this journal are listed.">
                  {(a) => (
                    <select {...a} className="input" value={issueId} onChange={(e) => setIssueId(e.target.value)}>
                      <option value="">Select an issue…</option>
                      {pastIssues.map((i) => <option key={i.id} value={i.id}>{i.label} · {formatDate(i.publicationDate)}</option>)}
                    </select>
                  )}
                </FormField>
                {issue && <IssueVsOnline issueDate={issue.publicationDate} />}
                <fieldset className="space-y-2">
                  <legend className="label">Article ID</legend>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-sm">
                    <input type="radio" name="idmode" className="mt-0.5 accent-indigo-600" checked={!generate} onChange={() => setGenerate(false)} />
                    <span><span className="font-medium">Keep the original ID</span><span className="block font-mono text-xs text-muted">{paper.id}</span></span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-sm">
                    <input type="radio" name="idmode" className="mt-0.5 accent-indigo-600" checked={generate} onChange={() => setGenerate(true)} />
                    <span><span className="font-medium">Original ID is unavailable: generate a new one</span>
                      <span className="block text-xs text-muted">Next number in the {paper.journal} backdated sequence: <span className="tabular-nums">{seq}</span></span>
                      <span className="mt-1 block font-mono text-sm text-ink">{newId ?? `${paper.journal}.V?I?.${seq}`}</span></span>
                  </label>
                </fieldset>
              </div>
            )}

            {step === 4 && paper && issue && (
              <div className="max-w-2xl space-y-4">
                <DescriptionList items={[
                  { label: 'Original paper', value: <span className="whitespace-nowrap">{paper.id}</span> },
                  { label: 'Article ID after backdating', value: <span className="font-mono">{generate ? newId : paper.id}</span> },
                  { label: 'Title', value: title },
                  { label: 'Corresponding author', value: author },
                  { label: 'Past issue', value: `${issue.label} (${formatDate(issue.publicationDate)})` },
                  { label: 'Re-acceptance reason', value: note },
                ]} />
                <IssueVsOnline issueDate={issue.publicationDate} />
                <p className="text-sm text-muted">The article moves to <span className="font-medium text-ink">In production</span> and is assigned to the journal’s Associate Editor. When production is complete it goes to Final approval, where an Editor publishes it.</p>
              </div>
            )}
          </div>
          <footer className="flex items-center justify-between border-t border-line px-5 py-3">
            <button className="btn-secondary" disabled={step === 0} onClick={() => { setTouched(false); setStep((s) => s - 1) }}><ArrowLeft size={14} aria-hidden /> Back</button>
            {step < 4 ? (
              <button className="btn-primary" disabled={step === 0 && !paper} onClick={next}>Continue <ArrowRight size={14} aria-hidden /></button>
            ) : (
              <GuardedButton allowed={perm.can('approve')} why={perm.why('approve')} className="btn-primary" disabled={busy} onClick={() => setConfirm(true)}><History size={14} aria-hidden /> Move to production</GuardedButton>
            )}
          </footer>
        </section>
      )}

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={submit} title="Move backdated article to production?" confirmLabel="Move to production"
        consequences={[
          paper ? `Re-accept ${paper.id} and edit its details as entered.` : 'Re-accept the paper.',
          generate ? `Assign the new ID ${newId ?? ''} and consume number ${seq} of the ${paper?.journal ?? ''} backdated sequence.` : 'Keep the original ID.',
          `Place it in ${issue?.label ?? 'the chosen issue'} with the issue date ${issue ? formatDate(issue.publicationDate) : ''}; the actual online date will be today.`,
          'Move it to In production and assign it to the journal’s Associate Editor (or leave it unassigned if the journal has none). Nothing is published until an Editor approves it in Final approval.',
        ]} />

      <div className="mt-8">
        <h2 className="mb-3 text-[16px] font-semibold">Previous backdated items</h2>
        <DataTable<BackdatedItem>
          id="backdated-history" data={prior.data ?? []} columns={columns} rowKey={(r) => r.id} loading={prior.loading} error={!!prior.error} onRetry={prior.reload}
          search={{ placeholder: 'Search backdated items', text: (r) => `${r.finalId} ${r.originalId} ${r.title}` }}
          empty={{ icon: History, title: 'Nothing has been backdated yet', hint: 'Use the wizard above to place an article into a past issue.' }}
        />
      </div>
    </>
  )
}
