import { Link } from 'react-router-dom'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { AlertTriangle, ClipboardCheck, Factory, LifeBuoy, MessageCircle, Undo2 } from 'lucide-react'
import { getMyProductionQueue, getMyReviews, getSupportOverview } from '@/mock/api/dashboard'
import { useSession } from '@/mock/store'
import { useCurrentUser, useJournals } from '@/permissions/hooks'
import { useAsync } from '@/lib/useAsync'
import { KpiCard } from '@/components/KpiCard'
import { SectionCard } from '@/components/Card'
import { DueChip } from '@/components/Due'
import { JournalBadge, Badge } from '@/components/Badges'
import { EmptyState, ErrorState } from '@/components/States'
import { RelativeTime } from '@/components/Time'
import { PaperTable, TD, TH, TableSkeleton } from './parts'

const overdue = (iso?: string) => !!iso && differenceInCalendarDays(parseISO(iso), new Date()) <= 0

export function ProductionDashboard() {
  const user = useCurrentUser()!
  const scope = useSession((s) => s.journal)
  const q = useAsync(() => getMyProductionQueue(user.id, scope), [user.id, scope])
  const all = q.data ?? []
  const returned = all.filter((p) => p.status === 'returned_to_production')
  const due = all.filter((p) => p.status !== 'ready_for_approval' && overdue(p.productionDue))
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Key figures">
        <KpiCard label="In my queue" value={all.length} icon={Factory} loading={q.loading} to="/production" />
        <KpiCard label="Due or overdue" value={due.length} icon={AlertTriangle} loading={q.loading} tone={due.length ? 'warning' : 'default'} />
        <KpiCard label="Returned by Editor" value={returned.length} icon={Undo2} loading={q.loading} tone={returned.length ? 'danger' : 'default'} />
        <KpiCard label="Sent for approval" value={all.filter((p) => p.status === 'ready_for_approval').length} icon={ClipboardCheck} loading={q.loading} />
      </section>
      {q.error ? <ErrorState onRetry={q.reload} /> : (
        <>
          <SectionCard title="My production queue" flush>
            {q.loading ? <TableSkeleton /> : all.length === 0 ? <EmptyState icon={Factory} title="Your queue is empty" hint="Papers appear here automatically once their payment is verified." /> :
              <PaperTable papers={all} extraLabel="Due" extra={(p) => <DueChip value={p.productionDue} />} />}
          </SectionCard>
          {returned.length > 0 && (
            <SectionCard title="Returned to production" flush>
              <PaperTable papers={returned} extraLabel="Due" extra={(p) => <DueChip value={p.productionDue} />} />
            </SectionCard>
          )}
        </>
      )}
    </div>
  )
}

export function ReviewerDashboard() {
  const user = useCurrentUser()!
  const scope = useSession((s) => s.journal)
  const q = useAsync(() => getMyReviews(user.id, scope), [user.id, scope])
  const all = q.data ?? []
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3" aria-label="Key figures">
        <KpiCard label="Assigned to me" value={all.length} icon={ClipboardCheck} loading={q.loading} to="/my-reviews" />
        <KpiCard label="Due or overdue" value={all.filter((p) => overdue(p.reviewDue)).length} icon={AlertTriangle} loading={q.loading} tone="warning" />
        <KpiCard label="Awaiting my report" value={all.filter((p) => p.status === 'under_review').length} icon={ClipboardCheck} loading={q.loading} />
      </section>
      <SectionCard title="My assigned reviews" action={<Link to="/my-reviews" className="text-sm font-medium text-accent hover:underline">Open all</Link>} flush>
        {q.error ? <ErrorState onRetry={q.reload} /> : q.loading ? <TableSkeleton /> : all.length === 0 ? <EmptyState icon={ClipboardCheck} title="No reviews assigned" hint="When an Editor assigns you a paper it will appear here with a due date." /> :
          <PaperTable papers={all} extraLabel="Review due" extra={(p) => <DueChip value={p.reviewDue} />} />}
      </SectionCard>
    </div>
  )
}

export function SupportDashboard() {
  const scope = useSession((s) => s.journal)
  const journals = useJournals()
  const q = useAsync(() => getSupportOverview(scope, journals), [scope, journals.join()])
  const d = q.data
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3" aria-label="Key figures">
        <KpiCard label="Open tickets" value={d?.openTickets.length} icon={LifeBuoy} loading={q.loading} to="/helpdesk" />
        <KpiCard label="Unread WhatsApp chats" value={d?.unreadChats.length} icon={MessageCircle} loading={q.loading} to="/whatsapp" />
        <KpiCard label="Failed messages" value={d?.failedMessages.length} icon={AlertTriangle} loading={q.loading} tone={d?.failedMessages.length ? 'danger' : 'default'} to="/communication-log" />
      </section>
      {q.error ? <ErrorState onRetry={q.reload} /> : (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Open tickets" action={<Link to="/helpdesk" className="text-sm font-medium text-accent hover:underline">All tickets</Link>} flush>
            {q.loading ? <TableSkeleton /> : (
              <table className="w-full text-sm">
                <thead className="border-b border-line"><tr><th className={TH}>Ticket</th><th className={TH}>Priority</th><th className={TH}>Respond by</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {d!.openTickets.slice(0, 6).map((t) => (
                    <tr key={t.id}>
                      <td className={TD} style={{ paddingBlock: 'var(--cell-py)' }}>
                        <div className="flex items-center gap-2"><span className="font-medium">{t.id}</span><JournalBadge code={t.journal} /></div>
                        <p className="line-clamp-2 max-w-[340px] text-muted" title={t.subject}>{t.subject}</p>
                      </td>
                      <td className={TD} style={{ paddingBlock: 'var(--cell-py)' }}><Badge tone={t.priority === 'urgent' ? 'danger' : t.priority === 'high' ? 'warning' : 'neutral'}>{t.priority}</Badge></td>
                      <td className={TD} style={{ paddingBlock: 'var(--cell-py)' }}><DueChip value={t.dueAt} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
          <div className="space-y-6">
            <SectionCard title="Unread WhatsApp chats" action={<Link to="/whatsapp" className="text-sm font-medium text-accent hover:underline">Open inbox</Link>} flush>
              {q.loading ? <TableSkeleton rows={3} /> : d!.unreadChats.length === 0 ? <EmptyState icon={MessageCircle} title="No unread chats" /> : (
                <ul className="divide-y divide-line">
                  {d!.unreadChats.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0"><p className="text-sm font-medium">{c.contact} <JournalBadge code={c.journal} /></p><p className="truncate text-sm text-muted">{c.lastMessage}</p></div>
                      <div className="shrink-0 text-right text-xs text-muted"><RelativeTime value={c.lastAt} /><br /><span className="mt-1 inline-block rounded-full bg-accent px-1.5 text-white">{c.unread}</span></div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Failed messages" flush>
              {q.loading ? <TableSkeleton rows={3} /> : d!.failedMessages.length === 0 ? <EmptyState title="No failed messages" /> : (
                <ul className="divide-y divide-line">
                  {d!.failedMessages.slice(0, 4).map((m) => (
                    <li key={m.id} className="px-4 py-2.5 text-sm">
                      <p><span className="font-medium">{m.paperId}</span> · {m.channel} · {m.template}</p>
                      <p className="text-xs text-red-700">{m.failureReason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  )
}
