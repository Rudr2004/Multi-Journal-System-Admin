import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, FileText, Percent, RefreshCw, SearchX } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { useAsync } from '@/lib/useAsync'
import { useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { Badge, JournalBadge } from '@/components/Badges'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { ErrorState } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { KpiCard } from '@/components/KpiCard'
import { SectionCard } from '@/components/Card'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { cn } from '@/lib/utils'
import { formatNumber, formatPercent, formatRelative } from '@/shared/formatters'
import { listScholarStatus, recheckScholar, type ScholarIssueRow, type ScholarRow } from '@/mock/api/scholar'

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-subtle">
        <div className={cn('h-full rounded-full', value >= 70 ? 'bg-green-600' : value >= 40 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${value}%` }} />
      </div>
      <span className="w-12 text-right text-sm tabular-nums">{formatPercent(value, 0)}</span>
    </div>
  )
}

export function ScholarPage() {
  const journals = useScopeJournals()
  const perm = usePermission('scholar')
  const canRecheck = perm.can('work')
  const { data, loading, error, reload } = useAsync(() => listScholarStatus(journals), [journals])
  const [journalF, setJournalF] = useState('')
  const [issueF, setIssueF] = useState('')
  const [statusF, setStatusF] = useState('')
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => (!journalF || r.journal === journalF) && (!issueF || r.issueId === issueF) && (!statusF || (statusF === 'indexed' ? r.indexed : !r.indexed))),
    [data, journalF, issueF, statusF],
  )
  const issueOptions = useMemo(
    () => (data?.issues ?? []).filter((i) => !journalF || i.journal === journalF).map((i) => ({ value: i.issueId, label: `${i.journal} · ${i.label}` })),
    [data, journalF],
  )

  const all = data?.rows ?? []
  const indexed = all.filter((r) => r.indexed).length
  const oldest = all.length ? all.reduce((a, b) => (a.lastChecked < b.lastChecked ? a : b)).lastChecked : undefined

  const recheck = async (ids: string[], clear?: () => void) => {
    if (ids.length === 0) return
    setBusy((b) => new Set([...b, ...ids]))
    try {
      const res = await recheckScholar(ids)
      toast.success(
        res.nowIndexed
          ? `Rechecked ${res.checked} article${res.checked > 1 ? 's' : ''}: ${res.nowIndexed} newly indexed${res.stillPending ? `, ${res.stillPending} still pending` : ''}.`
          : `Rechecked ${res.checked} article${res.checked > 1 ? 's' : ''}: none newly indexed. Google Scholar usually takes 2–4 weeks after publication.`,
      )
      clear?.()
      reload()
    } catch {
      toast.error('Google Scholar could not be reached. Try again in a moment.')
    } finally {
      setBusy((b) => { const n = new Set(b); ids.forEach((i) => n.delete(i)); return n })
    }
  }

  const columns: Column<ScholarRow>[] = [
    {
      id: 'article', header: 'Article', locked: true, sort: (r) => r.title,
      cell: (r) => (
        <div className="min-w-0">
          <Link to={`/submissions/${r.paperId}`} className="whitespace-nowrap font-medium text-accent hover:underline">{r.paperId}</Link>
          <p className="line-clamp-2 max-w-[440px] text-sm text-muted" title={r.title}>{r.title}</p>
        </div>
      ),
    },
    ...(journals.length > 1 ? [{ id: 'journal', header: 'Journal', sort: (r: ScholarRow) => r.journal, cell: (r: ScholarRow) => <JournalBadge code={r.journal} /> } as Column<ScholarRow>] : []),
    { id: 'issue', header: 'Issue', sort: (r) => r.issueLabel, cell: (r) => <span className="text-sm">{r.issueLabel}</span> },
    {
      id: 'status', header: 'Google Scholar', sort: (r) => (r.indexed ? 1 : 0),
      cell: (r) => r.indexed ? <Badge tone="success"><CheckCircle2 size={12} aria-hidden /> Indexed</Badge> : <Badge tone="warning"><Clock size={12} aria-hidden /> Not indexed</Badge>,
    },
    { id: 'checked', header: 'Last checked', sort: (r) => r.lastChecked, cell: (r) => <RelativeTime value={r.lastChecked} /> },
    {
      id: 'action', header: 'Action', align: 'right', mobileHide: false,
      cell: (r) => (
        <GuardedButton allowed={canRecheck} why={perm.why('work')} className="btn-secondary" disabled={busy.has(r.paperId)} onClick={() => recheck([r.paperId])} aria-label={`Recheck ${r.paperId}`}>
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden className={busy.has(r.paperId) ? 'animate-spin' : ''} /> {busy.has(r.paperId) ? 'Checking…' : 'Recheck'}
        </GuardedButton>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Google Scholar indexing"
        description="Which published articles Google Scholar has indexed, and when each was last checked."
        actions={
          <GuardedButton allowed={canRecheck} why={perm.why('work')} className="btn-primary" disabled={loading || busy.size > 0}
            onClick={() => recheck(rows.filter((r) => !r.indexed).map((r) => r.paperId))}>
            <RefreshCw size={15} strokeWidth={1.5} aria-hidden /> Recheck not indexed ({rows.filter((r) => !r.indexed).length})
          </GuardedButton>
        }
      />
      {error ? (
        <div className="card"><ErrorState message="Indexing status could not be loaded." onRetry={reload} /></div>
      ) : (
        <div className="space-y-5">
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Published articles" icon={FileText} loading={loading} value={formatNumber(all.length)} />
            <KpiCard label="Indexed" icon={CheckCircle2} loading={loading} value={formatNumber(indexed)} />
            <KpiCard label="Not indexed yet" icon={SearchX} loading={loading} value={formatNumber(all.length - indexed)} tone={all.length - indexed > 0 ? 'warning' : 'default'} />
            <KpiCard label="Indexing rate" icon={Percent} loading={loading} value={formatPercent(all.length ? (indexed / all.length) * 100 : 0)} hint={oldest ? `Oldest check ${formatRelative(oldest)}` : undefined} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Indexing rate by journal" flush>
              {loading ? <div className="p-4 text-sm text-muted" aria-busy="true">Loading…</div> : (
                <ul className="divide-y divide-line">
                  {(data?.journals ?? []).map((j) => (
                    <li key={j.journal} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 px-4 py-3">
                      <JournalBadge code={j.journal} />
                      <Bar value={j.rate} label={`${j.journal} indexing rate`} />
                      <span className="w-20 text-right text-xs text-muted tabular-nums">{j.indexed} of {j.total}</span>
                    </li>
                  ))}
                  {(data?.journals ?? []).length === 0 && <li className="p-4 text-sm text-muted">No journals in scope.</li>}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Indexing rate by issue" flush>
              <div className="max-h-[320px] overflow-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Indexing rate per issue</caption>
                  <thead className="sticky top-0 bg-surface text-xs text-muted">
                    <tr><th scope="col" className="px-4 py-2 text-left font-medium">Issue</th><th scope="col" className="px-4 py-2 text-left font-medium">Rate</th><th scope="col" className="px-4 py-2 text-right font-medium">Indexed</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {loading && <tr><td colSpan={3} className="p-4 text-muted">Loading…</td></tr>}
                    {!loading && (data?.issues ?? []).length === 0 && <tr><td colSpan={3} className="p-4 text-muted">No published issues with articles yet.</td></tr>}
                    {(data?.issues ?? []).map((i: ScholarIssueRow) => (
                      <tr key={i.issueId} className={cn('hover:bg-page', issueF === i.issueId && 'bg-accent-soft/40')}>
                        <th scope="row" className="px-4 py-2 text-left font-normal">
                          <button className="flex items-center gap-2 text-left hover:underline" title="Filter the article list to this issue" onClick={() => { setIssueF(issueF === i.issueId ? '' : i.issueId); setJournalF(journals.length > 1 ? i.journal : '') }}>
                            <JournalBadge code={i.journal} /> <span className="whitespace-nowrap">{i.label}</span>
                          </button>
                        </th>
                        <td className="min-w-[140px] px-4 py-2"><Bar value={i.rate} label={`${i.label} indexing rate`} /></td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-muted tabular-nums">{i.indexed} of {i.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          <DataTable<ScholarRow>
            id="scholar-articles"
            data={rows} columns={columns} rowKey={(r) => r.paperId} loading={loading} pageSize={10} selectable
            search={{ placeholder: 'Search articles', text: (r) => `${r.paperId} ${r.title} ${r.issueLabel}` }}
            filters={
              <>
                {journals.length > 1 && <SelectFilter label="Journal" value={journalF} onChange={(v) => { setJournalF(v); setIssueF('') }} options={journals.map((j) => ({ value: j, label: j }))} />}
                <SelectFilter label="Issue" value={issueF} onChange={setIssueF} options={issueOptions} />
                <SelectFilter label="Status" value={statusF} onChange={setStatusF} options={[{ value: 'indexed', label: 'Indexed' }, { value: 'not', label: 'Not indexed' }]} />
              </>
            }
            bulkActions={(sel, clear) => (
              <GuardedButton allowed={canRecheck} why={perm.why('work')} className="btn-secondary" onClick={() => recheck(sel.map((s) => s.paperId), clear)}>
                <RefreshCw size={14} strokeWidth={1.5} aria-hidden /> Recheck {sel.length} selected
              </GuardedButton>
            )}
            empty={{ icon: SearchX, title: 'No articles match these filters', hint: 'Clear a filter, or publish an article first — only published articles are indexed.' }}
          />
        </div>
      )}
    </>
  )
}
