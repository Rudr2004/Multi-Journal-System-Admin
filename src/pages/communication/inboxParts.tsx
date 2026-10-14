import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Mail, MessageCircle, MessagesSquare } from 'lucide-react'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { formatDateTime, formatMoney } from '@/shared/formatters'
import { useDataStore } from '@/mock/store'
import { INBOX_CHANNEL_LABEL, linkInboxPaper, type InboxChannel, type InboxView } from '@/mock/api/inbox'
import { CHANNEL_LABEL, MessageStatusBadge } from './parts'

export const CHANNEL_ICON = { whatsapp: MessageCircle, email: Mail, chat: MessagesSquare }

export function InboxChannelTag({ channel }: { channel: InboxChannel }) {
  const Icon = CHANNEL_ICON[channel]
  return <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted"><Icon size={12} strokeWidth={1.5} aria-hidden />{INBOX_CHANNEL_LABEL[channel]}</span>
}

const PAYMENT_LABEL: Record<string, string> = {
  verified_auto: 'Verified (online)', verified: 'Verified', awaiting_proof: 'Awaiting proof', pending_verification: 'Awaiting verification', rejected: 'Rejected', refunded: 'Refunded',
}

/** Right-hand panel: the paper the conversation is about, its payments and every message already sent for it. */
export function PaperContext({ view, canWork, why, canOpenPaper }: { view: InboxView; canWork: boolean; why?: string; canOpenPaper: boolean }) {
  const [paperId, setPaperId] = useState('')
  const [err, setErr] = useState('')
  const payments = useDataStore((s) => s.payments)
  const messages = useDataStore((s) => s.messages)
  const p = view.paper
  const paperPayments = useMemo(() => payments.filter((x) => x.paperId === p?.id), [payments, p?.id])
  const log = useMemo(() => messages.filter((m) => m.paperId === p?.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6), [messages, p?.id])

  const link = async () => {
    const ok = await linkInboxPaper(view, paperId)
    if (ok) { toast.success(`Conversation linked to ${paperId.trim().toUpperCase()}`); setPaperId(''); setErr('') } else setErr('No paper with that ID. Check the ID and try again.')
  }

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-semibold">Paper context</h3>
      {p ? (
        <>
          <div>
            {canOpenPaper
              ? <Link to={`/submissions/${p.id}`} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent hover:underline">{p.id} <ExternalLink size={13} aria-hidden /></Link>
              : <span className="whitespace-nowrap font-medium">{p.id}</span>}
            <p className="mt-1 line-clamp-2 text-sm text-muted" title={p.title}>{p.title}</p>
          </div>
          <dl className="space-y-2.5 text-sm">
            <div><dt className="text-xs text-muted">Status</dt><dd className="mt-0.5"><StatusBadge status={p.status} /></dd></div>
            <div><dt className="text-xs text-muted">Author</dt><dd className="mt-0.5">{p.author}<br /><span className="break-all text-muted">{p.authorEmail}</span></dd></div>
            <div><dt className="text-xs text-muted">Journal</dt><dd className="mt-0.5"><JournalBadge code={p.journal} /></dd></div>
          </dl>

          <section aria-label="Payments">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Payments</h4>
            {paperPayments.length === 0
              ? <p className="text-sm text-muted">{p.paymentStatus === 'none' ? 'No payment is due yet.' : 'No payment record yet.'}</p>
              : <ul className="space-y-1.5 text-sm">{paperPayments.map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-2 rounded-md bg-subtle px-2.5 py-1.5">
                  <span><span className="font-medium">{formatMoney(x.total, x.currency)}</span><br /><span className="text-xs text-muted">{PAYMENT_LABEL[x.status] ?? x.status}</span></span>
                  <span className="text-xs capitalize text-muted">{x.method.replace('_', ' ')}</span>
                </li>))}</ul>}
          </section>

          <section aria-label="Communication log for this paper">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Communication log</h4>
            {log.length === 0 ? <p className="text-sm text-muted">No messages sent for this paper yet.</p> : (
              <ul className="space-y-1.5 text-sm">
                {log.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-2">
                    <span className="min-w-0"><span className="block truncate">{m.template}</span><span className="text-xs text-muted">{CHANNEL_LABEL[m.channel]} · {formatDateTime(m.at)}</span></span>
                    <MessageStatusBadge status={m.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {canOpenPaper && <Link to={`/submissions/${p.id}`} className="btn-secondary w-full">Open submission</Link>}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-line p-3">
          <p className="text-sm text-muted">This conversation is not linked to a paper yet. Enter the Paper ID the author mentions.</p>
          <label htmlFor="link-paper" className="label mt-3">Paper ID</label>
          <input id="link-paper" className="input" placeholder="IJMAT2026000113" value={paperId} disabled={!canWork} aria-invalid={!!err} onChange={(e) => setPaperId(e.target.value)} />
          {err && <p role="alert" className="mt-1 text-xs text-red-600">{err}</p>}
          <GuardedButton allowed={canWork} why={why} className="btn-secondary mt-2 w-full" disabled={!paperId.trim()} onClick={link}>Link paper</GuardedButton>
        </div>
      )}
    </div>
  )
}

export const ProposedBadge = () => <Badge tone="accent" className="!px-1.5 !py-0 !text-[10px]">Proposed</Badge>
