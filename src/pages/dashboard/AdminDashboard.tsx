import { Link } from 'react-router-dom'
import { BadgeCheck, CircleDollarSign, Clock, Factory, FilePlus2, Gavel, Send, Wallet } from 'lucide-react'
import { getAdminOverview, getRecentActivity } from '@/mock/api/dashboard'
import { recordAudit } from '@/mock/actions'
import { downloadCsv } from '@/pages/insights/csv'
import { useSession } from '@/mock/store'
import { paperStagePath } from '@/lib/paperRoutes'
import { useJournals } from '@/permissions/hooks'
import { useAsync } from '@/lib/useAsync'
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, formatTime } from '@/shared/formatters'
import { KpiCard } from '@/components/KpiCard'
import { SectionCard } from '@/components/Card'
import { JournalBadge } from '@/components/Badges'
import { EmptyState, ErrorState } from '@/components/States'
import { RelativeTime } from '@/components/Time'
import { PaperTable, ScholarCard, StageChart, TD, TH, TableSkeleton } from './parts'
import { FormsInboxCard } from './FormsInboxCard'
import { RangeBar, useRangeState } from './RangeBar'

export function AdminDashboard() {
  const scope = useSession((s) => s.journal)
  const journals = useJournals()
  const rs = useRangeState()
  const overview = useAsync(() => getAdminOverview(scope, journals, rs.range), [scope, journals.join(), rs.range.from, rs.range.to])
  const activity = useAsync(() => getRecentActivity(scope, journals), [scope, journals.join()])
  const o = overview.data
  const k = o?.kpis
  const loading = overview.loading

  const exportCsv = () => {
    if (!o || !k) return
    const rows: (string | number | undefined)[][] = [
      ['Dashboard summary'], ['Journal', scope === 'ALL' ? 'All journals' : scope], ['Period', rs.label], ['Generated', formatDateTime(new Date())], [],
      ['Key figures'],
      [rs.active ? 'New submissions in the period' : 'New submissions (7 days)', k.newSubmissions], ['Awaiting decision', k.awaitingDecision], ['Awaiting payment', k.awaitingPayment],
      ['In production', k.inProduction], ['Ready to publish', k.readyToPublish], [rs.active ? 'Published in the period' : 'Published this month', k.publishedThisMonth],
      ['Revenue (INR, incl. GST)', k.revenueInr.toFixed(2)], ['Revenue (USD)', k.revenueUsd.toFixed(2)], [],
      ['Pipeline by stage'], ['Stage', 'Papers'], ...o.pipeline.map((p) => [p.label, p.count]), [],
      ['Journal breakdown'], ['Journal', 'Papers', 'Awaiting decision', 'In production', 'Published', 'Scholar indexed (%)'],
      ...o.perJournal.map((r) => [r.journal, r.submissions, r.awaitingDecision, r.inProduction, r.published, r.scholarRate.toFixed(1)]), [],
      ['Needs action'], ['Paper ID', 'Journal', 'Status', 'Next step', 'Submitted (date and time)'],
      ...o.needsAction.map((n) => [n.paper.id, n.paper.journal, n.paper.status, n.action, formatDateTime(n.paper.submittedAt)]),
    ]
    downloadCsv(`dashboard-${scope === 'ALL' ? 'all-journals' : scope}-${new Date().toISOString().slice(0, 10)}.csv`, rows)
    recordAudit({ journal: scope === 'ALL' ? 'ALL' : scope, action: 'Exported dashboard summary (CSV)', target: 'Dashboard', newValue: rs.label })
  }

  return (
    <div className="space-y-6">
      <RangeBar s={rs} onExport={exportCsv} disabled={loading || !o} />
      <section aria-label="Key figures" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label={rs.active ? "New submissions (period)" : "New submissions (7 days)"} value={k && formatNumber(k.newSubmissions)} icon={FilePlus2} loading={loading} to="/submissions" />
        <KpiCard label="Awaiting decision" value={k && formatNumber(k.awaitingDecision)} icon={Gavel} loading={loading} tone="warning" to="/submissions" />
        <KpiCard label="Awaiting payment" value={k && formatNumber(k.awaitingPayment)} icon={Wallet} loading={loading} to="/payments" />
        <KpiCard label="In production" value={k && formatNumber(k.inProduction)} icon={Factory} loading={loading} />
        <KpiCard label="Ready to publish" value={k && formatNumber(k.readyToPublish)} icon={BadgeCheck} loading={loading} />
        <KpiCard label={rs.active ? "Published (period)" : "Published this month"} value={k && formatNumber(k.publishedThisMonth)} icon={Clock} loading={loading} />
        <KpiCard label="Revenue (INR, incl. GST)" value={k && formatMoney(k.revenueInr, 'INR')} icon={CircleDollarSign} loading={loading} to="/payments" />
        <KpiCard label="Revenue (USD)" value={k && formatMoney(k.revenueUsd, 'USD')} icon={CircleDollarSign} loading={loading} to="/payments" />
      </section>

      {scope === 'ALL' && (
        <SectionCard title="Journal breakdown" flush>
          {overview.error ? <ErrorState onRetry={overview.reload} /> : loading ? <TableSkeleton rows={5} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line">
                  <tr>{['Journal', 'Papers', 'Awaiting decision', 'In production', 'Published', 'Scholar indexed'].map((h, i) => <th key={h} className={`${TH} ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {o!.perJournal.map((r) => (
                    <tr key={r.journal} className="hover:bg-page">
                      <td className={TD} style={{ paddingBlock: 'var(--cell-py)' }}><JournalBadge code={r.journal} /></td>
                      <td className={`${TD} text-right`} style={{ paddingBlock: 'var(--cell-py)' }}>{r.submissions}</td>
                      <td className={`${TD} text-right`} style={{ paddingBlock: 'var(--cell-py)' }}>{r.awaitingDecision}</td>
                      <td className={`${TD} text-right`} style={{ paddingBlock: 'var(--cell-py)' }}>{r.inProduction}</td>
                      <td className={`${TD} text-right`} style={{ paddingBlock: 'var(--cell-py)' }}>{r.published}</td>
                      <td className={`${TD} text-right`} style={{ paddingBlock: 'var(--cell-py)' }}>{formatPercent(r.scholarRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Pipeline by stage" className="xl:col-span-2">
          {overview.error ? <ErrorState onRetry={overview.reload} /> : loading ? <div className="h-[240px] animate-pulse rounded-md bg-slate-100" /> : (
            <StageChart data={o!.pipeline} />
          )}
        </SectionCard>

        <SectionCard title="Next dispatch" action={<Link to="/dispatch" className="text-sm font-medium text-accent hover:underline">Open queue</Link>} flush>
          {loading ? <TableSkeleton rows={3} /> : o!.dispatch.items.length === 0 ? (
            <EmptyState icon={Send} title="Nothing queued" hint="Accepted papers appear here until the next 08:45 batch goes out." />
          ) : (
            <>
              <p className="border-b border-line px-4 py-2.5 text-sm text-muted">
                <span className="font-semibold text-ink">{o!.dispatch.items.length}</span> {o!.dispatch.items.length === 1 ? "email goes" : "emails go"} {formatDate(o!.dispatch.at)} at <span className="font-semibold text-ink">{formatTime(o!.dispatch.at)}</span> IST
              </p>
              <ul className="divide-y divide-line">
                {o!.dispatch.items.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0"><Link to={paperStagePath('SUPER_ADMIN', p)} className="whitespace-nowrap text-sm font-medium text-accent hover:underline">{p.id}</Link><p className="truncate text-xs text-muted">Acceptance email · {p.authorEmail}</p></div>
                    {scope === 'ALL' && <JournalBadge code={p.journal} />}
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>
      </div>

      <FormsInboxCard journals={journals} />

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="Needs my action" className="xl:col-span-2" flush>
          {overview.error ? <ErrorState onRetry={overview.reload} /> : loading ? <TableSkeleton /> : o!.needsAction.length === 0 ? (
            <EmptyState icon={BadgeCheck} title="You are all caught up" hint="Nothing is waiting on you right now." />
          ) : (
            <PaperTable papers={o!.needsAction.map((n) => n.paper)} showJournal={scope === 'ALL'} extraLabel="Next step" extra={(p) => o!.needsAction.find((n) => n.paper.id === p.id)?.action} />
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Google Scholar indexing">
            <ScholarCard rate={o?.scholarRate} loading={loading} all={scope === 'ALL'} />
          </SectionCard>
          <SectionCard title="Recent activity" flush>
            {activity.error ? <ErrorState onRetry={activity.reload} /> : activity.loading ? <TableSkeleton rows={4} /> : activity.data!.length === 0 ? <EmptyState title="No activity yet" /> : (
              <ul className="divide-y divide-line">
                {activity.data!.slice(0, 6).map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-sm">
                    <p><span className="font-medium">{a.actor}</span> {a.text}</p>
                    <p className="mt-0.5 text-xs text-muted">{a.paperId} · <RelativeTime value={a.at} /></p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
