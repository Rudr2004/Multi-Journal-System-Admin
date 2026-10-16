import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, Megaphone, Pencil, Pin, Plus, SquareX, Trash2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Tabs } from '@/components/Tabs'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { ConfirmDialog } from '@/components/Dialog'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { formatDateTime } from '@/shared/formatters'
import type { Tone } from '@/shared/statuses'
import { ANNOUNCEMENT_TYPES, announcementStatus, type Announcement, type AnnouncementChannel, type AnnouncementStatus } from '@/mock/data/website'
import { deleteAnnouncement, endAnnouncement, listAnnouncements } from '@/mock/api/announcements'
import { useJournalKey } from '../shared'
import { AnnouncementDrawer } from './AnnouncementDrawer'

const STATUS: Record<AnnouncementStatus, { label: string; tone: Tone }> = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  live: { label: 'Live', tone: 'success' },
  expired: { label: 'Expired', tone: 'neutral' },
}

function ChannelTable({ channel, data, loading, error, reload }: { channel: AnnouncementChannel; data: Announcement[] | undefined; loading: boolean; error: unknown; reload: () => void }) {
  const { journals } = useJournalKey()
  const all = useIsAllJournals()
  const { can, why } = usePermission('announcements')
  const canEdit = can('work')
  const noun = channel === 'scrolling' ? 'scrolling notification' : 'tab notification'
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [drawer, setDrawer] = useState<{ item?: Announcement } | null>(null)
  const [ending, setEnding] = useState<Announcement | null>(null)
  const [deleting, setDeleting] = useState<Announcement | null>(null)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const typeOptions = useMemo(() => [...new Set([...ANNOUNCEMENT_TYPES as readonly string[], ...(data ?? []).filter((a) => a.channel === channel).map((a) => a.type)])], [data, channel])
  const rows = useMemo(() => {
    return (data ?? []).filter((a) => a.channel === channel).map((a) => ({ a, s: announcementStatus(a, now) })).filter((r) => (!status || r.s === status) && (!type || r.a.type === type))
  }, [data, status, type, now, channel])

  const counts = useMemo(() => {
    const c = { scheduled: 0, live: 0, expired: 0 }
    for (const a of data ?? []) if (a.channel === channel) c[announcementStatus(a, now)]++
    return c
  }, [data, now, channel])

  const run = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast.success(ok); reload() } catch (e) { toast.error((e as Error).message) }
  }

  type Row = (typeof rows)[number]
  const columns: Column<Row>[] = [
    {
      id: 'title', header: 'Announcement', locked: true, sort: (r) => r.a.title.toLowerCase(),
      cell: ({ a }) => (
        <div className="min-w-0 max-w-[420px]">
          <p className="flex items-start gap-1.5 font-medium">
            {a.pinned && <Pin size={14} strokeWidth={1.5} className="mt-1 shrink-0 text-accent" aria-label="Pinned" />}
            <span className="line-clamp-2" title={a.title}>{a.title}</span>
          </p>
          {a.body && <p className="line-clamp-1 text-xs text-muted" title={a.body}>{a.body}</p>}
        </div>
      ),
    },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (r: Row) => r.a.journal, cell: (r: Row) => <JournalBadge code={r.a.journal} /> }] : []),
    { id: 'type', header: 'Type', sort: (r) => r.a.type, cell: ({ a }) => <Badge tone="accent">{a.type}</Badge> },
    {
      id: 'flags', header: 'Display', mobileHide: true,
      cell: ({ a }) => (
        <div className="flex flex-wrap gap-1">
          {a.highlight && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">Highlighted</span>}
          {a.link && <span className="rounded bg-subtle px-1.5 py-0.5 text-xs text-muted" title={a.link}>Has link</span>}
          {!a.highlight && !a.link && <span className="text-xs text-faint">Plain</span>}
        </div>
      ),
    },
    {
      id: 'when', header: 'Schedule', sort: (r) => r.a.startAt,
      cell: ({ a }) => (
        <div className="whitespace-nowrap text-xs">
          <p><span className="text-muted">From</span> {formatDateTime(a.startAt)}</p>
          <p><span className="text-muted">To</span> {a.endAt ? formatDateTime(a.endAt) : 'No end date'}</p>
        </div>
      ),
    },
    { id: 'email', header: 'Email', defaultHidden: true, cell: ({ a }) => (a.emailSubscribers ? 'To subscribers' : '—') },
    { id: 'status', header: 'Status', sort: (r) => r.s, cell: ({ s }) => <Badge tone={STATUS[s].tone}>{STATUS[s].label}</Badge> },
    {
      id: 'actions', header: '', locked: true,
      cell: ({ a, s }) => (
        <div className="flex justify-end gap-1">
          <GuardedButton allowed={canEdit} why={why('work')} className="btn-ghost h-8 px-2" aria-label={`Edit ${a.title}`} onClick={() => setDrawer({ item: a })}><Pencil size={15} strokeWidth={1.5} /></GuardedButton>
          {s === 'live' && <GuardedButton allowed={canEdit} why={why('work')} className="btn-ghost h-8 px-2" aria-label={`End ${a.title} now`} onClick={() => setEnding(a)}><SquareX size={15} strokeWidth={1.5} /></GuardedButton>}
          <GuardedButton allowed={can('manage')} why={why('manage')} className="btn-ghost h-8 px-2 hover:!text-red-600" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a)}><Trash2 size={15} strokeWidth={1.5} /></GuardedButton>
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted" aria-live="polite">
          <span><span className="font-semibold text-ink tabular-nums">{counts.live}</span> live</span>
          <span><span className="font-semibold text-ink tabular-nums">{counts.scheduled}</span> scheduled</span>
          <span><span className="font-semibold text-ink tabular-nums">{counts.expired}</span> expired</span>
        </p>
        <GuardedButton allowed={canEdit && journals.length > 0} why={why('work')} className="btn-primary" onClick={() => setDrawer({})}><Plus size={15} strokeWidth={1.5} aria-hidden /> New {noun}</GuardedButton>
      </div>
      <DataTable<Row>
        id={`announcements-${channel}`} data={rows} columns={columns} rowKey={(r) => r.a.id} loading={loading && !data} error={!!error} onRetry={reload}
        search={{ placeholder: 'Search notifications…', text: (r) => `${r.a.title} ${r.a.body} ${r.a.type}` }}
        filters={<>
          <SelectFilter label="Status" value={status} onChange={setStatus} options={Object.entries(STATUS).map(([value, m]) => ({ value, label: m.label }))} />
          <SelectFilter label="Type" value={type} onChange={setType} options={typeOptions.map((t) => ({ value: t, label: t }))} />
        </>}
        empty={{ icon: Megaphone, title: `No ${noun}s match`, hint: 'Post a call for papers, deadline extension or maintenance notice.', action: <button className="btn-primary" onClick={() => setDrawer({})}><CalendarClock size={15} aria-hidden /> New {noun}</button> }}
      />
      <AnnouncementDrawer open={!!drawer} onClose={() => setDrawer(null)} announcement={drawer?.item} channel={channel} onSaved={reload} />
      <ConfirmDialog open={!!ending} onClose={() => setEnding(null)} title={`End “${ending?.title ?? ''}” now?`} confirmLabel="End now"
        consequences={[`Remove it from the ${ending?.journal ?? ''} website immediately`, 'Mark it as Expired with today as the end date', 'Emails already sent to subscribers cannot be recalled']}
        onConfirm={() => ending && run(() => endAnnouncement(ending.id), 'Announcement ended.')} />
      <ConfirmDialog open={!!deleting} danger onClose={() => setDeleting(null)} title={`Delete “${deleting?.title ?? ''}”?`} confirmLabel="Delete"
        consequences={[`Remove it from the ${deleting?.journal ?? ''} website and the history here`, 'Not affect other journals it was posted to together', 'This cannot be undone']}
        onConfirm={() => deleting && run(() => deleteAnnouncement(deleting.id), 'Announcement deleted.')} />
    </>
  )
}

export default function AnnouncementsPage() {
  const { journals, key } = useJournalKey()
  const [params, setParams] = useSearchParams()
  const tab: AnnouncementChannel = params.get('tab') === 'tab' ? 'tab' : 'scrolling'
  const { data, loading, error, reload } = useAsync(() => listAnnouncements(journals), [key])
  const count = (c: AnnouncementChannel) => (data ?? []).filter((a) => a.channel === c && announcementStatus(a) === 'live').length
  return (
    <>
      <PageHeader title="Announcements" description="News, calls for papers and deadlines on the journal websites. Status follows the start and end dates automatically." />
      <Tabs value={tab} onChange={(t) => setParams(t === 'tab' ? { tab: 'tab' } : {}, { replace: true })}
        tabs={[
          { id: 'scrolling', label: 'Scrolling Notifications', badge: count('scrolling'), content: <ChannelTable channel="scrolling" data={data} loading={loading} error={error} reload={reload} /> },
          {
            id: 'tab', label: 'Tab Notifications', badge: count('tab'),
            content: (
              <>
                <p className="mb-3 flex items-center gap-2 text-sm text-muted"><Badge tone="warning">To confirm</Badge> Notices shown in the Notices tab on the website home page. This is our reading of "tab notifications"; please confirm.</p>
                <ChannelTable channel="tab" data={data} loading={loading} error={error} reload={reload} />
              </>
            ),
          },
        ]} />
    </>
  )
}
