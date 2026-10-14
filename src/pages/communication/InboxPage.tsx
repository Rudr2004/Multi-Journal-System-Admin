import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCheck, CheckCircle2, Clock, Info, Lock, MessageCircle, Search, Send, Ticket, Undo2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge } from '@/components/Badges'
import { Drawer } from '@/components/Dialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useScopeJournals } from '@/lib/scope'
import { cn, initials } from '@/lib/utils'
import { usePermission } from '@/permissions/hooks'
import { formatDateTime, formatRelative, formatTime } from '@/shared/formatters'
import { useDataStore, useSession } from '@/mock/store'
import { useCommStore } from '@/mock/stores/communication'
import {
  INBOX_CHANNEL_LABEL, assignInbox, buildInboxViews, convertToTicket, listInbox, markInboxRead, resolveInbox, sendInboxMessage,
  type InboxChannel,
} from '@/mock/api/inbox'
import { TEMPLATE_EVENTS, paperVars, renderText, sampleVars } from '@/mock/data/communication'
import { QUICK_REPLIES } from '@/mock/data/inbox'
import { formatCountdown, useMedia, useNow } from './hooks'
import { InboxChannelTag, PaperContext, ProposedBadge } from './inboxParts'

type Filter = 'open' | 'unread' | 'resolved'
type ChannelFilter = 'all' | InboxChannel

export function InboxPage() {
  const nav = useNavigate()
  const journals = useScopeJournals()
  const inbox = usePermission('inbox')
  const whatsapp = usePermission('whatsapp')
  const helpdesk = usePermission('helpdesk')
  const canOpenPaper = usePermission('submissions').can('view')
  const canWork = inbox.can('work') || whatsapp.can('work')
  const why = inbox.why('work')
  const flags = useSession((s) => s.flags)
  const { loading, error, reload } = useAsync(() => listInbox(journals), [journals.join()])
  const chats = useDataStore((s) => s.chats)
  const papers = useDataStore((s) => s.papers)
  const users = useDataStore((s) => s.users)
  const threads = useCommStore((s) => s.threads)
  const metas = useCommStore((s) => s.chatMeta)
  const convos = useCommStore((s) => s.inboxConvos)
  const templates = useCommStore((s) => s.templates)
  const paused = useCommStore((s) => s.channelPaused)
  const now = useNow(30_000)
  const isLg = useMedia('(min-width: 1024px)')
  const isXl = useMedia('(min-width: 1280px)')

  const views = useMemo(
    () => buildInboxViews(chats.filter((c) => journals.includes(c.journal)), convos.filter((c) => journals.includes(c.journal)), papers, threads, metas, { email: flags.emailInbox, chat: flags.websiteChat }),
    [chats, convos, papers, threads, metas, journals, flags.emailInbox, flags.websiteChat],
  )
  const [filter, setFilter] = useState<Filter>('open')
  const [channelPick, setChannelPick] = useState<ChannelFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pane, setPane] = useState<'list' | 'thread'>('list')
  const [ctxOpen, setCtxOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [tplId, setTplId] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const channelOn: Record<InboxChannel, boolean> = { whatsapp: true, email: flags.emailInbox, chat: flags.websiteChat }
  const channelFilter: ChannelFilter = channelPick !== 'all' && !channelOn[channelPick] ? 'all' : channelPick

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return views.filter((v) =>
      (channelFilter === 'all' || v.channel === channelFilter) &&
      (filter === 'resolved' ? v.meta.resolved : !v.meta.resolved && (filter === 'open' || v.unread > 0)) &&
      (!q || `${v.name} ${v.contact} ${v.paperId ?? ''} ${v.subject ?? ''} ${v.preview}`.toLowerCase().includes(q)),
    )
  }, [views, filter, channelFilter, query])

  const active = views.find((v) => v.id === selectedId) ?? (isLg ? shown[0] : undefined)
  const activeId = active?.id
  const activeUnread = active?.unread ?? 0
  useEffect(() => { if (active && activeUnread > 0 && (isLg || pane === 'thread')) markInboxRead(active) }, [active, activeId, activeUnread, isLg, pane])
  const threadLen = active?.thread.length ?? 0
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [activeId, threadLen])

  const unreadOf = (c: ChannelFilter) => views.filter((v) => (c === 'all' || v.channel === c) && v.unread > 0 && !v.meta.resolved).length
  const unreadTotal = unreadOf(channelFilter)
  const isWa = active?.channel === 'whatsapp'
  const windowMs = isWa && active?.windowEndsAt ? new Date(active.windowEndsAt).getTime() - now : -1
  const windowOpen = windowMs > 0
  const waTemplates = templates.filter((t) => t.channel === 'whatsapp')
  const tpl = waTemplates.find((t) => t.id === tplId)
  const staff = users.filter((u) => u.status === 'active' && active && ['super_admin', 'editor', 'associate_editor', 'support'].includes(u.assignments[active.journal] ?? ''))
  const vars = active?.paper ? paperVars(active.paper) : sampleVars()
  const tplText = tpl ? renderText(tpl.body, vars) : ''
  const channelPaused = !!active && (active.channel === 'whatsapp' ? paused.whatsapp : active.channel === 'email' ? paused.email : false)
  const blocked = !canWork || channelPaused
  const blockWhy = !canWork ? why : channelPaused ? `${INBOX_CHANNEL_LABEL[active!.channel]} sending is paused in Notification Management.` : undefined

  const send = async (text: string, template?: string) => {
    if (!active || !text.trim()) return
    setBusy(true)
    await sendInboxMessage(active, text.trim(), { template })
    setBusy(false)
    setDraft(''); setTplId('')
    toast.success(template ? `Template “${template}” sent and logged` : active.channel === 'chat' ? 'Reply sent in chat' : 'Message sent and logged in the communication log')
  }
  const open = (id: string) => { if (id !== activeId) { setDraft(''); setTplId('') } setSelectedId(id); setPane('thread') }
  const convert = async () => {
    if (!active) return
    setBusy(true)
    const id = await convertToTicket(active)
    setBusy(false)
    toast.success(`Ticket ${id} created from this ${INBOX_CHANNEL_LABEL[active.channel]} conversation`, { label: 'Open ticket', onClick: () => nav(`/helpdesk/${id}`) })
  }

  const channelTabs: { key: ChannelFilter; label: string; proposed?: boolean }[] = [
    { key: 'all', label: 'All' },
    { key: 'whatsapp', label: 'WhatsApp' },
    ...(flags.emailInbox ? [{ key: 'email' as const, label: 'Email', proposed: true }] : []),
    ...(flags.websiteChat ? [{ key: 'chat' as const, label: 'Chat', proposed: true }] : []),
  ]

  const list = (
    <section aria-label="Conversations" className="flex min-h-0 flex-col border-line lg:border-r">
      <div className="space-y-2 border-b border-line p-3">
        <div role="group" aria-label="Channel" className="flex flex-wrap gap-1.5">
          {channelTabs.map((c) => (
            <button key={c.key} aria-pressed={channelFilter === c.key} onClick={() => setChannelPick(c.key)}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', channelFilter === c.key ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink')}>
              {c.label}
              {unreadOf(c.key) > 0 && <span aria-label={`${unreadOf(c.key)} unread`} className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{unreadOf(c.key)}</span>}
              {c.proposed && <ProposedBadge />}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={15} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input aria-label="Search conversations" className="input pl-8" placeholder="Search name, contact, paper or subject" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div role="group" aria-label="Filter conversations" className="flex rounded-lg border border-line p-0.5 text-sm">
          {([['open', 'Open'], ['unread', `Unread${unreadTotal ? ` (${unreadTotal})` : ''}`], ['resolved', 'Resolved']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn('flex-1 rounded-md px-2 py-1 font-medium', filter === k ? 'bg-accent text-white' : 'text-muted hover:text-ink')}>{l}</button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && <li><EmptyState icon={MessageCircle} title="No conversations" hint={query ? 'Try a different search.' : 'Nothing in this view right now.'} /></li>}
        {shown.map((v) => (
          <li key={v.id}>
            <button onClick={() => open(v.id)} aria-current={v.id === active?.id ? 'true' : undefined}
              className={cn('flex w-full items-start gap-3 border-b border-line px-3 py-3 text-left', v.id === active?.id ? 'bg-accent-soft' : 'hover:bg-page')}>
              <span aria-hidden className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-muted">{v.paper ? initials(v.name) : '#'}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn('truncate text-sm', v.unread ? 'font-semibold' : 'font-medium')}>{v.name}</span>
                  <time dateTime={v.lastAt} className="shrink-0 text-xs text-muted">{formatRelative(v.lastAt, new Date(now))}</time>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-sm', v.unread ? 'text-ink' : 'text-muted')}>{v.preview}</span>
                  {v.unread > 0 && <span aria-label={`${v.unread} unread`} className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{v.unread}</span>}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <InboxChannelTag channel={v.channel} /><JournalBadge code={v.journal} />{v.paperId && <span className="whitespace-nowrap">{v.paperId}</span>}
                  {v.meta.ticketId && <span className="whitespace-nowrap text-accent">{v.meta.ticketId}</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )

  const thread = active ? (
    <section aria-label={`Conversation with ${active.name}`} className="flex min-h-0 min-w-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line bg-surface px-4 py-3">
        <div className="flex min-w-[220px] flex-1 basis-[260px] items-center gap-3">
          {!isLg && <button className="btn-ghost !px-2" aria-label="Back to conversations" onClick={() => setPane('list')}><ArrowLeft size={18} strokeWidth={1.5} /></button>}
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{initials(active.name)}</span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold leading-5">{active.name}</p>
            <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted"><InboxChannelTag channel={active.channel} /><span className="truncate">{active.contact}</span></p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">Assignee
            <select className="input !h-8 !w-auto min-w-[120px]" value={active.meta.assigneeId ?? ''} disabled={!canWork}
              onChange={async (e) => { await assignInbox(active, e.target.value || undefined); toast.success(e.target.value ? `Conversation assigned to ${users.find((u) => u.id === e.target.value)?.name}` : 'Conversation unassigned') }}>
              <option value="">Unassigned</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <GuardedButton allowed={canWork} why={why} className="btn-secondary !h-8 whitespace-nowrap"
            onClick={async () => { await resolveInbox(active, !active.meta.resolved); toast.success(active.meta.resolved ? 'Conversation reopened' : 'Conversation marked resolved') }}>
            {active.meta.resolved ? <><Undo2 size={14} aria-hidden /> Reopen</> : <><CheckCircle2 size={14} aria-hidden /> Mark resolved</>}
          </GuardedButton>
          {active.meta.ticketId
            ? <Link to={`/helpdesk/${active.meta.ticketId}`} className="btn-ghost !h-8 whitespace-nowrap text-accent"><Ticket size={14} aria-hidden /> {active.meta.ticketId}</Link>
            : <GuardedButton allowed={canWork && helpdesk.can('work')} why={!canWork ? why : helpdesk.why('work')} className="btn-secondary !h-8 whitespace-nowrap" disabled={busy} onClick={convert}><Ticket size={14} aria-hidden /> Convert to ticket</GuardedButton>}
          {!isXl && <button className="btn-ghost !h-8 whitespace-nowrap" onClick={() => setCtxOpen(true)}><Info size={15} strokeWidth={1.5} aria-hidden /> Paper</button>}
        </div>
      </header>

      {isWa && (
        <div role="status" className={cn('flex items-center gap-2 border-b px-4 py-2 text-sm', windowOpen ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900')}>
          {windowOpen ? <Clock size={15} strokeWidth={1.5} aria-hidden /> : <Lock size={15} strokeWidth={1.5} aria-hidden />}
          {windowOpen
            ? <span>24-hour window open · <strong className="tabular-nums">{formatCountdown(windowMs, false)}</strong> left to send free-form replies</span>
            : <span>24-hour window closed. Only approved template messages can be sent{active.lastInboundAt ? ` (customer last wrote ${formatDateTime(active.lastInboundAt)})` : ''}.</span>}
        </div>
      )}
      {active.channel === 'email' && active.subject && <p className="border-b border-line px-4 py-2 text-sm"><span className="text-muted">Subject:</span> <span className="font-medium">{active.subject}</span></p>}

      <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4', isWa ? 'bg-[#f4f6f9]' : 'bg-page')} tabIndex={0} aria-label="Messages">
        {active.thread.map((m) => (
          <div key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[70%]', m.direction === 'out' ? (isWa ? 'rounded-tr-sm bg-[#dcf6d6]' : 'rounded-tr-sm bg-accent-soft') : 'rounded-tl-sm bg-white')}>
              <p className="whitespace-pre-wrap break-words leading-6">{m.text}</p>
              <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted">
                {m.template && <Badge tone="success" className="!px-1.5 !py-0 !text-[10px]">Template</Badge>}
                {m.direction === 'out' && m.by ? `${m.by} · ` : ''}<time dateTime={m.at} title={formatDateTime(m.at)}>{formatTime(m.at)}</time>
                {m.direction === 'out' && <CheckCheck size={13} aria-label="Sent" className="text-sky-600" />}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <footer className="border-t border-line p-3">
        {!isWa || windowOpen ? (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Quick replies">
              {QUICK_REPLIES.map((q) => (
                <button key={q.label} disabled={blocked} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:border-accent hover:text-accent disabled:opacity-50" onClick={() => setDraft(q.text)}>{q.label}</button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <label htmlFor="inbox-draft" className="sr-only">Reply</label>
              <textarea id="inbox-draft" rows={2} className="input !h-auto flex-1 py-2" placeholder={blocked ? (blockWhy ?? '') : active.channel === 'email' ? `Reply to ${active.contact}. Ctrl+Enter to send` : 'Type a reply. Ctrl+Enter to send'} disabled={blocked} value={draft}
                onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(draft) } }} />
              <GuardedButton allowed={!blocked} why={blockWhy} className="btn-primary" disabled={!draft.trim() || busy} onClick={() => send(draft)}><Send size={15} strokeWidth={1.5} aria-hidden /> Send</GuardedButton>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <label htmlFor="wa-tpl" className="label">Approved template</label>
            <div className="flex flex-wrap items-start gap-2">
              <select id="wa-tpl" className="input min-w-0 flex-1" value={tplId} disabled={blocked} onChange={(e) => setTplId(e.target.value)}>
                <option value="">Choose a Meta-approved template…</option>
                {waTemplates.map((t) => <option key={t.id} value={t.id}>{TEMPLATE_EVENTS.find((e) => e.key === t.event)?.label}</option>)}
              </select>
              <GuardedButton allowed={!blocked} why={blockWhy} className="btn-primary" disabled={!tpl || busy} onClick={() => tpl && send(tplText, TEMPLATE_EVENTS.find((e) => e.key === tpl.event)?.label)}><Send size={15} strokeWidth={1.5} aria-hidden /> Send template</GuardedButton>
            </div>
            {tpl && <p className="whitespace-pre-wrap rounded-lg bg-subtle px-3 py-2 text-sm text-muted">{tplText}</p>}
            <p className="text-xs text-muted">Free-text replies unlock again when the customer writes to us.</p>
          </div>
        )}
      </footer>
    </section>
  ) : (
    <section className="flex items-center justify-center"><EmptyState icon={MessageCircle} title="Select a conversation" hint="Choose a conversation on the left to read the thread and reply." /></section>
  )

  return (
    <>
      <PageHeader title="Communication Inbox" description="WhatsApp, email and website chat in one place. Replies are logged in the communication log." draft />
      {error ? <div className="card"><ErrorState message="The inbox could not be loaded." onRetry={reload} /></div>
        : loading && views.length === 0 ? <Skeleton className="h-[560px] w-full" />
        : (
          <div className="card grid h-[calc(100vh-230px)] min-h-[560px] grid-cols-1 overflow-hidden lg:grid-cols-[340px_1fr] xl:grid-cols-[340px_1fr_300px]">
            {(isLg || pane === 'list') && list}
            {(isLg || pane === 'thread') && thread}
            {isXl && active && <aside aria-label="Paper context" className="overflow-y-auto border-l border-line"><PaperContext view={active} canWork={canWork} why={why} canOpenPaper={canOpenPaper} /></aside>}
          </div>
        )}
      <Drawer open={ctxOpen && !isXl && !!active} onClose={() => setCtxOpen(false)} title="Paper context" width={380}>
        {active && <PaperContext view={active} canWork={canWork} why={why} canOpenPaper={canOpenPaper} />}
      </Drawer>
    </>
  )
}
