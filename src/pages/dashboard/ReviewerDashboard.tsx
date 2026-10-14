import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Info, Newspaper } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { getReviewerOverview } from '@/mock/api/dashboard'
import { useSession } from '@/mock/store'
import { useCurrentUser, useJournals, usePermission, useRole } from '@/permissions/hooks'
import { useAsync } from '@/lib/useAsync'
import { formatDate } from '@/shared/formatters'
import { KpiCard } from '@/components/KpiCard'
import { SectionCard } from '@/components/Card'
import { DueChip } from '@/components/Due'
import { Badge } from '@/components/Badges'
import { EmptyState, ErrorState } from '@/components/States'
import { recommendationMeta } from '@/mock/data/editorial'
import { LINK, PaperTable, TD, TH, TableSkeleton, CELL } from './parts'

const overdue = (iso?: string) => !!iso && differenceInCalendarDays(parseISO(iso), new Date()) <= 0

/** Reviewer (reviews, completed reports, blog drafts) and Review Panel Member (assigned reviews only). */
export function ReviewerDashboard() {
  const role = useRole()
  const panel = role === 'panel_member'
  const user = useCurrentUser()!
  const scope = useSession((s) => s.journal)
  const journals = useJournals()
  const blog = usePermission('blog')
  const q = useAsync(() => getReviewerOverview(user.id, scope, journals), [user.id, scope, journals.join()])
  const d = q.data
  const loading = q.loading
  const dueCount = d?.assigned.filter((p) => overdue(p.reviewDue)).length

  return (
    <div className="space-y-6">
      <section className={`grid grid-cols-2 gap-4 ${panel ? 'md:grid-cols-2' : 'md:grid-cols-4'}`} aria-label="Key figures">
        <KpiCard label={panel ? 'Assigned reviews' : 'Reviews due'} value={panel ? d?.assigned.length : d?.assigned.filter((p) => p.status === 'under_review').length} icon={ClipboardCheck} loading={loading} to="/my-reviews" />
        <KpiCard label="Due or overdue" value={dueCount} icon={AlertTriangle} loading={loading} tone={dueCount ? 'warning' : 'default'} to="/my-reviews" />
        {!panel && <KpiCard label="Completed reviews" value={d?.completed.length} icon={CheckCircle2} loading={loading} />}
        {!panel && blog.can() && <KpiCard label="Blog drafts" value={d?.blogDrafts} icon={Newspaper} loading={loading} to="/blog" />}
      </section>

      {panel && (
        <p className="flex items-start gap-2 rounded-md bg-accent-soft px-4 py-3 text-sm text-ink" role="note">
          <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          You only see the papers an Editor has assigned to you. Nothing else in the journal is visible to your account.
        </p>
      )}

      <SectionCard title={panel ? 'My assigned reviews' : 'Reviews due'} action={<Link to="/my-reviews" className={LINK}>Open all</Link>} flush>
        {q.error ? <ErrorState onRetry={q.reload} /> : loading ? <TableSkeleton /> : d!.assigned.length === 0
          ? <EmptyState icon={ClipboardCheck} title="No reviews assigned" hint="When an Editor assigns you a paper it will appear here with a due date." />
          : <PaperTable papers={d!.assigned} showJournal={scope === 'ALL'} extraLabel="Review due" extra={(p) => <DueChip value={p.reviewDue} />} />}
      </SectionCard>

      {!panel && !q.error && (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Completed reviews" flush>
            {loading ? <TableSkeleton rows={3} /> : d!.completed.length === 0
              ? <EmptyState icon={CheckCircle2} title="No completed reviews yet" hint="Reports you submit are listed here with your recommendation." />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-line"><tr><th className={TH}>Paper</th><th className={TH}>Recommendation</th><th className={TH}>Submitted</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {d!.completed.slice(0, 6).map((r) => {
                        const m = recommendationMeta(r.recommendation)
                        return (
                          <tr key={r.id} className="hover:bg-page">
                            <td className={TD} style={CELL}><Link to={`/my-reviews/${r.paperId}`} className="whitespace-nowrap font-medium text-accent hover:underline">{r.paperId}</Link><p className="text-xs text-muted">Round {r.round}</p></td>
                            <td className={TD} style={CELL}><Badge tone={m.tone}>{m.label}</Badge></td>
                            <td className={TD} style={CELL}>{formatDate(r.submittedAt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </SectionCard>

          {blog.can() && (
            <SectionCard title="Blog drafts" action={<Link to="/blog" className={LINK}>Blog & Resources</Link>}>
              {loading ? <TableSkeleton rows={2} /> : d!.blogDrafts === 0
                ? <EmptyState icon={Newspaper} title="No blog drafts" hint="Write a post for the website; the Editor approves it before it goes live." action={<Link to="/blog" className="btn-secondary">Open blog</Link>} />
                : <p className="text-sm text-muted"><span className="text-2xl font-semibold text-ink">{d!.blogDrafts}</span> {d!.blogDrafts === 1 ? 'draft is' : 'drafts are'} waiting for you to finish and submit to the Editor.</p>}
            </SectionCard>
          )}
        </div>
      )}
    </div>
  )
}
