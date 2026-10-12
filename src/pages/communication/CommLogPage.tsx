import { useMemo, useState } from 'react'
import { subDays, subHours } from 'date-fns'
import { AlertTriangle, CheckCircle2, Eye, MessagesSquare, RotateCw, Send } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge } from '@/components/Badges'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Drawer } from '@/components/Dialog'
import { EmailPreview } from '@/components/EmailPreview'
import { DescriptionList } from '@/components/Form'
import { KpiCard } from '@/components/KpiCard'
import { RelativeTime } from '@/components/Time'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { formatDateTime, formatPercent } from '@/shared/formatters'
import type { Channel, JournalCode, MessageStatus } from '@/shared/types'
import { listMessageLog, renderLoggedMessage, resendMessage, type LogRow } from '@/mock/api/communication'
import { TEMPLATE_EVENTS } from '@/mock/data/communication'
import { CHANNEL_LABEL, ChannelBadge, MessageStatusBadge, PaperLink } from './parts'

interface Filters { channel: string; status: string; template: string; range: string; journal: string }
const NO_FILTERS: Filters = { channel: '', status: '', template: '', range: '', journal: '' }

const RANGES: Record<string, (now: Date) => Date> = {
  '24h': (n) => subHours(n, 24),
  '3d': (n) => subDays(n, 3),
  '7d': (n) => subDays(n, 7),
}

function Bubble({ text, tone }: { text: string; tone: 'sms' | 'whatsapp' }) {
  return (
    <div className={tone === 'whatsapp' ? 'rounded-lg bg-[#e7f6e4] p-3' : 'rounded-lg bg-slate-100 p-3'}>
      <p className="whitespace-pre-wrap rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm leading-6 shadow-sm">{text}</p>
    </div>
  )
}

export function CommLogPage() {
  const journals = useScopeJournals()
  const showJournal = useIsAllJournals()
  const { can, why } = usePermission('commLog')
  const canResend = can('work')
  const { data, loading, error, reload } = useAsync(() => listMessageLog(journals), [journals.join()])
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [openId, setOpenId] = useState<string | null>(null)
  const [resending, setResending] = useState<string | null>(null)
  const set = (k: keyof Filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }))

  const rows = useMemo(() => {
    const now = new Date()
    return (data ?? []).filter((m) =>
      (!filters.channel || m.channel === filters.channel) &&
      (!filters.status || m.status === filters.status) &&
      (!filters.template || m.template === filters.template) &&
      (!filters.journal || m.journal === filters.journal) &&
      (!filters.range || new Date(m.at) >= RANGES[filters.range](now)),
    )
  }, [data, filters])

  const stats = useMemo(() => {
    const all = data ?? []
    const failed = all.filter((m) => m.status === 'failed' && !m.resolved).length
    const done = all.filter((m) => m.status !== 'queued')
    const ok = done.filter((m) => m.status !== 'failed' || m.resolved).length
    return { failed, queued: all.filter((m) => m.status === 'queued').length, rate: done.length ? (ok / done.length) * 100 : 0, total: all.length }
  }, [data])

  const open = data?.find((m) => m.id === openId)

  const resend = async (m: LogRow) => {
    setResending(m.id)
    try {
      await resendMessage(m.id)
      toast.success(`${CHANNEL_LABEL[m.channel]} message re-sent to ${m.recipient}. The failure is marked resolved.`)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not re-send the message')
    } finally {
      setResending(null)
    }
  }

  const templates = useMemo(() => [...new Set([...TEMPLATE_EVENTS.map((e) => e.label), ...(data ?? []).map((m) => m.template)])].sort(), [data])

  const columns: Column<LogRow>[] = [
    { id: 'paper', header: 'Paper ID', locked: true, sort: (m) => m.paperId, cell: (m) => <PaperLink id={m.paperId} /> },
    ...(showJournal ? [{ id: 'journal', header: 'Journal', sort: (m: LogRow) => m.journal, cell: (m: LogRow) => <JournalBadge code={m.journal} /> }] : []),
    { id: 'recipient', header: 'Recipient', sort: (m) => m.recipient, cell: (m) => <span className="whitespace-nowrap">{m.recipient}</span> },
    { id: 'channel', header: 'Channel', sort: (m) => m.channel, cell: (m) => <ChannelBadge channel={m.channel} /> },
    { id: 'template', header: 'Template', sort: (m) => m.template, cell: (m) => <span className="whitespace-nowrap">{m.template}</span> },
    { id: 'time', header: 'Time', sort: (m) => m.at, cell: (m) => <span className="whitespace-nowrap text-muted"><RelativeTime value={m.at} /></span> },
    {
      id: 'status', header: 'Status', sort: (m) => m.status,
      cell: (m) => (
        <div className="max-w-[260px]">
          <MessageStatusBadge status={m.status} />
          {m.status === 'failed' && m.failureReason && <p className="mt-1 text-xs text-red-700">{m.failureReason}</p>}
          {m.resolved && <p className="mt-1 flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={12} aria-hidden /> Resolved by re-send</p>}
        </div>
      ),
    },
    {
      id: 'actions', header: 'Actions', locked: true,
      cell: (m) => (
        <div className="flex items-center gap-1" data-no-row-click>
          <button className="btn-ghost !px-2" aria-label={`View message ${m.id}`} onClick={() => setOpenId(m.id)}><Eye size={16} strokeWidth={1.5} /></button>
          {m.status === 'failed' && !m.resolved && (
            <GuardedButton allowed={canResend} why={why('work')} className="btn-secondary !h-8" disabled={resending === m.id} onClick={() => resend(m)}>
              <RotateCw size={14} strokeWidth={1.5} aria-hidden /> {resending === m.id ? 'Sending…' : 'Resend'}
            </GuardedButton>
          )}
        </div>
      ),
    },
  ]

  const rendered = open ? renderLoggedMessage(open) : undefined

  return (
    <>
      <PageHeader title="Communication log" description="Every email, SMS and WhatsApp message sent to authors, reviewers and editors, with delivery status." />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Messages logged" icon={MessagesSquare} value={stats.total} loading={loading && !data} />
        <KpiCard label="Failed, needs action" icon={AlertTriangle} value={stats.failed} tone={stats.failed ? 'danger' : 'default'} loading={loading && !data} hint="Resend from the row" />
        <KpiCard label="Queued" icon={Send} value={stats.queued} loading={loading && !data} />
        <KpiCard label="Delivery success" icon={CheckCircle2} value={formatPercent(stats.rate)} loading={loading && !data} hint="Excluding queued" />
      </div>

      <DataTable<LogRow>
        id="comm-log"
        data={rows}
        columns={columns}
        rowKey={(m) => m.id}
        loading={loading && !data}
        error={!!error}
        onRetry={reload}
        onRowClick={(m) => setOpenId(m.id)}
        search={{ placeholder: 'Search paper ID, recipient or template', text: (m) => `${m.paperId ?? ''} ${m.recipient} ${m.template} ${m.failureReason ?? ''}` }}
        views={{ filters, applyFilters: (f) => setFilters({ ...NO_FILTERS, ...(f as Partial<Filters>) }) }}
        rowClassName={(m) => (m.status === 'failed' && !m.resolved ? 'bg-red-50/70 hover:!bg-red-50' : undefined)}
        empty={{ icon: MessagesSquare, title: 'No messages match these filters', hint: 'Clear a filter or widen the date range.', action: <button className="btn-secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button> }}
        filters={
          <>
            <SelectFilter label="Channel" value={filters.channel} onChange={set('channel')} options={(['email', 'sms', 'whatsapp'] as Channel[]).map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))} />
            <SelectFilter label="Status" value={filters.status} onChange={set('status')} options={(['queued', 'sent', 'delivered', 'failed'] as MessageStatus[]).map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
            <SelectFilter label="Template" value={filters.template} onChange={set('template')} options={templates.map((t) => ({ value: t, label: t }))} />
            <SelectFilter label="Date" value={filters.range} onChange={set('range')} options={[{ value: '24h', label: 'Last 24 hours' }, { value: '3d', label: 'Last 3 days' }, { value: '7d', label: 'Last 7 days' }]} />
            {journals.length > 1 && <SelectFilter label="Journal" value={filters.journal} onChange={set('journal')} options={journals.map((j: JournalCode) => ({ value: j, label: j }))} />}
          </>
        }
      />

      <Drawer open={!!open} onClose={() => setOpenId(null)} title="Message details" width={560}>
        {open && rendered && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <MessageStatusBadge status={open.status} />
              {open.resolved && <Badge tone="success">Resolved by re-send</Badge>}
              <span className="text-xs text-muted">Log ID {open.id}</span>
            </div>

            {open.status === 'failed' && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-red-800"><AlertTriangle size={16} strokeWidth={1.5} aria-hidden /> Delivery failed</p>
                <p className="mt-1 text-red-700">{open.failureReason ?? 'The provider rejected the message.'}</p>
                {open.resolved ? (
                  <p className="mt-2 text-green-800">Re-sent by {open.resolved.by} <RelativeTime value={open.resolved.at} />. See the new entry in the log.</p>
                ) : (
                  <div className="mt-3">
                    <GuardedButton allowed={canResend} why={why('work')} className="btn-primary" disabled={resending === open.id} onClick={() => resend(open)}>
                      <RotateCw size={15} strokeWidth={1.5} aria-hidden /> {resending === open.id ? 'Sending…' : `Resend ${CHANNEL_LABEL[open.channel]} message`}
                    </GuardedButton>
                  </div>
                )}
              </div>
            )}

            <DescriptionList cols={2} items={[
              { label: 'Paper ID', value: <PaperLink id={open.paperId} /> },
              { label: 'Journal', value: <JournalBadge code={open.journal} /> },
              { label: 'Recipient', value: open.recipient },
              { label: 'Channel', value: <ChannelBadge channel={open.channel} /> },
              { label: 'Template', value: open.template },
              { label: 'Time', value: formatDateTime(open.at) },
            ]} />
            {open.paperTitle && <p className="text-sm text-muted" title={open.paperTitle}>{open.paperTitle}</p>}

            <div>
              <h3 className="mb-2 text-sm font-semibold">Message content</h3>
              {open.channel === 'email' ? (
                <EmailPreview from={rendered.from} to={rendered.to} subject={rendered.subject ?? open.template} body={rendered.body} />
              ) : (
                <>
                  <p className="mb-2 text-xs text-muted">From {rendered.from} to {rendered.to}</p>
                  <Bubble text={rendered.body} tone={open.channel === 'whatsapp' ? 'whatsapp' : 'sms'} />
                  {rendered.meta && <p className="mt-2 text-xs text-muted">{rendered.meta}</p>}
                  {open.channel === 'sms' && <p className="mt-1 text-xs text-muted">{rendered.body.length} characters</p>}
                </>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  )
}
