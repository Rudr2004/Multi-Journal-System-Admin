import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, Clock, Inbox, LifeBuoy, Plus } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge } from '@/components/Badges'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { KpiCard } from '@/components/KpiCard'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import { TICKET_SOURCES, sourceLabel } from '@/mock/data/communication'
import { parsePaperId } from '@/shared/paperId'
import type { JournalCode, Ticket } from '@/shared/types'
import { useDataStore } from '@/mock/store'
import { useCommStore } from '@/mock/stores/communication'
import { PRIORITY_ORDER, createTicket, listTickets, mergeTickets, responseTimer, type HelpTicket } from '@/mock/api/helpdesk'
import { useNow } from './hooks'
import { PaperLink } from './parts'
import { PriorityBadge, SlaChip, TicketLink, TicketStatusBadge } from './helpdeskParts'

interface Filters { status: string; priority: string; assignee: string; source: string }
const NO_FILTERS: Filters = { status: '', priority: '', assignee: '', source: '' }
const TICKET_CATEGORIES = ['Billing', 'Certificates', 'Submission', 'Review process', 'Publication', 'Indexing', 'Account', 'Special issues', 'General enquiry']

const schema = z.object({
  journal: z.string().min(1, 'Choose a journal'),
  requester: z.string().trim().min(2, 'Enter the requester’s name'),
  requesterEmail: z.string().trim().email('Enter a valid email address'),
  subject: z.string().trim().min(8, 'Subject must be at least 8 characters').max(120, 'Keep the subject under 120 characters'),
  category: z.string().min(1),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  paperId: z.string().trim().refine((v) => !v || parsePaperId(v), 'Paper ID looks like IJMAT2026000113'),
  message: z.string().trim().min(15, 'Describe the issue in at least 15 characters'),
})
type FormValues = z.infer<typeof schema>

function NewTicketForm({ journals, onCreated }: { journals: JournalCode[]; onCreated: (id: string) => void }) {
  const me = useCurrentUser()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { journal: journals[0] ?? '', requester: '', requesterEmail: '', subject: '', category: 'General enquiry', priority: 'normal', paperId: '', message: '' },
  })
  const submit = handleSubmit(async (v) => {
    const id = await createTicket({
      journal: v.journal as JournalCode, subject: v.subject, requester: v.requester, requesterEmail: v.requesterEmail, priority: v.priority,
      category: v.category, message: v.message, paperId: v.paperId ? v.paperId.toUpperCase() : undefined, source: 'Phone', assigneeId: me?.id,
    })
    toast.success(`Ticket ${id} created and assigned to you`)
    onCreated(id)
  })
  return (
    <form id="new-ticket-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <FormField label="Journal" required error={errors.journal?.message}>{(p) => <select {...p} className="input" {...register('journal')}>{journals.map((j) => <option key={j}>{j}</option>)}</select>}</FormField>
      <FormField label="Priority" required>{(p) => <select {...p} className="input" {...register('priority')}><option value="low">Low (48 h)</option><option value="normal">Normal (24 h)</option><option value="high">High (8 h)</option><option value="urgent">Urgent (2 h)</option></select>}</FormField>
      <FormField label="Requester name" required error={errors.requester?.message}>{(p) => <input {...p} className="input" {...register('requester')} />}</FormField>
      <FormField label="Requester email" required error={errors.requesterEmail?.message}>{(p) => <input {...p} type="email" className="input" {...register('requesterEmail')} />}</FormField>
      <FormField label="Subject" required error={errors.subject?.message} className="sm:col-span-2">{(p) => <input {...p} className="input" {...register('subject')} />}</FormField>
      <FormField label="Category">{(p) => <select {...p} className="input" {...register('category')}>{TICKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</FormField>
      <FormField label="Paper ID (optional)" error={errors.paperId?.message}>{(p) => <input {...p} className="input" placeholder="IJMAT2026000113" {...register('paperId')} />}</FormField>
      <FormField label="Message" required error={errors.message?.message} className="sm:col-span-2">{(p) => <textarea {...p} rows={4} className="input !h-auto py-2" {...register('message')} />}</FormField>
      <button type="submit" className="sr-only" disabled={isSubmitting}>Create</button>
    </form>
  )
}

export function HelpdeskPage() {
  const nav = useNavigate()
  const journals = useScopeJournals()
  const showJournal = useIsAllJournals()
  const { can, why } = usePermission('helpdesk')
  const canOpenPaper = usePermission('submissions').can('view')
  const me = useCurrentUser()
  const { loading, error, reload } = useAsync(() => listTickets(journals), [journals.join()])
  const tickets = useDataStore((s) => s.tickets)
  const users = useDataStore((s) => s.users)
  const details = useCommStore((s) => s.ticketDetails)
  const now = useNow(60_000)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [creating, setCreating] = useState(false)
  const set = (k: keyof Filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }))

  const all = useMemo(() => mergeTickets(tickets.filter((t) => journals.includes(t.journal)), details), [tickets, details, journals])
  const rows = useMemo(() => all.filter((t) =>
    (!filters.status || t.status === filters.status) &&
    (!filters.priority || t.priority === filters.priority) &&
    (!filters.source || sourceLabel(t.detail.source) === filters.source) &&
    (!filters.assignee || (filters.assignee === 'unassigned' ? !t.assigneeId : filters.assignee === 'me' ? t.assigneeId === me?.id : t.assigneeId === filters.assignee)),
  ), [all, filters, me?.id])

  const stats = useMemo(() => {
    const active = all.filter((t) => t.status !== 'resolved')
    return {
      open: active.length,
      breached: active.filter((t) => responseTimer(t, now).tone === 'danger').length,
      unassigned: active.filter((t) => !t.assigneeId).length,
      enquiries: active.filter((t) => t.detail.source === 'Enquiry form').length,
    }
  }, [all, now])
  const name = (id?: string) => users.find((u) => u.id === id)?.name

  const columns: Column<HelpTicket>[] = [
    { id: 'no', header: 'Ticket', locked: true, sort: (t) => t.id, cell: (t) => <TicketLink id={t.id} /> },
    { id: 'subject', header: 'Subject', cell: (t) => (
      <div className="min-w-[200px] max-w-[340px]">
        <p className="line-clamp-2 font-medium" title={t.subject}>{t.subject}</p>
        <p className="text-xs text-muted">{t.detail.category}{t.detail.source === 'Enquiry form' && <Badge tone="accent" className="ml-1.5 !py-0">From forms inbox</Badge>}</p>
      </div>
    ) },
    ...(showJournal ? [{ id: 'journal', header: 'Journal', sort: (t: HelpTicket) => t.journal, cell: (t: HelpTicket) => <JournalBadge code={t.journal} /> }] : []),
    { id: 'requester', header: 'Requester', sort: (t) => t.requester, cell: (t) => <span className="whitespace-nowrap">{t.requester}</span> },
    { id: 'priority', header: 'Priority', sort: (t) => PRIORITY_ORDER[t.priority], cell: (t) => <PriorityBadge priority={t.priority} /> },
    { id: 'status', header: 'Status', sort: (t) => t.status, cell: (t) => <TicketStatusBadge status={t.status} /> },
    { id: 'assignee', header: 'Assignee', sort: (t) => name(t.assigneeId) ?? 'zzz', cell: (t) => name(t.assigneeId) ? <span className="whitespace-nowrap">{name(t.assigneeId)}</span> : <span className="text-faint">Unassigned</span> },
    { id: 'source', header: 'Source', sort: (t) => sourceLabel(t.detail.source), cell: (t) => <span className="whitespace-nowrap">{sourceLabel(t.detail.source)}</span> },
    { id: 'paper', header: 'Paper ID', sort: (t) => t.detail.paperId, cell: (t) => <PaperLink id={t.detail.paperId} plain={!canOpenPaper} /> },
    { id: 'sla', header: 'Response timer', sort: (t) => (t.status === 'resolved' ? Number.MAX_SAFE_INTEGER : new Date(t.dueAt).getTime()), cell: (t) => <SlaChip ticket={t} now={now} /> },
  ]

  return (
    <>
      <PageHeader title="Helpdesk tickets" description="Support requests from authors and reviewers, including general enquiries converted from the forms inbox." draft
        actions={<GuardedButton allowed={can('work')} why={why('work')} className="btn-primary" onClick={() => setCreating(true)}><Plus size={15} strokeWidth={1.5} aria-hidden /> New ticket</GuardedButton>} />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active tickets" icon={LifeBuoy} value={stats.open} loading={loading && all.length === 0} />
        <KpiCard label="Response overdue" icon={AlertTriangle} value={stats.breached} tone={stats.breached ? 'danger' : 'default'} hint="SLA breached" loading={loading && all.length === 0} />
        <KpiCard label="Unassigned" icon={Inbox} value={stats.unassigned} tone={stats.unassigned ? 'warning' : 'default'} loading={loading && all.length === 0} />
        <KpiCard label="From enquiry forms" icon={Clock} value={stats.enquiries} loading={loading && all.length === 0} />
      </div>

      <DataTable<HelpTicket>
        id="helpdesk" data={rows} columns={columns} rowKey={(t) => t.id} loading={loading && all.length === 0} error={!!error} onRetry={reload}
        onRowClick={(t) => nav(`/helpdesk/${t.id}`)}
        search={{ placeholder: 'Search ticket, subject or requester', text: (t) => `${t.id} ${t.subject} ${t.requester} ${t.detail.paperId ?? ''}` }}
        views={{ filters, applyFilters: (f) => setFilters({ ...NO_FILTERS, ...(f as Partial<Filters>) }) }}
        rowClassName={(t) => (t.status !== 'resolved' && responseTimer(t, now).tone === 'danger' ? 'bg-red-50/40' : undefined)}
        empty={{ icon: LifeBuoy, title: 'No tickets match', hint: 'Clear filters or create a new ticket.', action: <button className="btn-secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button> }}
        filters={<>
          <SelectFilter label="Status" value={filters.status} onChange={set('status')} options={[{ value: 'open', label: 'Open' }, { value: 'pending', label: 'Pending' }, { value: 'resolved', label: 'Resolved' }]} />
          <SelectFilter label="Priority" value={filters.priority} onChange={set('priority')} options={(['urgent', 'high', 'normal', 'low'] as Ticket['priority'][]).map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
          <SelectFilter label="Assignee" value={filters.assignee} onChange={set('assignee')} options={[{ value: 'me', label: 'Assigned to me' }, { value: 'unassigned', label: 'Unassigned' }]} />
          <SelectFilter label="Source" value={filters.source} onChange={set('source')} options={TICKET_SOURCES.map((s) => ({ value: s, label: s }))} />
        </>}
      />

      <Dialog open={creating} onClose={() => setCreating(false)} title="New ticket" description="Log a request received by phone or in person. It is assigned to you." width={640}
        footer={<><button className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button><button type="submit" form="new-ticket-form" className="btn-primary">Create ticket</button></>}>
        <NewTicketForm journals={journals} onCreated={(id) => { setCreating(false); nav(`/helpdesk/${id}`) }} />
      </Dialog>
    </>
  )
}
