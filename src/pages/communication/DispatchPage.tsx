import { useState } from 'react'
import { format, isToday, isTomorrow } from 'date-fns'
import { AlarmClock, CheckCircle2, PauseCircle, PlayCircle, Send, Timer } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge, JournalBadge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { ConfirmDialog } from '@/components/Dialog'
import { EmptyState, ErrorState } from '@/components/States'
import { KpiCard } from '@/components/KpiCard'
import { RelativeTime } from '@/components/Time'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { formatTime } from '@/shared/formatters'
import { listDispatchQueue, sendBatchNow, sendItemNow, setBatchPaused, setItemPaused, type DispatchBatchView, type DispatchQueueItem, type HeldReason } from '@/mock/api/dispatch'
import { CHANNEL_LABEL, ChannelBadge, PageSkeleton, PaperLink } from './parts'
import { formatCountdown, useNow } from './hooks'

const HELD_TEXT: Record<HeldReason, string> = { item: 'Paused', batch: 'Batch paused', channel: 'Channel paused' }

type Pending = { kind: 'batch'; batch: DispatchBatchView } | { kind: 'item'; item: DispatchQueueItem } | null

function dayLabel(iso: string) {
  const d = new Date(iso)
  return isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEEE')
}

export function DispatchPage() {
  const journals = useScopeJournals()
  const showJournal = useIsAllJournals()
  const { can, why } = usePermission('dispatch')
  const manage = can('manage')
  const { data, loading, error, reload } = useAsync(() => listDispatchQueue(journals), [journals.join()])
  const now = useNow(1000)
  const [confirm, setConfirm] = useState<Pending>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key)
    try {
      await fn()
      toast.success(msg)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(null)
      reload()
    }
  }

  const doSend = async () => {
    if (!confirm) return
    const c = confirm
    if (c.kind === 'batch') {
      setBusy(c.batch.key)
      const r = await sendBatchNow(c.batch.key, c.batch.at, journals)
      setBusy(null)
      toast.success(r.sent ? `${r.sent} message${r.sent === 1 ? '' : 's'} sent and added to the communication log${r.held ? `; ${r.held} paused item${r.held === 1 ? '' : 's'} stay queued` : ''}` : 'Nothing sent: every item in this batch is paused')
    } else {
      setBusy(c.item.id)
      await sendItemNow(c.item.id)
      setBusy(null)
      toast.success(`${c.item.template} sent to ${c.item.recipient} and logged`)
    }
    reload()
  }

  const next = data?.batches[0]
  const nextAt = next ? new Date(next.at).getTime() : undefined
  const queued = data?.batches.reduce((n, b) => n + b.items.length, 0) ?? 0
  const held = data?.batches.reduce((n, b) => n + b.items.filter((i) => i.held).length, 0) ?? 0
  const pausedChannels = data ? (Object.keys(data.channelPaused) as (keyof typeof data.channelPaused)[]).filter((c) => data.channelPaused[c]) : []

  const sendCount = confirm?.kind === 'batch' ? confirm.batch.items.filter((i) => !i.held).length : 1
  const heldCount = confirm?.kind === 'batch' ? confirm.batch.items.filter((i) => i.held).length : 0

  return (
    <>
      <PageHeader title="08:45 dispatch queue" description="Decision emails and reminders are held and sent together at 08:45 IST every day. Pause or send early when needed." />

      {error ? (
        <div className="card"><ErrorState message="The dispatch queue could not be loaded." onRetry={reload} /></div>
      ) : loading && !data ? (
        <PageSkeleton rows={4} />
      ) : data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Next dispatch in" icon={Timer} value={<span aria-live="off" className="whitespace-nowrap text-xl">{nextAt ? formatCountdown(nextAt - now) : '—'}</span>} hint={next ? `${dayLabel(next.at)} at ${formatTime(next.at)} IST` : undefined} />
            <KpiCard label="Queued in next batch" icon={Send} value={next ? next.items.length : 0} hint={next ? `${next.items.filter((i) => !i.held).length} will send` : undefined} />
            <KpiCard label="Paused items" icon={PauseCircle} value={held} tone={held ? 'warning' : 'default'} hint="Stay queued until resumed" />
            <KpiCard label="Queued, next 3 batches" icon={AlarmClock} value={queued} />
          </div>

          {pausedChannels.length > 0 && (
            <div role="status" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <PauseCircle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
              <p><strong>{pausedChannels.map((c) => CHANNEL_LABEL[c]).join(', ')}</strong> sending is paused globally. Those items are held and will go out once the channel is resumed in Templates &amp; schedule.</p>
            </div>
          )}

          {data.batches.map((b) => {
            const sendable = b.items.filter((i) => !i.held).length
            return (
              <SectionCard
                key={b.key}
                title={`${dayLabel(b.at)} · ${format(new Date(b.at), 'd MMM')} · ${formatTime(b.at)} IST`}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    {b.paused && <Badge tone="warning">Batch paused</Badge>}
                    <span className="text-xs text-muted">{b.items.length} item{b.items.length === 1 ? '' : 's'}</span>
                    <GuardedButton allowed={manage} why={why('manage')} className="btn-secondary" disabled={busy === b.key || b.items.length === 0}
                      onClick={() => run(b.key, () => setBatchPaused(b.key, b.at, !b.paused), b.paused ? 'Batch resumed' : 'Batch paused. Its items stay queued.')}>
                      {b.paused ? <><PlayCircle size={15} strokeWidth={1.5} aria-hidden /> Resume batch</> : <><PauseCircle size={15} strokeWidth={1.5} aria-hidden /> Pause batch</>}
                    </GuardedButton>
                    <GuardedButton allowed={manage} why={why('manage')} className="btn-primary" disabled={busy === b.key || sendable === 0} onClick={() => setConfirm({ kind: 'batch', batch: b })}>
                      <Send size={15} strokeWidth={1.5} aria-hidden /> Send now
                    </GuardedButton>
                  </div>
                }
                flush
              >
                {b.items.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="Nothing queued for this batch" hint="Accepted-paper emails and reminders appear here automatically." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Messages queued for the {formatTime(b.at)} batch on {format(new Date(b.at), 'd MMM')}</caption>
                      <thead className="border-b border-line">
                        <tr>
                          {['Paper ID', ...(showJournal ? ['Journal'] : []), 'Recipient', 'Template', 'Channel', 'State', 'Scheduled', ''].map((h, i) => (
                            <th key={i} scope="col" className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-muted">{h || <span className="sr-only">Actions</span>}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {b.items.map((i) => (
                          <tr key={i.id} className={i.held ? 'bg-amber-50/40' : 'hover:bg-page'}>
                            <td className="px-4 align-top" style={{ paddingBlock: 'var(--cell-py)' }}>
                              <PaperLink id={i.paperId} />
                              <p className="line-clamp-1 max-w-[260px] text-xs text-muted" title={i.paperTitle}>{i.paperTitle}</p>
                            </td>
                            {showJournal && <td className="px-4 align-top" style={{ paddingBlock: 'var(--cell-py)' }}><JournalBadge code={i.journal} /></td>}
                            <td className="whitespace-nowrap px-4 align-top" style={{ paddingBlock: 'var(--cell-py)' }}>{i.recipient}</td>
                            <td className="whitespace-nowrap px-4 align-top" style={{ paddingBlock: 'var(--cell-py)' }}>{i.template}</td>
                            <td className="px-4 align-top" style={{ paddingBlock: 'var(--cell-py)' }}><ChannelBadge channel={i.channel} /></td>
                            <td className="px-4 align-top" style={{ paddingBlock: 'var(--cell-py)' }}>
                              {i.held ? <Badge tone="warning">{HELD_TEXT[i.held]}</Badge> : <Badge tone="neutral">Queued</Badge>}
                            </td>
                            <td className="whitespace-nowrap px-4 align-top text-muted" style={{ paddingBlock: 'var(--cell-py)' }}>{formatTime(b.at)} IST</td>
                            <td className="px-4 align-top" style={{ paddingBlock: 'var(--cell-py)' }}>
                              <div className="flex justify-end gap-1">
                                <GuardedButton allowed={manage} why={why('manage')} className="btn-ghost !px-2" disabled={busy === i.id || i.held === 'batch' || i.held === 'channel'}
                                  aria-label={`${i.held === 'item' ? 'Resume' : 'Pause'} ${i.template} for ${i.paperId}`}
                                  onClick={() => run(i.id, () => setItemPaused(i.id, i.held !== 'item'), i.held === 'item' ? 'Item resumed' : 'Item paused. It stays queued.')}>
                                  {i.held === 'item' ? <PlayCircle size={16} strokeWidth={1.5} /> : <PauseCircle size={16} strokeWidth={1.5} />}
                                </GuardedButton>
                                <GuardedButton allowed={manage} why={why('manage')} className="btn-ghost !px-2" disabled={busy === i.id || !!i.held}
                                  aria-label={`Send ${i.template} for ${i.paperId} now`} onClick={() => setConfirm({ kind: 'item', item: i })}>
                                  <Send size={16} strokeWidth={1.5} />
                                </GuardedButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            )
          })}

          <SectionCard title="Recent batches" flush>
            <ul className="divide-y divide-line text-sm">
              {data.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="flex items-center gap-2"><CheckCircle2 size={16} strokeWidth={1.5} className="text-green-600" aria-hidden />
                    {dayLabel(h.batchAt)} {formatTime(h.batchAt)} batch: <strong>{h.count} message{h.count === 1 ? '' : 's'}</strong> sent by {h.by}</span>
                  <span className="text-muted"><RelativeTime value={h.sentAt} /></span>
                </li>
              ))}
              {data.history.length === 0 && <li className="px-4 py-3 text-muted">No batches have gone out yet.</li>}
            </ul>
          </SectionCard>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={doSend} confirmLabel="Send now"
        title={confirm?.kind === 'batch' ? `Send the ${confirm.batch ? formatTime(confirm.batch.at) : ''} batch now?` : 'Send this message now?'}
        consequences={confirm?.kind === 'batch' ? [
          `Send ${sendCount} message${sendCount === 1 ? '' : 's'} immediately instead of waiting for ${formatTime(confirm.batch.at)} IST.`,
          'Record each one in the communication log as sent or delivered.',
          heldCount ? `Leave ${heldCount} paused item${heldCount === 1 ? '' : 's'} in the queue.` : 'Empty this batch; the next batch is unaffected.',
        ] : confirm?.kind === 'item' ? [
          `Send "${confirm.item.template}" to ${confirm.item.recipient} by ${CHANNEL_LABEL[confirm.item.channel]} right now.`,
          'Record it in the communication log and remove it from the queue.',
        ] : []}
      />
    </>
  )
}
