import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Ban, Banknote, CheckCircle2, Clock, Download, Gift, Wallet } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { KpiCard } from '@/components/KpiCard'
import { ReasonDialog } from '@/components/ReasonDialog'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { cancelReferral, listReferrals, recordPayout } from '@/mock/api/referrals'
import { PAYOUT_MODE_LABEL, type PayoutMode, type ReferralCredit, type ReferralStatus } from '@/mock/data/financeExtra'
import { formatDate, formatMoney } from '@/shared/formatters'
import type { Tone } from '@/shared/statuses'

const STATUS: Record<ReferralStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  eligible: { label: 'Eligible', tone: 'accent' },
  paid: { label: 'Paid', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

const csvCell = (v: string | number | undefined) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCsv(rows: ReferralCredit[]) {
  const head = ['Credit ID', 'Referrer', 'Referrer email', 'Type', 'Referred author', 'Paper ID', 'Journal', 'Amount (INR)', 'Status', 'Earned on', 'Paid on', 'Payout mode', 'Payout reference']
  const body = rows.map((r) => [r.id, r.referrer, r.referrerEmail, r.referrerType, r.referredAuthor, r.paperId, r.journal, r.amount.toFixed(2), STATUS[r.status].label, r.earnedAt.slice(0, 10),
    r.payout?.date ?? '', r.payout ? PAYOUT_MODE_LABEL[r.payout.mode] : '', r.payout?.reference ?? ''])
  const csv = [head, ...body].map((l) => l.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `referral-credits-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.success(`Exported ${rows.length} referral credit${rows.length === 1 ? '' : 's'} to CSV.`)
}

export function ReferralsPage() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const perm = usePermission('referrals')
  const [status, setStatus] = useState('')
  const [paying, setPaying] = useState<ReferralCredit[] | null>(null)
  const [cancelling, setCancelling] = useState<ReferralCredit | null>(null)
  const r = useAsync(() => listReferrals(journals), [journals.join()])
  const first = r.loading && !r.data

  const rows = useMemo(() => (r.data ?? []).filter((c) => !status || c.status === status), [r.data, status])
  const total = (s: ReferralStatus) => (r.data ?? []).filter((c) => c.status === s).reduce((a, c) => a + c.amount, 0)
  const n = (s: ReferralStatus) => (r.data ?? []).filter((c) => c.status === s).length

  const columns: Column<ReferralCredit>[] = [
    { id: 'referrer', header: 'Referrer', locked: true, sort: (c) => c.referrer, cell: (c) => (
      <div><p className="font-medium">{c.referrer}</p><p className="text-xs text-muted">{c.referrerType} · {c.referrerEmail}</p></div>
    ) },
    { id: 'author', header: 'Referred author', sort: (c) => c.referredAuthor, cell: (c) => c.referredAuthor },
    { id: 'paper', header: 'Paper', cell: (c) => <Link to={`/submissions/${c.paperId}`} className="whitespace-nowrap text-accent hover:underline">{c.paperId}</Link> },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (c: ReferralCredit) => c.journal, cell: (c: ReferralCredit) => <JournalBadge code={c.journal} /> }] : []),
    { id: 'amount', header: 'Credit', align: 'right', sort: (c) => c.amount, cell: (c) => <span className="whitespace-nowrap font-medium tabular-nums">{formatMoney(c.amount, 'INR')}</span> },
    { id: 'status', header: 'Status', sort: (c) => c.status, cell: (c) => (
      <div><Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
        {c.status === 'cancelled' && c.cancelReason && <p className="mt-1 max-w-[240px] text-xs text-muted">{c.cancelReason}</p>}
        {c.status === 'pending' && c.note && <p className="mt-1 max-w-[240px] text-xs text-muted">{c.note}</p>}</div>
    ) },
    { id: 'earned', header: 'Earned', sort: (c) => c.earnedAt, cell: (c) => <span className="whitespace-nowrap">{formatDate(c.earnedAt)}</span> },
    { id: 'payout', header: 'Payout', cell: (c) => (c.payout
      ? <div className="text-sm"><p className="whitespace-nowrap">{formatDate(c.payout.date)} · {PAYOUT_MODE_LABEL[c.payout.mode]}</p><p className="font-mono text-xs text-muted">{c.payout.reference}</p></div>
      : <span className="text-muted">—</span>) },
    { id: 'actions', header: 'Actions', locked: true, cell: (c) => (
      <div className="flex gap-1.5" data-no-row-click>
        {c.status === 'eligible' && (
          <GuardedButton className="btn-secondary !h-8" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setPaying([c])}><Banknote size={14} strokeWidth={1.5} aria-hidden /> Record payout</GuardedButton>
        )}
        {(c.status === 'pending' || c.status === 'eligible') && (
          <GuardedButton className="btn-ghost !h-8" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setCancelling(c)} aria-label={`Cancel credit ${c.id}`}><Ban size={14} strokeWidth={1.5} aria-hidden /> Cancel</GuardedButton>
        )}
      </div>
    ) },
  ]

  return (
    <>
      <PageHeader title="Referrals" description="Credits earned when a referred author’s paper is paid for. Payouts are recorded manually after you have paid the referrer — nothing is paid automatically."
        actions={<button className="btn-secondary" disabled={rows.length === 0} onClick={() => exportCsv(rows)}><Download size={15} strokeWidth={1.5} aria-hidden /> Export CSV</button>} />
      <section aria-label="Referral summary" className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Pending" value={formatMoney(total('pending'), 'INR')} hint={`${n('pending')} credit${n('pending') === 1 ? '' : 's'} · awaiting payment`} icon={Clock} loading={first} />
        <KpiCard label="Eligible — to pay out" value={formatMoney(total('eligible'), 'INR')} hint={`${n('eligible')} credit${n('eligible') === 1 ? '' : 's'}`} icon={Wallet} tone={n('eligible') ? 'warning' : 'default'} loading={first} />
        <KpiCard label="Paid" value={formatMoney(total('paid'), 'INR')} hint={`${n('paid')} credit${n('paid') === 1 ? '' : 's'}`} icon={CheckCircle2} loading={first} />
        <KpiCard label="Cancelled" value={n('cancelled')} hint={formatMoney(total('cancelled'), 'INR')} icon={Ban} loading={first} />
      </section>

      <DataTable id="referrals" data={rows} columns={columns} rowKey={(c) => c.id} loading={first} error={!!r.error} onRetry={r.reload}
        search={{ placeholder: 'Search referrer, author or paper', text: (c) => `${c.id} ${c.referrer} ${c.referrerEmail} ${c.referredAuthor} ${c.paperId}` }}
        filters={<SelectFilter label="Status" value={status} onChange={setStatus} options={Object.entries(STATUS).map(([value, m]) => ({ value, label: m.label }))} />}
        selectable
        bulkActions={(sel, clear) => {
          const eligible = sel.filter((c) => c.status === 'eligible')
          const one = new Set(eligible.map((c) => c.referrerEmail)).size === 1
          return (
            <GuardedButton className="btn-secondary !h-8" allowed={perm.can('manage') && eligible.length > 0 && one}
              why={perm.why('manage') ?? (eligible.length === 0 ? 'Select at least one Eligible credit.' : 'A single payout can only cover one referrer.')}
              onClick={() => { setPaying(eligible); clear() }}><Banknote size={14} strokeWidth={1.5} aria-hidden /> Record one payout for {eligible.length}</GuardedButton>
          )
        }}
        empty={{ icon: Gift, title: 'No referral credits', hint: 'Credits appear when a referred author pays their article processing charge.' }} />

      <PayoutDialog credits={paying} onClose={() => setPaying(null)} onDone={r.reload} />
      <ReasonDialog open={!!cancelling} onClose={() => setCancelling(null)} danger confirmLabel="Cancel credit" title="Cancel referral credit"
        description={cancelling ? `${cancelling.id} · ${cancelling.referrer} · ${formatMoney(cancelling.amount, 'INR')}` : undefined} label="Reason for cancelling"
        consequences={['The credit is removed from the amounts payable.', 'The reason is saved to the audit log.']}
        onSubmit={async (reason) => { try { await cancelReferral(cancelling!.id, reason); toast.success('Referral credit cancelled'); r.reload() } catch (e) { toast.error((e as Error).message) } }} />
    </>
  )
}

const MODES = Object.entries(PAYOUT_MODE_LABEL) as [PayoutMode, string][]

const schema = z.object({
  date: z.string().min(1, 'Choose the payout date'),
  amount: z.number({ error: 'Enter the amount paid' }).positive('Amount must be greater than zero'),
  mode: z.enum(['bank_transfer', 'upi', 'cheque', 'other']),
  reference: z.string().trim().min(4, 'Enter the UTR / cheque / transaction reference').max(60),
})

function PayoutDialog({ credits, onClose, onDone }: { credits: ReferralCredit[] | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={!!credits} onClose={onClose} title="Record payout" description="Record a payment you have already made to the referrer. This does not move any money."
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" form="payout-form">Record payout</button></>}>
      {credits && <PayoutForm credits={credits} onClose={onClose} onDone={onDone} />}
    </Dialog>
  )
}

function PayoutForm({ credits, onClose, onDone }: { credits: ReferralCredit[]; onClose: () => void; onDone: () => void }) {
  const total = credits.reduce((a, c) => a + c.amount, 0)
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { date: new Date().toISOString().slice(0, 10), amount: total, mode: 'bank_transfer' as PayoutMode, reference: '' },
  })
  const submit = handleSubmit(async (v) => {
    if (Math.abs(v.amount - total) > 0.001) return setError('amount', { message: `Amount must equal the credits being settled (${formatMoney(total, 'INR')})` })
    try {
      await recordPayout(credits.map((c) => c.id), v)
      toast.success(`Payout of ${formatMoney(v.amount, 'INR')} recorded for ${credits[0].referrer}`)
      onDone()
      onClose()
    } catch (e) { toast.error((e as Error).message) }
  })
  return (
    <form id="payout-form" onSubmit={submit} noValidate className="space-y-4">
      <div className="rounded-lg bg-subtle px-3 py-2.5 text-sm">
        <p className="font-medium">{credits[0].referrer}</p>
        <p className="text-muted">{credits.length} credit{credits.length === 1 ? '' : 's'}: {credits.map((c) => c.id).join(', ')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Payout date" required error={errors.date?.message}>{(a) => <input {...a} type="date" max={new Date().toISOString().slice(0, 10)} className="input" {...register('date')} />}</FormField>
        <FormField label="Amount paid (INR)" required error={errors.amount?.message}>{(a) => <input {...a} type="number" step="0.01" min={0} className="input" {...register('amount', { valueAsNumber: true })} />}</FormField>
        <FormField label="Mode" required error={errors.mode?.message}>{(a) => <select {...a} className="input" {...register('mode')}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</FormField>
        <FormField label="Reference" required error={errors.reference?.message} hint="UTR, cheque number or transaction ID">{(a) => <input {...a} className="input" {...register('reference')} />}</FormField>
      </div>
    </form>
  )
}
