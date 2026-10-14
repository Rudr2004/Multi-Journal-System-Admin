import { Link } from 'react-router-dom'
import { BadgeCheck, FilePenLine, Gavel, Wallet } from 'lucide-react'
import { getEditorOverview, getRecentActivity } from '@/mock/api/dashboard'
import { useSession } from '@/mock/store'
import { useJournals } from '@/permissions/hooks'
import { useAsync } from '@/lib/useAsync'
import { formatMoney, formatNumber } from '@/shared/formatters'
import { KpiCard } from '@/components/KpiCard'
import { SectionCard } from '@/components/Card'
import { Badge, JournalBadge } from '@/components/Badges'
import { EmptyState, ErrorState } from '@/components/States'
import { RelativeTime } from '@/components/Time'
import { CHANGE_TYPE_META } from '@/mock/data/production'
import { LINK, PaperTable, ScholarCard, StageChart, TD, TH, TableSkeleton, CELL } from './parts'

export function EditorDashboard() {
  const scope = useSession((s) => s.journal)
  const journals = useJournals()
  const q = useAsync(() => getEditorOverview(scope, journals), [scope, journals.join()])
  const activity = useAsync(() => getRecentActivity(scope, journals), [scope, journals.join()])
  const d = q.data
  const all = scope === 'ALL'
  const loading = q.loading

  return (
    <div className="space-y-6">
      <section aria-label="Key figures" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Decisions due" value={d && formatNumber(d.decisions.length)} icon={Gavel} loading={loading} tone={d?.decisions.length ? 'warning' : 'default'} to="/submissions" />
        <KpiCard label="Payments to verify" value={d && formatNumber(d.payments.length)} icon={Wallet} loading={loading} tone={d?.payments.length ? 'warning' : 'default'} to="/payments" />
        <KpiCard label="Ready to publish" value={d && formatNumber(d.ready.length)} icon={BadgeCheck} loading={loading} to="/final-approval" />
        <KpiCard label="Corrections to review" value={d && formatNumber(d.corrections.length)} icon={FilePenLine} loading={loading} to="/post-publication" />
      </section>

      {q.error ? <ErrorState onRetry={q.reload} /> : (
        <>
          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard title="Pipeline by stage" className="xl:col-span-2">
              {loading ? <div className="h-[240px] animate-pulse rounded-md bg-slate-100" /> : d!.total === 0
                ? <EmptyState title="No manuscripts in your journals yet" hint="New submissions will show up here as soon as authors send them." />
                : <StageChart data={d!.pipeline} />}
            </SectionCard>
            <div className="space-y-6">
              <SectionCard title="Google Scholar indexing"><ScholarCard rate={d?.scholarRate} loading={loading} all={all} /></SectionCard>
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

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Decisions due" action={<Link to="/submissions" className={LINK}>Open manuscripts</Link>} flush>
              {loading ? <TableSkeleton /> : d!.decisions.length === 0
                ? <EmptyState icon={Gavel} title="No decisions waiting" hint="Papers appear here once their review reports are in." />
                : <PaperTable papers={d!.decisions.slice(0, 6)} showJournal={all} extraLabel="Waiting since" extra={(p) => <RelativeTime value={p.updatedAt} />} />}
            </SectionCard>

            <SectionCard title="Payments to verify" action={<Link to="/payments" className={LINK}>Payment verification</Link>} flush>
              {loading ? <TableSkeleton /> : d!.payments.length === 0
                ? <EmptyState icon={Wallet} title="Nothing to verify" hint="Offline payment proofs uploaded by authors will be listed here." />
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-line"><tr><th className={TH}>Paper</th>{all && <th className={TH}>Journal</th>}<th className={TH}>Payer</th><th className={`${TH} text-right`}>Amount</th></tr></thead>
                      <tbody className="divide-y divide-line">
                        {d!.payments.slice(0, 6).map(({ payment: x }) => (
                          <tr key={x.id} className="hover:bg-page">
                            <td className={TD} style={CELL}><Link to="/payments" className="whitespace-nowrap font-medium text-accent hover:underline">{x.paperId}</Link></td>
                            {all && <td className={TD} style={CELL}><JournalBadge code={x.journal} /></td>}
                            <td className={TD} style={CELL}>{x.payer}<p className="text-xs text-muted capitalize">{x.method.replace('_', ' ')}</p></td>
                            <td className={`${TD} text-right tabular-nums`} style={CELL}>{formatMoney(x.total, x.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </SectionCard>

            <SectionCard title="Ready to publish" action={<Link to="/final-approval" className={LINK}>Final approval</Link>} flush>
              {loading ? <TableSkeleton /> : d!.ready.length === 0
                ? <EmptyState icon={BadgeCheck} title="Nothing awaiting approval" hint="Associate Editors send finished articles here for your final check." />
                : <PaperTable papers={d!.ready.slice(0, 6)} showJournal={all} extraLabel="Updated" extra={(p) => <RelativeTime value={p.updatedAt} />} />}
            </SectionCard>

            <SectionCard title="Correction requests to review" action={<Link to="/post-publication" className={LINK}>All corrections</Link>} flush>
              {loading ? <TableSkeleton /> : d!.corrections.length === 0
                ? <EmptyState icon={FilePenLine} title="No corrections waiting" hint="Requests raised by Support appear here for your approval." />
                : (
                  <ul className="divide-y divide-line">
                    {d!.corrections.slice(0, 6).map((c) => (
                      <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <Link to={`/post-publication/${c.id}`} className="text-sm font-medium text-accent hover:underline">{c.id}</Link>
                          <span className="text-sm text-muted"> · {c.paperId}</span>
                          <p className="line-clamp-2 text-sm text-muted" title={c.reason}>{c.reason}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge tone={c.status === 'version_review' ? 'accent' : 'warning'}>{c.status === 'version_review' ? 'New version to check' : c.status === 'under_review' ? 'Under review' : 'Awaiting decision'}</Badge>
                          <span className="text-xs text-muted">{CHANGE_TYPE_META[c.type].label}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
