import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, CheckCircle2, FileSearch, History, Inbox } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { DataTable, type Column } from '@/components/DataTable'
import { FormField } from '@/components/Form'
import { RelativeTime } from '@/components/Time'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { formatDate } from '@/shared/formatters'
import type { Issue, JournalCode, Paper } from '@/shared/types'
import { listBackdated, listBackdatedCandidates, listPastIssues, listSubmittedUnderIssue, type BackdatedSubmitResult } from '@/mock/api/production'
import type { BackdatedItem } from '@/mock/data/production'
import { useDataStore } from '@/mock/store'
import { useProductionStore } from '@/mock/stores/production'
import { IssueVsOnline } from './shared'
import { BackdatedProductionView } from './BackdatedProductionView'
import { SubmissionForm } from './backdated/SubmissionForm'

/** Editor ('manage') runs the full workflow; the Associate Editor ('work') only completes the production step. */
export function BackdatedPage() {
  const perm = usePermission('backdated')
  return perm.can('manage') ? <BackdatedEditor /> : <BackdatedProductionView />
}

function BackdatedEditor() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const [journalPick, setJournalPick] = useState('')
  const journal: JournalCode = (journals.includes(journalPick as JournalCode) ? journalPick : journals[0]) as JournalCode
  const issues = useDataStore((s) => s.issues)
  const papers = useDataStore((s) => s.papers)
  const history = useProductionStore((s) => s.backdated)
  const [volume, setVolume] = useState('')
  const [issueId, setIssueId] = useState('')
  const [paper, setPaper] = useState<Paper | null>(null)
  const [done, setDone] = useState<BackdatedSubmitResult | null>(null)

  const past = useMemo(() => { void issues; return journal ? listPastIssues(journal) : [] }, [journal, issues])
  const volumes = useMemo(() => [...new Set(past.map((i) => i.volume))].sort((a, b) => b - a), [past])
  const volumeIssues = useMemo(() => past.filter((i) => String(i.volume) === volume).sort((a, b) => a.number - b.number), [past, volume])
  const issue: Issue | undefined = past.find((i) => i.id === issueId)

  const candidates = useAsync(() => (issue && journal ? listBackdatedCandidates(journal) : Promise.resolve([])), [issue?.id, journal, papers])
  const submitted = useAsync(() => (issue ? listSubmittedUnderIssue(issue.id) : Promise.resolve([])), [issue?.id, papers])
  const prior = useAsync(() => listBackdated(journals), [journals.join(','), history.map((h) => h.id + h.status).join()])
  const paperById = useMemo(() => new Map(papers.map((p) => [p.id, p])), [papers])

  const pickJournal = (v: string) => { setJournalPick(v); setVolume(''); setIssueId(''); setPaper(null); setDone(null) }
  const pickVolume = (v: string) => { setVolume(v); setIssueId(''); setPaper(null); setDone(null) }
  const pickIssue = (v: string) => { setIssueId(v); setPaper(null); setDone(null) }

  const candidateCols: Column<{ paper: Paper }>[] = [
    { id: 'id', header: 'Paper ID', locked: true, sort: (r) => r.paper.id, cell: (r) => <span className="whitespace-nowrap font-medium">{r.paper.id}</span> },
    { id: 'title', header: 'Title', cell: (r) => <p className="line-clamp-2 max-w-[380px] text-sm" title={r.paper.title}>{r.paper.title}</p> },
    { id: 'author', header: 'Author', sort: (r) => r.paper.author, cell: (r) => <span className="whitespace-nowrap">{r.paper.author}</span> },
    { id: 'status', header: 'Status', sort: (r) => r.paper.status, cell: (r) => <StatusBadge status={r.paper.status} /> },
    { id: 'submitted', header: 'Submitted', sort: (r) => r.paper.submittedAt, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.paper.submittedAt)}</span> },
    { id: 'select', header: '', locked: true, cell: (r) => <button type="button" className="btn-secondary !h-8 whitespace-nowrap" aria-label={`Select ${r.paper.id}`} onClick={() => { setDone(null); setPaper(r.paper) }}>Select <ArrowRight size={13} aria-hidden /></button> },
  ]

  const submittedCols: Column<Paper>[] = [
    { id: 'id', header: 'Paper ID', locked: true, sort: (r) => r.id, cell: (r) => <Link to={`/submissions/${encodeURIComponent(r.id)}`} className="whitespace-nowrap font-medium text-accent hover:underline">{r.id}</Link> },
    { id: 'title', header: 'Title', cell: (r) => <p className="line-clamp-2 max-w-[380px] text-sm" title={r.title}>{r.title}</p> },
    { id: 'author', header: 'Author', cell: (r) => <span className="whitespace-nowrap">{r.author}</span> },
    { id: 'status', header: 'Status', sort: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    { id: 'updated', header: 'Last update', sort: (r) => r.updatedAt, cell: (r) => <RelativeTime value={r.updatedAt} /> },
    { id: 'open', header: '', cell: (r) => <Link to={`/submissions/${encodeURIComponent(r.id)}`} className="inline-flex items-center gap-1 whitespace-nowrap text-accent hover:underline">{r.status === 'submitted' ? 'Review and accept' : 'Open'} <ArrowRight size={13} aria-hidden /></Link> },
  ]

  const historyCols: Column<BackdatedItem>[] = [
    { id: 'id', header: 'Article ID', locked: true, cell: (r) => <div><span className="whitespace-nowrap font-medium">{r.finalId}</span>{r.generatedId && <p className="whitespace-nowrap text-xs text-muted">was {r.originalId}</p>}</div>, sort: (r) => r.finalId },
    { id: 'title', header: 'Title', cell: (r) => <p className="line-clamp-2 max-w-[360px] text-sm" title={r.title}>{r.title}</p> },
    ...(all ? [{ id: 'journal', header: 'Journal', cell: (r: BackdatedItem) => <JournalBadge code={r.journal} /> } as Column<BackdatedItem>] : []),
    { id: 'issue', header: 'Issue (date)', cell: (r) => <span className="whitespace-nowrap">{r.issueLabel} · {formatDate(r.issueDate)}</span>, sort: (r) => r.issueDate },
    { id: 'was', header: 'Was', cell: (r) => r.originalStatus, defaultHidden: true },
    { id: 'by', header: 'By', cell: (r) => r.createdBy },
    { id: 'at', header: 'Created', cell: (r) => <RelativeTime value={r.createdAt} />, sort: (r) => r.createdAt },
    {
      id: 'status', header: 'Status', cell: (r) => {
        const p = paperById.get(r.finalId)
        if (p) return <StatusBadge status={p.status} />
        return r.status === 'published' ? <Badge tone="success">Published</Badge> : r.status === 'in_production' ? <Badge tone="info">In production</Badge> : <Badge tone="accent">In final approval</Badge>
      },
    },
  ]

  return (
    <>
      <PageHeader title="Backdated publication" description="Place a rejected or payment-pending article into a past issue. Choose the volume and issue, re-edit the full submission, then submit it for the Editor to accept again." />

      <section className="card p-5" aria-label="Choose volume and issue">
        <h2 className="text-[15px] font-semibold">1. Choose the volume and issue</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {journals.length > 1 && (
            <FormField label="Journal" required>
              {(a) => <select {...a} className="input" value={journal} onChange={(e) => pickJournal(e.target.value)}>{journals.map((j) => <option key={j} value={j}>{j}</option>)}</select>}
            </FormField>
          )}
          <FormField label="Volume" required>
            {(a) => (
              <select {...a} className="input" value={volume} onChange={(e) => pickVolume(e.target.value)}>
                <option value="">Select a volume…</option>
                {volumes.map((v) => <option key={v} value={v}>Volume {v}</option>)}
              </select>
            )}
          </FormField>
          <FormField label="Issue" required>
            {(a) => (
              <select {...a} className="input" value={issueId} onChange={(e) => pickIssue(e.target.value)} disabled={!volume}>
                <option value="">{volume ? 'Select an issue…' : 'Choose a volume first'}</option>
                {volumeIssues.map((i) => <option key={i.id} value={i.id}>Issue {i.number}</option>)}
              </select>
            )}
          </FormField>
          <div>
            <span className="label">Issue publication date</span>
            <p className="flex h-10 items-center gap-2 text-sm"><CalendarDays size={16} className="text-muted" aria-hidden />{issue ? <span className="font-medium">{formatDate(issue.publicationDate)}</span> : <span className="text-muted">Shown once an issue is chosen</span>}</p>
          </div>
        </div>
        {volumes.length === 0 && <p className="mt-3 text-sm text-muted">{journal ?? 'This journal'} has no published issues yet, so there is nothing to backdate into.</p>}
      </section>

      {issue && done && (
        <div className="card mt-5 p-6" role="status">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={24} className="mt-0.5 shrink-0 text-green-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Submitted under {issue.label}</h2>
              <p className="mt-1 text-sm text-muted">
                <span className="font-medium text-ink">{done.item.finalId}</span>{done.item.generatedId && <> (generated; the original ID {done.item.originalId} was unavailable)</>} is now <span className="font-medium text-ink">Submitted</span> and listed below.
                {done.newManuscriptVersion ? ` The new manuscript was saved as version ${done.newManuscriptVersion}.` : ''} Open it and accept it again to send it through payment and production.
              </p>
              <div className="mt-4 max-w-xl"><IssueVsOnline issueDate={done.item.issueDate} /></div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to={`/submissions/${encodeURIComponent(done.item.finalId)}`} className="btn-primary">Open manuscript to accept <ArrowRight size={14} aria-hidden /></Link>
                <button type="button" className="btn-secondary" onClick={() => { setDone(null); setPaper(null) }}>Backdate another article</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {issue && !done && !paper && (
        <section className="mt-5" aria-label="Select an article">
          <h2 className="mb-1 text-[15px] font-semibold">2. Select the article</h2>
          <p className="mb-3 text-sm text-muted">Rejected and payment-pending articles of {journal}. Select a Paper ID to open its full submission form.</p>
          <DataTable<{ paper: Paper }>
            id="backdated-candidates" data={candidates.data ?? []} columns={candidateCols} rowKey={(r) => r.paper.id} loading={candidates.loading && !candidates.data} error={!!candidates.error} onRetry={candidates.reload}
            onRowClick={(r) => { setDone(null); setPaper(r.paper) }}
            search={{ placeholder: 'Search by Paper ID, title or author', text: (r) => `${r.paper.id} ${r.paper.title} ${r.paper.author}` }}
            empty={{ icon: FileSearch, title: 'No rejected or payment-pending articles', hint: `Nothing in ${journal} is waiting to be backdated, or no row matches your search.` }}
          />
        </section>
      )}

      {issue && !done && paper && (
        <section className="mt-5" aria-label="Edit the submission">
          <h2 className="mb-1 text-[15px] font-semibold">3. Re-edit the submission</h2>
          <p className="mb-3 text-sm text-muted">Review everything the author provided and correct it. Nothing changes until you submit at the last step.</p>
          <SubmissionForm key={paper.id + issue.id} paper={paper} issue={issue} onCancel={() => setPaper(null)} onDone={(r) => { setDone(r); setPaper(null) }} />
        </section>
      )}

      {issue && (
        <section className="mt-8" aria-label={`Submitted under ${issue.label}`}>
          <h2 className="mb-3 text-[16px] font-semibold">Submitted under {issue.label}</h2>
          <DataTable<Paper>
            id="backdated-submitted" data={submitted.data ?? []} columns={submittedCols} rowKey={(r) => r.id} loading={submitted.loading && !submitted.data} error={!!submitted.error} onRetry={submitted.reload}
            search={{ placeholder: 'Search by Paper ID or title', text: (r) => `${r.id} ${r.title} ${r.author}` }}
            empty={{ icon: Inbox, title: `Nothing submitted under ${issue.label} yet`, hint: 'Articles you submit above appear here, with their current status, so you can review and accept them again.' }}
          />
        </section>
      )}

      <section className="mt-8" aria-label="Previous backdated items">
        <h2 className="mb-3 text-[16px] font-semibold">Previous backdated items</h2>
        <DataTable<BackdatedItem>
          id="backdated-history" data={prior.data ?? []} columns={historyCols} rowKey={(r) => r.id} loading={prior.loading && !prior.data} error={!!prior.error} onRetry={prior.reload}
          search={{ placeholder: 'Search backdated items', text: (r) => `${r.finalId} ${r.originalId} ${r.title}` }}
          empty={{ icon: History, title: 'Nothing has been backdated yet', hint: 'Choose a volume and issue above to place an article into a past issue.' }}
        />
      </section>
    </>
  )
}
