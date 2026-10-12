import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, StickyNote, Undo2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { JournalBadge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { DescriptionList } from '@/components/Form'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { RelativeTime } from '@/components/Time'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn, initials } from '@/lib/utils'
import { usePermission } from '@/permissions/hooks'
import { formatDateTime } from '@/shared/formatters'
import type { Ticket } from '@/shared/types'
import { useDataStore } from '@/mock/store'
import { useCommStore } from '@/mock/stores/communication'
import { addTicketNote, listTickets, mergeTickets, replyToTicket, updateTicket } from '@/mock/api/helpdesk'
import { CANNED_REPLIES } from '@/mock/data/communication'
import { JOURNAL_CODES } from '@/mock/data/core'
import { useNow } from './hooks'
import { PaperLink } from './parts'
import { PriorityBadge, SlaChip, TicketStatusBadge } from './helpdeskParts'

export function TicketDetailPage() {
  const { ticketId = '' } = useParams()
  const { can, why } = usePermission('helpdesk')
  const canWork = can('work')
  const { loading, error, reload } = useAsync(() => listTickets(JOURNAL_CODES), [ticketId])
  const tickets = useDataStore((s) => s.tickets)
  const users = useDataStore((s) => s.users)
  const details = useCommStore((s) => s.ticketDetails)
  const now = useNow(60_000)
  const ticket = useMemo(() => mergeTickets(tickets.filter((t) => t.id === ticketId), details)[0], [tickets, details, ticketId])
  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  useUnsavedChanges(text.trim().length > 0)

  const crumbs = [{ label: ticketId }]
  if (error) return <><PageHeader title="Ticket" crumbs={crumbs} draft /><div className="card"><ErrorState message="This ticket could not be loaded." onRetry={reload} /></div></>
  if (loading && !ticket) return <><PageHeader title="Ticket" crumbs={crumbs} draft /><Skeleton className="h-96 w-full" /></>
  if (!ticket) {
    return (
      <>
        <PageHeader title="Ticket not found" crumbs={crumbs} draft />
        <div className="card"><EmptyState title={`No ticket ${ticketId}`} hint="It may have been removed, or the number is mistyped." action={<Link to="/helpdesk" className="btn-secondary">Back to tickets</Link>} /></div>
      </>
    )
  }

  const assignable = users.filter((u) => u.status === 'active' && u.assignments[ticket.journal] && ['super_admin', 'editor', 'associate_editor', 'support'].includes(u.assignments[ticket.journal]!))
  const assignee = users.find((u) => u.id === ticket.assigneeId)
  const resolved = ticket.status === 'resolved'
  const tooShort = text.trim().length < 3

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    try { await fn(); toast.success(msg) } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong') } finally { setBusy(false) }
  }
  const submit = async (resolve = false) => {
    setTouched(true)
    if (tooShort) return
    const t = text.trim()
    await run(() => (mode === 'reply' ? replyToTicket(ticket.id, t, { resolve }) : addTicketNote(ticket.id, t)),
      mode === 'note' ? 'Internal note added' : resolve ? `Reply sent to ${ticket.requester} and ticket resolved` : `Reply sent to ${ticket.requester}`)
    setText(''); setTouched(false)
  }
  const change = (p: Partial<Pick<Ticket, 'priority' | 'status' | 'assigneeId'>>, msg: string) => run(() => updateTicket(ticket.id, p), msg)

  const thread = [
    ...ticket.detail.messages.map((m) => ({ ...m, kind: 'msg' as const })),
    ...ticket.detail.notes.map((n) => ({ ...n, kind: 'note' as const })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <>
      <PageHeader title={ticket.subject} description={`${ticket.id} · opened by ${ticket.requester}`} crumbs={crumbs} draft
        actions={<>
          <Link to="/helpdesk" className="btn-ghost"><ArrowLeft size={15} strokeWidth={1.5} aria-hidden /> All tickets</Link>
          {resolved
            ? <GuardedButton allowed={canWork} why={why('work')} className="btn-secondary" disabled={busy} onClick={() => change({ status: 'open' }, 'Ticket reopened. The response timer restarted.')}><Undo2 size={15} aria-hidden /> Reopen</GuardedButton>
            : <GuardedButton allowed={canWork} why={why('work')} className="btn-primary" disabled={busy} onClick={() => change({ status: 'resolved' }, 'Ticket resolved')}><CheckCircle2 size={15} aria-hidden /> Resolve</GuardedButton>}
        </>} />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <SectionCard title="Conversation" flush>
            <ol className="space-y-4 p-4" aria-label="Conversation">
              {thread.map((m) => m.kind === 'note' ? (
                <li key={m.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-900"><StickyNote size={13} aria-hidden /> Internal note by {m.author} · <RelativeTime value={m.at} /></p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.text}</p>
                </li>
              ) : (
                <li key={m.id} className={cn('flex gap-3', m.from === 'agent' && 'flex-row-reverse')}>
                  <span aria-hidden className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', m.from === 'agent' ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted')}>{initials(m.author)}</span>
                  <div className={cn('max-w-[85%] rounded-lg border p-3', m.from === 'agent' ? 'border-indigo-100 bg-accent-soft/50' : 'border-line bg-surface')}>
                    <p className="text-xs text-muted"><span className="font-medium text-ink">{m.author}</span> · <RelativeTime value={m.at} /></p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{m.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard title={resolved ? 'Ticket resolved' : 'Respond'}>
            {resolved ? <p className="text-sm text-muted">This ticket is resolved. Reopen it to reply or add notes.</p> : (
              <div className="space-y-3">
                <div role="group" aria-label="Response type" className="inline-flex rounded-lg border border-line p-0.5 text-sm">
                  {([['reply', 'Reply to requester'], ['note', 'Internal note']] as const).map(([k, l]) => (
                    <button key={k} aria-pressed={mode === k} onClick={() => setMode(k)} className={cn('rounded-md px-3 py-1 font-medium', mode === k ? 'bg-accent text-white' : 'text-muted hover:text-ink')}>{l}</button>
                  ))}
                </div>
                {mode === 'reply' && (
                  <div>
                    <label htmlFor="canned" className="label">Canned reply</label>
                    <select id="canned" className="input" value="" disabled={!canWork} onChange={(e) => { const c = CANNED_REPLIES.find((x) => x.label === e.target.value); if (c) setText((t) => (t ? `${t}\n\n${c.text}` : c.text)) }}>
                      <option value="">Insert a canned reply…</option>
                      {CANNED_REPLIES.map((c) => <option key={c.label}>{c.label}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="ticket-text" className="label">{mode === 'reply' ? `Message to ${ticket.requester}` : 'Note (visible to staff only)'}</label>
                  <textarea id="ticket-text" rows={5} className={cn('input !h-auto py-2', mode === 'note' && 'bg-amber-50')} value={text} disabled={!canWork} aria-invalid={touched && tooShort}
                    onChange={(e) => setText(e.target.value)} onBlur={() => setTouched(true)} placeholder={canWork ? undefined : why('work')} />
                  {touched && tooShort && <p role="alert" className="mt-1 text-xs text-red-600">Write at least a few words before sending.</p>}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {mode === 'reply' && <GuardedButton allowed={canWork} why={why('work')} className="btn-secondary" disabled={busy} onClick={() => submit(true)}>Send &amp; resolve</GuardedButton>}
                  <GuardedButton allowed={canWork} why={why('work')} className="btn-primary" disabled={busy} onClick={() => submit(false)}>{mode === 'reply' ? 'Send reply' : 'Add note'}</GuardedButton>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-5">
          <SectionCard title="Ticket">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2"><TicketStatusBadge status={ticket.status} /><PriorityBadge priority={ticket.priority} /><SlaChip ticket={ticket} now={now} /></div>
              <div>
                <label htmlFor="t-status" className="label">Status</label>
                <select id="t-status" className="input" value={ticket.status} disabled={!canWork || busy} onChange={(e) => change({ status: e.target.value as Ticket['status'] }, `Status changed to ${e.target.value}`)}>
                  <option value="open">Open</option><option value="pending">Pending (waiting on requester)</option><option value="resolved">Resolved</option>
                </select>
              </div>
              <div>
                <label htmlFor="t-pri" className="label">Priority</label>
                <select id="t-pri" className="input" value={ticket.priority} disabled={!canWork || busy} onChange={(e) => change({ priority: e.target.value as Ticket['priority'] }, `Priority changed to ${e.target.value}. SLA recalculated.`)}>
                  <option value="urgent">Urgent (2 h)</option><option value="high">High (8 h)</option><option value="normal">Normal (24 h)</option><option value="low">Low (48 h)</option>
                </select>
              </div>
              <div>
                <label htmlFor="t-asg" className="label">Assignee</label>
                <select id="t-asg" className="input" value={ticket.assigneeId ?? ''} disabled={!canWork || busy} onChange={(e) => change({ assigneeId: e.target.value || undefined }, e.target.value ? `Assigned to ${users.find((u) => u.id === e.target.value)?.name}` : 'Ticket unassigned')}>
                  <option value="">Unassigned</option>
                  {assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              {!canWork && <p className="text-xs text-muted">{why('work')}</p>}
            </div>
          </SectionCard>

          <SectionCard title="Details">
            <DescriptionList cols={1} items={[
              { label: 'Journal', value: <JournalBadge code={ticket.journal} /> },
              { label: 'Requester', value: <>{ticket.requester}<br /><span className="text-muted">{ticket.detail.requesterEmail}</span></> },
              { label: 'Paper', value: <PaperLink id={ticket.detail.paperId} /> },
              { label: 'Category', value: ticket.detail.category },
              { label: 'Source', value: ticket.detail.source },
              { label: 'Assignee', value: assignee?.name ?? 'Unassigned' },
              { label: 'Opened', value: formatDateTime(ticket.createdAt) },
              { label: 'First response', value: ticket.detail.firstResponseAt ? formatDateTime(ticket.detail.firstResponseAt) : 'Not yet' },
            ]} />
          </SectionCard>
        </aside>
      </div>
    </>
  )
}
