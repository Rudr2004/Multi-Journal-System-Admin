import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCheck, CheckCircle2, Clock, ExternalLink, Info, Lock, MessageCircle, Search, Send, Undo2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { Drawer } from '@/components/Dialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useScopeJournals } from '@/lib/scope'
import { cn, initials } from '@/lib/utils'
import { usePermission } from '@/permissions/hooks'
import { formatDateTime, formatRelative, formatTime } from '@/shared/formatters'
import { useDataStore } from '@/mock/store'
import { useCommStore } from '@/mock/stores/communication'
import { assignChat, buildChatViews, linkChatPaper, listChats, markChatRead, sendChatMessage, setChatResolved, type ChatView } from '@/mock/api/whatsapp'
import { TEMPLATE_EVENTS, WHATSAPP_QUICK_REPLIES, paperVars, renderText, sampleVars } from '@/mock/data/communication'
import { formatCountdown, useMedia, useNow } from './hooks'

type Filter = 'open' | 'unread' | 'resolved'

function PaperContext({ view, canWork, why }: { view: ChatView; canWork: boolean; why?: string }) {
  const [paperId, setPaperId] = useState('')
  const [err, setErr] = useState('')
  const p = view.paper
  const link = async () => {
    const ok = await linkChatPaper(view.chat.id, paperId)
    if (ok) { toast.success(`Chat linked to ${paperId.trim().toUpperCase()}`); setPaperId(''); setErr('') } else setErr('No paper with that ID. Check the ID and try again.')
  }
  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-semibold">Paper context</h3>
      {p ? (
        <>
          <div>
            <Link to={`/submissions/${p.id}`} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent hover:underline">{p.id} <ExternalLink size={13} aria-hidden /></Link>
            <p className="mt-1 text-sm text-muted" title={p.title}>{p.title}</p>
          </div>
          <dl className="space-y-2.5 text-sm">
            <div><dt className="text-xs text-muted">Status</dt><dd className="mt-0.5"><StatusBadge status={p.status} /></dd></div>
            <div><dt className="text-xs text-muted">Payment</dt><dd className="mt-0.5 capitalize">{p.paymentStatus === 'none' ? 'Not applicable' : p.paymentStatus === 'verification' ? 'Awaiting verification' : p.paymentStatus}</dd></div>
            <div><dt className="text-xs text-muted">Author</dt><dd className="mt-0.5">{p.author}<br /><span className="text-muted">{p.authorEmail}</span></dd></div>
            <div><dt className="text-xs text-muted">Journal</dt><dd className="mt-0.5"><JournalBadge code={p.journal} /></dd></div>
          </dl>
          <Link to={`/submissions/${p.id}`} className="btn-secondary w-full">Open submission</Link>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-line p-3">
          <p className="text-sm text-muted">This number is not linked to a paper yet. Enter the Paper ID the author mentions.</p>
          <label htmlFor="link-paper" className="label mt-3">Paper ID</label>
          <input id="link-paper" className="input" placeholder="IJMAT2026000113" value={paperId} disabled={!canWork} aria-invalid={!!err} onChange={(e) => setPaperId(e.target.value)} />
          {err && <p role="alert" className="mt-1 text-xs text-red-600">{err}</p>}
          <GuardedButton allowed={canWork} why={why} className="btn-secondary mt-2 w-full" disabled={!paperId.trim()} onClick={link}>Link paper</GuardedButton>
        </div>
      )}
    </div>
  )
}

export function WhatsAppPage() {
  const journals = useScopeJournals()
  const { can, why } = usePermission('whatsapp')
  const canWork = can('work')
  const { loading, error, reload } = useAsync(() => listChats(journals), [journals.join()])
  const chats = useDataStore((s) => s.chats)
  const papers = useDataStore((s) => s.papers)
  const users = useDataStore((s) => s.users)
  const threads = useCommStore((s) => s.threads)
  const metas = useCommStore((s) => s.chatMeta)
  const templates = useCommStore((s) => s.templates)
  const paused = useCommStore((s) => s.channelPaused.whatsapp)
  const now = useNow(30_000)
  const isLg = useMedia('(min-width: 1024px)')
  const isXl = useMedia('(min-width: 1280px)')

  const views = useMemo(() => buildChatViews(chats.filter((c) => journals.includes(c.journal)), papers, threads, metas), [chats, papers, threads, metas, journals])
  const [filter, setFilter] = useState<Filter>('open')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pane, setPane] = useState<'list' | 'thread'>('list')
  const [ctxOpen, setCtxOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [tplId, setTplId] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return views.filter((v) =>
      (filter === 'resolved' ? v.meta.resolved : !v.meta.resolved && (filter === 'open' || v.chat.unread > 0)) &&
      (!q || `${v.name} ${v.chat.contact} ${v.chat.paperId ?? ''} ${v.preview}`.toLowerCase().includes(q)),
    )
  }, [views, filter, query])

  const active = views.find((v) => v.chat.id === selectedId) ?? (isLg ? shown[0] : undefined)
  const activeId = active?.chat.id
  const activeUnread = active?.chat.unread ?? 0
  useEffect(() => { if (activeId && activeUnread > 0 && (isLg || pane === 'thread')) markChatRead(activeId) }, [activeId, activeUnread, isLg, pane])
  const threadLen = active?.thread.length ?? 0
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [activeId, threadLen])

  const unreadTotal = views.filter((v) => v.chat.unread > 0 && !v.meta.resolved).length
  const windowMs = active?.windowEndsAt ? new Date(active.windowEndsAt).getTime() - now : -1
  const windowOpen = windowMs > 0
  const waTemplates = templates.filter((t) => t.channel === 'whatsapp')
  const tpl = waTemplates.find((t) => t.id === tplId)
  const staff = users.filter((u) => u.status === 'active' && active && ['super_admin', 'editor', 'associate_editor', 'support'].includes(u.assignments[active.chat.journal] ?? ''))
  const vars = active?.paper ? paperVars(active.paper) : sampleVars()
  const tplText = tpl ? renderText(tpl.body, vars) : ''

  const send = async (text: string, template?: string) => {
    if (!active || !text.trim()) return
    setSending(true)
    await sendChatMessage(active.chat.id, text.trim(), { template })
    setSending(false)
    setDraft(''); setTplId('')
    toast.success(template ? `Template “${template}” sent and logged` : 'Message sent and logged in the communication log')
  }
  const blocked = !canWork || paused
  const blockWhy = !canWork ? why('work') : paused ? 'WhatsApp sending is paused in Templates & schedule.' : undefined
  const open = (id: string) => { if (id !== activeId) { setDraft(''); setTplId('') } setSelectedId(id); setPane('thread') }

  const list = (
    <section aria-label="Conversations" className="flex min-h-0 flex-col border-line lg:border-r">
      <div className="space-y-2 border-b border-line p-3">
        <div className="relative">
          <Search size={15} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input aria-label="Search conversations" className="input pl-8" placeholder="Search name, number or paper" value={query} onChange={(e) => setQuery(e.target.value)} />
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
          <li key={v.chat.id}>
            <button onClick={() => open(v.chat.id)} aria-current={v.chat.id === active?.chat.id ? 'true' : undefined}
              className={cn('flex w-full items-start gap-3 border-b border-line px-3 py-3 text-left', v.chat.id === active?.chat.id ? 'bg-accent-soft' : 'hover:bg-page')}>
              <span aria-hidden className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-muted">{v.paper ? initials(v.name) : '#'}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn('truncate text-sm', v.chat.unread ? 'font-semibold' : 'font-medium')}>{v.name}</span>
                  <time dateTime={v.lastAt} className="shrink-0 text-xs text-muted">{formatRelative(v.lastAt, new Date(now))}</time>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={cn('truncate text-sm', v.chat.unread ? 'text-ink' : 'text-muted')}>{v.preview}</span>
                  {v.chat.unread > 0 && <span aria-label={`${v.chat.unread} unread`} className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{v.chat.unread}</span>}
                </span>
                <span className="mt-1 flex items-center gap-2 text-xs text-muted"><JournalBadge code={v.chat.journal} />{v.chat.paperId && <span className="whitespace-nowrap">{v.chat.paperId}</span>}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )

  const thread = active ? (
    <section aria-label={`Conversation with ${active.name}`} className="flex min-h-0 min-w-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3">
        {!isLg && <button className="btn-ghost !px-2" aria-label="Back to conversations" onClick={() => setPane('list')}><ArrowLeft size={18} strokeWidth={1.5} /></button>}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{active.name}</p>
          <p className="text-xs text-muted">{active.chat.contact}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">Assignee
          <select className="input !h-8 !w-auto" value={active.meta.assigneeId ?? ''} disabled={!canWork}
            onChange={async (e) => { await assignChat(active.chat.id, e.target.value || undefined); toast.success(e.target.value ? `Chat assigned to ${users.find((u) => u.id === e.target.value)?.name}` : 'Chat unassigned') }}>
            <option value="">Unassigned</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <GuardedButton allowed={canWork} why={why('work')} className="btn-secondary !h-8"
          onClick={async () => { await setChatResolved(active.chat.id, !active.meta.resolved); toast.success(active.meta.resolved ? 'Conversation reopened' : 'Conversation marked resolved') }}>
          {active.meta.resolved ? <><Undo2 size={14} aria-hidden /> Reopen</> : <><CheckCircle2 size={14} aria-hidden /> Mark resolved</>}
        </GuardedButton>
        {!isXl && <button className="btn-ghost !h-8" onClick={() => setCtxOpen(true)}><Info size={15} strokeWidth={1.5} aria-hidden /> Paper</button>}
      </header>

      <div role="status" className={cn('flex items-center gap-2 border-b px-4 py-2 text-sm', windowOpen ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900')}>
        {windowOpen ? <Clock size={15} strokeWidth={1.5} aria-hidden /> : <Lock size={15} strokeWidth={1.5} aria-hidden />}
        {windowOpen
          ? <span>24-hour window open · <strong className="tabular-nums">{formatCountdown(windowMs, false)}</strong> left to send free-form replies</span>
          : <span>24-hour window closed. Only approved template messages can be sent{active.lastInboundAt ? ` (customer last wrote ${formatDateTime(active.lastInboundAt)})` : ''}.</span>}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f4f6f9] px-4 py-4" tabIndex={0} aria-label="Messages">
        {active.thread.map((m) => (
          <div key={m.id} className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[70%]', m.direction === 'out' ? 'rounded-tr-sm bg-[#dcf6d6]' : 'rounded-tl-sm bg-white')}>
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
        {windowOpen ? (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Quick replies">
              {WHATSAPP_QUICK_REPLIES.map((q) => (
                <button key={q.label} disabled={blocked} className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:border-accent hover:text-accent disabled:opacity-50" onClick={() => setDraft(q.text)}>{q.label}</button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <label htmlFor="wa-draft" className="sr-only">Reply</label>
              <textarea id="wa-draft" rows={2} className="input !h-auto flex-1 py-2" placeholder={blocked ? (blockWhy ?? '') : 'Type a reply. Ctrl+Enter to send'} disabled={blocked} value={draft}
                onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(draft) } }} />
              <GuardedButton allowed={!blocked} why={blockWhy} className="btn-primary" disabled={!draft.trim() || sending} onClick={() => send(draft)}><Send size={15} strokeWidth={1.5} aria-hidden /> Send</GuardedButton>
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
              <GuardedButton allowed={!blocked} why={blockWhy} className="btn-primary" disabled={!tpl || sending} onClick={() => tpl && send(tplText, TEMPLATE_EVENTS.find((e) => e.key === tpl.event)?.label)}><Send size={15} strokeWidth={1.5} aria-hidden /> Send template</GuardedButton>
            </div>
            {tpl && <p className="whitespace-pre-wrap rounded-lg bg-subtle px-3 py-2 text-sm text-muted">{tplText}</p>}
            <p className="text-xs text-muted">Free-text replies unlock again when the customer writes to us.</p>
          </div>
        )}
      </footer>
    </section>
  ) : (
    <section className="flex items-center justify-center"><EmptyState icon={MessageCircle} title="Select a conversation" hint="Choose a chat on the left to read the thread and reply." /></section>
  )

  return (
    <>
      <PageHeader title="WhatsApp inbox" description="Conversations with authors on WhatsApp. Replies are logged in the communication log." draft />
      {error ? <div className="card"><ErrorState message="The inbox could not be loaded." onRetry={reload} /></div>
        : loading && views.length === 0 ? <Skeleton className="h-[560px] w-full" />
        : (
          <div className={cn('card grid h-[calc(100vh-230px)] min-h-[560px] overflow-hidden', 'grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_300px]')}>
            {(isLg || pane === 'list') && list}
            {(isLg || pane === 'thread') && thread}
            {isXl && active && <aside aria-label="Paper context" className="overflow-y-auto border-l border-line"><PaperContext view={active} canWork={canWork} why={why('work')} /></aside>}
          </div>
        )}
      <Drawer open={ctxOpen && !isXl && !!active} onClose={() => setCtxOpen(false)} title="Paper context" width={380}>
        {active && <PaperContext view={active} canWork={canWork} why={why('work')} />}
      </Drawer>
    </>
  )
}
