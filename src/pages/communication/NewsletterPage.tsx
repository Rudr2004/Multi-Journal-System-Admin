import { useMemo, useState } from 'react'
import { Download, Mail, MailCheck, MailX, Megaphone, Plus, Users } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge } from '@/components/Badges'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { ConfirmDialog } from '@/components/Dialog'
import { KpiCard } from '@/components/KpiCard'
import { Tabs } from '@/components/Tabs'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useScoped, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { formatDate, formatDateTime } from '@/shared/formatters'
import { useSession } from '@/mock/store'
import { JOURNAL_CODES } from '@/mock/data/core'
import { SUBSCRIBER_SOURCES, type Campaign, type Subscriber } from '@/mock/data/newsletter'
import {
  SUBSCRIBER_STATUS_LABEL, audienceFor, cancelSchedule, exportSubscribers, listCampaigns, listSubscribers, resendConfirmation, unsubscribeSubscribers,
} from '@/mock/api/newsletter'
import { useNewsletterStore } from '@/mock/stores/newsletter'
import { BULK_NOTE, CampaignComposer, DeliveryReportView } from './CampaignViews'
import { CampaignStatusBadge, SubscriberStatusBadge, audienceSummary } from './newsletterParts'

interface Filters { status: string; journal: string; source: string; q: string }
const NO_FILTERS: Filters = { status: '', journal: '', source: '', q: '' }

/* ------------------------------ subscribers ------------------------------ */

function SubscribersTab({ canEdit, why }: { canEdit: boolean; why?: string }) {
  const journals = useScopeJournals()
  const { loading, error, reload } = useAsync(() => listSubscribers(journals), [journals.join()])
  const all = useScoped(useNewsletterStore((s) => s.subscribers))
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [confirm, setConfirm] = useState<{ ids: string[]; clear: () => void } | null>(null)
  const set = (k: keyof Filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }))

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return all.filter((s) =>
      (!filters.status || s.status === filters.status) && (!filters.journal || s.journal === filters.journal) && (!filters.source || s.source === filters.source) &&
      (!q || s.email.toLowerCase().includes(q)))
  }, [all, filters])

  const counts = useMemo(() => ({
    total: all.length,
    confirmed: all.filter((s) => s.status === 'confirmed').length,
    pending: all.filter((s) => s.status === 'pending').length,
    unsub: all.filter((s) => s.status === 'unsubscribed').length,
  }), [all])

  const columns: Column<Subscriber>[] = [
    { id: 'email', header: 'Email', locked: true, sort: (s) => s.email, cell: (s) => <span className="break-all font-medium">{s.email}</span> },
    { id: 'journal', header: 'Journal', sort: (s) => s.journal, cell: (s) => <JournalBadge code={s.journal} /> },
    { id: 'source', header: 'Source', sort: (s) => s.source, cell: (s) => <span className="whitespace-nowrap">{s.source}</span> },
    { id: 'status', header: 'Status', sort: (s) => s.status, cell: (s) => <SubscriberStatusBadge status={s.status} /> },
    { id: 'date', header: 'Subscribed', sort: (s) => s.subscribedAt, cell: (s) => <span className="whitespace-nowrap">{formatDate(s.subscribedAt)}</span> },
  ]

  const doExport = () => {
    if (rows.length === 0) { toast.info('There are no subscribers to export with these filters.'); return }
    exportSubscribers(rows)
    toast.success(`Exported ${rows.length} subscriber${rows.length === 1 ? '' : 's'} to CSV`)
  }

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Subscribers" icon={Users} value={counts.total} loading={loading && all.length === 0} />
        <KpiCard label="Confirmed" icon={MailCheck} value={counts.confirmed} hint="Receive campaigns" loading={loading && all.length === 0} />
        <KpiCard label="Pending confirmation" icon={Mail} value={counts.pending} tone={counts.pending ? 'warning' : 'default'} hint="Have not clicked the link" loading={loading && all.length === 0} />
        <KpiCard label="Unsubscribed" icon={MailX} value={counts.unsub} loading={loading && all.length === 0} />
      </div>
      <DataTable<Subscriber>
        id="newsletter-subscribers" data={rows} columns={columns} rowKey={(s) => s.id} loading={loading && all.length === 0} error={!!error} onRetry={reload}
        selectable views={{ filters, applyFilters: (f) => setFilters({ ...NO_FILTERS, ...(f as Partial<Filters>) }) }}
        empty={{ icon: Mail, title: 'No subscribers match', hint: 'Clear the filters to see everyone.', action: <button className="btn-secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button> }}
        filters={<>
          <div className="relative">
            <label htmlFor="sub-search" className="sr-only">Search subscribers</label>
            <input id="sub-search" type="search" className="input !w-56" placeholder="Search email" value={filters.q} onChange={(e) => set('q')(e.target.value)} />
          </div>
          <SelectFilter label="Status" value={filters.status} onChange={set('status')} options={(['confirmed', 'pending', 'unsubscribed'] as const).map((s) => ({ value: s, label: SUBSCRIBER_STATUS_LABEL[s] }))} />
          <SelectFilter label="Journal" value={filters.journal} onChange={set('journal')} options={JOURNAL_CODES.map((j) => ({ value: j, label: j }))} />
          <SelectFilter label="Source" value={filters.source} onChange={set('source')} options={SUBSCRIBER_SOURCES.map((s) => ({ value: s, label: s }))} />
        </>}
        toolbarRight={<button className="btn-secondary" onClick={doExport}><Download size={15} strokeWidth={1.5} aria-hidden /> Export CSV ({rows.length})</button>}
        bulkActions={(sel, clear) => {
          const unsubscribable = sel.filter((s) => s.status !== 'unsubscribed')
          const pending = sel.filter((s) => s.status === 'pending')
          return (
            <>
              <GuardedButton allowed={canEdit} why={why} className="btn-secondary" disabled={pending.length === 0}
                onClick={async () => { const n = await resendConfirmation(pending.map((s) => s.id)); toast.success(`Confirmation email resent to ${n} subscriber${n === 1 ? '' : 's'}`); clear() }}>
                <MailCheck size={15} strokeWidth={1.5} aria-hidden /> Resend confirmation ({pending.length})
              </GuardedButton>
              <GuardedButton allowed={canEdit} why={why} className="btn-secondary" disabled={unsubscribable.length === 0} onClick={() => setConfirm({ ids: unsubscribable.map((s) => s.id), clear })}>
                <MailX size={15} strokeWidth={1.5} aria-hidden /> Unsubscribe ({unsubscribable.length})
              </GuardedButton>
              <button className="btn-secondary" onClick={() => { exportSubscribers(sel); toast.success(`Exported ${sel.length} selected subscriber${sel.length === 1 ? '' : 's'} to CSV`) }}><Download size={15} strokeWidth={1.5} aria-hidden /> Export selected</button>
            </>
          )
        }}
      />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} danger confirmLabel="Unsubscribe"
        title={`Unsubscribe ${confirm?.ids.length ?? 0} subscriber${confirm?.ids.length === 1 ? '' : 's'}?`}
        consequences={['Stop every future newsletter campaign to these addresses straight away.', 'Not notify the subscribers. They are simply removed from the audience.', 'They can only return by subscribing again on a journal website and confirming by email.']}
        onConfirm={async () => { if (!confirm) return; const n = await unsubscribeSubscribers(confirm.ids); toast.success(`${n} subscriber${n === 1 ? '' : 's'} unsubscribed`); confirm.clear(); setConfirm(null) }} />
    </>
  )
}

/* ------------------------------ campaigns ------------------------------ */

type Mode = { kind: 'list' } | { kind: 'compose'; id?: string } | { kind: 'report'; id: string }

function CampaignsTab({ canEdit, why }: { canEdit: boolean; why?: string }) {
  const { loading, error, reload } = useAsync(listCampaigns, [])
  const campaigns = useNewsletterStore((s) => s.campaigns)
  const subscribers = useNewsletterStore((s) => s.subscribers)
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [status, setStatus] = useState('')
  const rows = useMemo(() => campaigns.filter((c) => !status || c.status === status), [campaigns, status])
  const back = () => setMode({ kind: 'list' })

  if (mode.kind === 'compose') {
    const c = campaigns.find((x) => x.id === mode.id)
    return <CampaignComposer key={mode.id ?? 'new'} campaign={c} canEdit={canEdit} why={why} onBack={back} />
  }
  if (mode.kind === 'report') {
    const c = campaigns.find((x) => x.id === mode.id)
    if (c) return <DeliveryReportView campaign={c} onBack={back} />
  }

  const columns: Column<Campaign>[] = [
    { id: 'subject', header: 'Campaign', locked: true, sort: (c) => c.subject, cell: (c) => <p className="line-clamp-2 min-w-[220px] max-w-[380px] font-medium" title={c.subject}>{c.subject}</p> },
    { id: 'status', header: 'Status', sort: (c) => c.status, cell: (c) => <CampaignStatusBadge status={c.status} /> },
    { id: 'audience', header: 'Audience', cell: (c) => <span className="text-sm text-muted">{audienceSummary(c.audience)}</span> },
    { id: 'recipients', header: 'Recipients', align: 'right', sort: (c) => c.report?.sent ?? audienceFor(c.audience, subscribers).length, cell: (c) => <span className="tabular-nums">{c.report?.sent ?? audienceFor(c.audience, subscribers).length}</span> },
    { id: 'when', header: 'Date', sort: (c) => c.sentAt ?? c.scheduledAt ?? c.updatedAt, cell: (c) => <span className="whitespace-nowrap text-sm">{c.status === 'sent' ? `Sent ${formatDateTime(c.sentAt!)}` : c.status === 'scheduled' ? `Goes out ${formatDateTime(c.scheduledAt!)}` : `Edited ${formatDate(c.updatedAt)}`}</span> },
    { id: 'actions', header: '', mobileHide: true, cell: (c) => (
      <div className="flex justify-end gap-1.5">
        {c.status === 'sent' && <button className="btn-secondary !h-8" onClick={() => setMode({ kind: 'report', id: c.id })}>Delivery report</button>}
        {c.status === 'scheduled' && <GuardedButton allowed={canEdit} why={why} className="btn-secondary !h-8" onClick={async () => { await cancelSchedule(c.id); toast.success('Schedule cancelled. The campaign is a draft again.') }}>Cancel schedule</GuardedButton>}
        {c.status !== 'sent' && <button className="btn-secondary !h-8" onClick={() => setMode({ kind: 'compose', id: c.id })}>Edit</button>}
      </div>
    ) },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p role="note" className="flex items-center gap-2 text-sm text-muted"><Badge tone="accent">Proposed</Badge>{BULK_NOTE}</p>
        <GuardedButton allowed={canEdit} why={why} className="btn-primary" onClick={() => setMode({ kind: 'compose' })}><Plus size={15} strokeWidth={1.5} aria-hidden /> New campaign</GuardedButton>
      </div>
      <DataTable<Campaign>
        id="newsletter-campaigns" data={rows} columns={columns} rowKey={(c) => c.id} loading={loading && campaigns.length === 0} error={!!error} onRetry={reload}
        onRowClick={(c) => setMode(c.status === 'sent' ? { kind: 'report', id: c.id } : { kind: 'compose', id: c.id })}
        search={{ placeholder: 'Search campaigns', text: (c) => c.subject }}
        empty={{ icon: Megaphone, title: 'No campaigns yet', hint: 'Compose your first newsletter.', action: <button className="btn-secondary" onClick={() => setMode({ kind: 'compose' })}>New campaign</button> }}
        filters={<SelectFilter label="Status" value={status} onChange={setStatus} options={[{ value: 'draft', label: 'Draft' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'sent', label: 'Sent' }]} />}
      />
    </>
  )
}

/* ------------------------------ page ------------------------------ */

export function NewsletterPage() {
  const { can, why } = usePermission('newsletter')
  const canEdit = can('manage')
  const campaignsOn = useSession((s) => s.flags.newsletterCampaigns)
  const [tab, setTab] = useState('subscribers')
  const effective = tab === 'campaigns' && !campaignsOn ? 'subscribers' : tab
  const w = why('manage')
  return (
    <>
      <PageHeader title="Newsletter Subscribers" description="Everyone who subscribed on a journal website, with their confirmation status." />
      <Tabs value={effective} onChange={setTab} tabs={[
        { id: 'subscribers', label: 'Subscribers', content: <SubscribersTab canEdit={canEdit} why={w} /> },
        ...(campaignsOn ? [{ id: 'campaigns', label: 'Campaigns', badge: 'Proposed', content: <CampaignsTab canEdit={canEdit} why={w} /> }] : []),
      ]} />
    </>
  )
}
