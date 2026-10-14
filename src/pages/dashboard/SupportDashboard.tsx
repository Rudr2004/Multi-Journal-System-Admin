import { Link } from 'react-router-dom'
import { AlertTriangle, FilePenLine, LifeBuoy, Mail, MessageCircle, MessagesSquare } from 'lucide-react'
import { getSupportOverview } from '@/mock/api/dashboard'
import { useSession } from '@/mock/store'
import { useCurrentUser, useJournals, usePermission } from '@/permissions/hooks'
import { useAsync } from '@/lib/useAsync'
import { KpiCard } from '@/components/KpiCard'
import { SectionCard } from '@/components/Card'
import { DueChip } from '@/components/Due'
import { Badge, JournalBadge } from '@/components/Badges'
import { EmptyState, ErrorState } from '@/components/States'
import { RelativeTime } from '@/components/Time'
import { ChangeStatusBadge } from '@/pages/production/postPubShared'
import { LINK, TD, TH, TableSkeleton, CELL } from './parts'

const PRIORITY_BAR: Record<string, string> = { urgent: 'bg-red-500', high: 'bg-amber-500', normal: 'bg-indigo-500', low: 'bg-slate-400' }
const PRIORITY_TONE = { urgent: 'danger', high: 'warning', normal: 'neutral', low: 'neutral' } as const

export function SupportDashboard() {
  const user = useCurrentUser()!
  const scope = useSession((s) => s.journal)
  const journals = useJournals()
  const flags = useSession((s) => s.flags)
  const commLog = usePermission('commLog')
  const q = useAsync(() => getSupportOverview(scope, journals, user.name), [scope, journals.join(), user.name, flags.emailInbox, flags.websiteChat])
  const d = q.data
  const loading = q.loading
  const total = d?.openTickets.length ?? 0
  const failed = d?.failedMessages.length
  const all = scope === 'ALL'

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Key figures">
        <KpiCard label="Open tickets" value={d?.openTickets.length} icon={LifeBuoy} loading={loading} to="/helpdesk" />
        <KpiCard label="Unread conversations" value={d && d.unread.whatsapp + (d.unread.email ?? 0) + (d.unread.chat ?? 0)} icon={MessageCircle} loading={loading} to="/inbox" />
        <KpiCard label="My correction requests" value={d?.corrections.length} icon={FilePenLine} loading={loading} to="/post-publication" />
        <KpiCard label="Failed messages" value={failed} icon={AlertTriangle} loading={loading} tone={failed ? 'danger' : 'default'} to={commLog.can() ? '/communication-log' : undefined} hint={commLog.can() ? undefined : 'Read-only'} />
      </section>

      {q.error ? <ErrorState onRetry={q.reload} /> : (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Unread by channel" action={<Link to="/inbox" className={LINK}>Open inbox</Link>}>
            {loading ? <TableSkeleton rows={3} /> : (
              <ul className="grid gap-3 sm:grid-cols-3">
                {[
                  { key: 'whatsapp', label: 'WhatsApp', n: d!.unread.whatsapp, icon: MessageCircle },
                  { key: 'email', label: 'Email', n: d!.unread.email, icon: Mail, badge: 'Proposed' },
                  { key: 'chat', label: 'Website chat', n: d!.unread.chat, icon: MessagesSquare, badge: 'Proposed' },
                ].map((c) => (
                  <li key={c.key} className="rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between text-xs font-medium text-muted"><span className="flex items-center gap-1.5"><c.icon size={14} aria-hidden />{c.label}</span>{c.badge && <Badge tone="info">{c.badge}</Badge>}</div>
                    <p className="mt-1 text-2xl font-semibold tracking-tight">{c.n ?? '—'}</p>
                    {c.n === null && <p className="text-xs text-muted">Channel is switched off</p>}
                  </li>
                ))}
              </ul>
            )}
            {!loading && d!.unreadChats.length > 0 && (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {d!.unreadChats.slice(0, 4).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0"><p className="text-sm font-medium">{c.contact} {all && <JournalBadge code={c.journal} />}</p><p className="truncate text-sm text-muted">{c.lastMessage}</p></div>
                    <div className="shrink-0 text-right text-xs text-muted"><RelativeTime value={c.lastAt} /><br /><span className="mt-1 inline-block rounded-full bg-accent px-1.5 text-white" aria-label={`${c.unread} unread`}>{c.unread}</span></div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Open tickets by priority" action={<Link to="/helpdesk" className={LINK}>All tickets</Link>}>
            {loading ? <TableSkeleton rows={3} /> : total === 0
              ? <EmptyState icon={LifeBuoy} title="No open tickets" hint="New enquiries from authors will appear here." />
              : (
                <>
                  <div className="flex h-3 overflow-hidden rounded-full bg-subtle" role="img" aria-label={`Open tickets by priority: ${d!.byPriority.map((b) => `${b.priority} ${b.count}`).join(', ')}`}>
                    {d!.byPriority.filter((b) => b.count > 0).map((b) => <div key={b.priority} className={PRIORITY_BAR[b.priority]} style={{ width: `${(b.count / total) * 100}%` }} />)}
                  </div>
                  <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {d!.byPriority.map((b) => (
                      <li key={b.priority} className="flex items-center gap-2 text-sm"><span className={`h-2.5 w-2.5 rounded-sm ${PRIORITY_BAR[b.priority]}`} aria-hidden /><span className="capitalize text-muted">{b.priority}</span><span className="font-semibold tabular-nums">{b.count}</span></li>
                    ))}
                  </ul>
                  <ul className="mt-4 divide-y divide-line border-t border-line">
                    {d!.openTickets.slice(0, 4).map((t) => (
                      <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm"><Link to="/helpdesk" className="font-medium text-accent hover:underline">{t.id}</Link>{all && <JournalBadge code={t.journal} />}<Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge></div>
                          <p className="line-clamp-2 text-sm text-muted" title={t.subject}>{t.subject}</p>
                        </div>
                        <DueChip value={t.dueAt} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
          </SectionCard>

          <SectionCard title="Correction requests I raised" action={<Link to="/post-publication" className={LINK}>Post Corrections</Link>} flush>
            {loading ? <TableSkeleton rows={3} /> : d!.corrections.length === 0
              ? <EmptyState icon={FilePenLine} title="You have not raised any corrections" hint="Raise one from Post Corrections when an author reports an error." action={<Link to="/post-publication/new" className="btn-secondary">New request</Link>} />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-line"><tr><th className={TH}>Request</th><th className={TH}>Status</th><th className={TH}>Raised</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {d!.corrections.slice(0, 6).map((c) => (
                        <tr key={c.id} className="hover:bg-page">
                          <td className={TD} style={CELL}><Link to={`/post-publication/${c.id}`} className="font-medium text-accent hover:underline">{c.id}</Link><p className="text-xs text-muted">{c.paperId}</p></td>
                          <td className={TD} style={CELL}><ChangeStatusBadge status={c.status} /></td>
                          <td className={TD} style={CELL}><RelativeTime value={c.requestedAt} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </SectionCard>

          <SectionCard title="Failed messages" action={commLog.can() ? <Link to="/communication-log" className={LINK}>Communication Log</Link> : undefined} flush>
            {loading ? <TableSkeleton rows={3} /> : d!.failedMessages.length === 0 ? <EmptyState title="No failed messages" hint="Every email, SMS and WhatsApp message was delivered." /> : (
              <ul className="divide-y divide-line">
                {d!.failedMessages.slice(0, 4).map((m) => (
                  <li key={m.id} className="px-4 py-2.5 text-sm">
                    <p><span className="font-medium">{m.paperId ?? m.recipient}</span> · <span className="capitalize">{m.channel}</span> · {m.template}</p>
                    <p className="text-xs text-red-700">{m.failureReason}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  )
}
