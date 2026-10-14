import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Ban, Banknote, CheckCircle2, Clock, Download, FileCheck2, Gift, Paperclip, Wallet } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge, StatusBadge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { KpiCard } from '@/components/KpiCard'
import { ReasonDialog } from '@/components/ReasonDialog'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { cancelReferral, listReferrals, recordPayout, type ReferralRow } from '@/mock/api/referrals'
import { PAYOUT_MODE_LABEL, type PayoutMode, type ReferralStatus } from '@/mock/data/financeExtra'
import { recordAudit } from '@/mock/actions'
import { downloadCsv } from '@/pages/insights/csv'
import { formatDate, formatMoney } from '@/shared/formatters'
import type { Tone } from '@/shared/statuses'

const STATUS: Record<ReferralStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  eligible: { label: 'Eligible', tone: 'accent' },
  paid: { label: 'Paid', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

const fileSize = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function exportCsv(rows: ReferralRow[]) {
  recordAudit({ journal: 'ALL', action: 'Exported referral credits (CSV)', target: 'Referral Management', newValue: `${rows.length} rows` })
  downloadCsv(`referral-credits-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Credit ID', 'Referrer', 'Referrer email', 'Type', 'Referred author', 'Paper ID', 'Paper status', 'Journal', 'Amount (INR)', 'Status', 'Earned on', 'Paid on', 'Payout mode', 'Payout reference', 'Payout proof'],
    ...rows.map((r) => [r.id, r.referrer, r.referrerEmail, r.referrerType, r.referredAuthor, r.paperId, r.paperStatus ?? '', r.journal, r.amount.toFixed(2), STATUS[r.status].label,
      r.earnedAt.slice(0, 10), r.payout?.date ?? '', r.payout ? PAYOUT_MODE_LABEL[r.payout.mode] : '', r.payout?.reference ?? '', r.payout?.proof?.name ?? '']),
  ])
  toast.success(`Exported ${rows.length} referral credit${rows.length === 1 ? '' : 's'} to CSV.`)
}

interface PayoutGroup { key: string; referrer: string; email: string; date: string; mode: PayoutMode; reference: string; recordedBy: string; proof?: { name: string; size: number }; ids: string[]; amount: number }

export function ReferralsPage() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const perm = usePermission('referrals')
  const [f, setF] = useState({ status: '', referrer: '' })
  const [paying, setPaying] = useState<ReferralRow[] | null>(null)
  const [cancelling, setCancelling] = useState<ReferralRow | null>(null)
  const r = useAsync(() => listReferrals(journals), [journals.join()])
  const first = r.loading && !r.data
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  const rows = useMemo(() => (r.data ?? []).filter((c) => (!f.status || c.status === f.status) && (!f.referrer || c.referrerEmail === f.referrer)), [r.data, f])
  const total = (s: ReferralStatus) => (r.data ?? []).filter((c) => c.status === s).reduce((a, c) => a + c.amount, 0)
  const n = (s: ReferralStatus) => (r.data ?? []).filter((c) => c.status === s).length
  const referrers = useMemo(() => [...new Map((r.data ?? []).map((c) => [c.referrerEmail, c.referrer])).entries()].map(([value, label]) => ({ value, label })), [r.data])

  const history = useMemo<PayoutGroup[]>(() => {
    const m = new Map<string, PayoutGroup>()
    for (const c of r.data ?? []) {
      if (c.status !== 'paid' || !c.payout) continue
      const key = `${c.referrerEmail}|${c.payout.date}|${c.payout.reference}`
      const g = m.get(key) ?? { key, referrer: c.referrer, email: c.referrerEmail, date: c.payout.date, mode: c.payout.mode, reference: c.payout.reference, recordedBy: c.payout.recordedBy, proof: c.payout.proof, ids: [], amount: 0 }
      g.ids.push(c.id)
      g.amount += c.payout.amount
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => b.date.localeCompare(a.date))
  }, [r.data])

  const columns: Column<ReferralRow>[] = [
    { id: 'referrer', header: 'Referrer', locked: true, sort: (c) => c.referrer, cell: (c) => (
      <div><p className="font-medium">{c.referrer}</p><p className="text-xs text-muted">{c.referrerType} · {c.referrerEmail}</p></div>
    ) },
    { id: 'author', header: 'Referred author', sort: (c) => c.referredAuthor, cell: (c) => c.referredAuthor },
    { id: 'paper', header: 'Paper ID', sort: (c) => c.paperId, cell: (c) => <Link to={`/submissions/${c.paperId}`} className="whitespace-nowrap font-medium text-accent hover:underline" data-no-row-click>{c.paperId}</Link> },
    { id: 'paperStatus', header: 'Paper status', sort: (c) => c.paperStatus ?? '', cell: (c) => (c.paperStatus ? <StatusBadge status={c.paperStatus} /> : <span className="text-muted">—</span>) },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (c: ReferralRow) => c.journal, cell: (c: ReferralRow) => <JournalBadge code={c.journal} /> }] : []),
    { id: 'amount', header: 'Credit', align: 'right', sort: (c) => c.amount, cell: (c) => <span className="whitespace-nowrap font-medium tabular-nums">{formatMoney(c.amount, 'INR')}</span> },
    { id: 'status', header: 'Credit status', sort: (c) => c.status, cell: (c) => (
      <div><Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
        {c.status === 'cancelled' && c.cancelReason && <p className="mt-1 max-w-[240px] text-xs text-muted">{c.cancelReason}</p>}
        {c.status === 'pending' && <p className="mt-1 max-w-[240px] text-xs text-muted">Eligible once the paper is published.</p>}</div>
    ) },
    { id: 'earned', header: 'Created', sort: (c) => c.earnedAt, cell: (c) => <span className="whitespace-nowrap">{formatDate(c.earnedAt)}</span> },
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
      <PageHeader title="Referral Management" description="A credit becomes Eligible only after the referred paper is published. Payouts are recorded manually, with proof, after you have paid the referrer — nothing is paid automatically."
        actions={<button className="btn-secondary" disabled={rows.length === 0} onClick={() => exportCsv(rows)}><Download size={15} strokeWidth={1.5} aria-hidden /> Export CSV</button>} />
      <section aria-label="Referral summary" className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Pending" value={formatMoney(total('pending'), 'INR')} hint={`${n('pending')} credit${n('pending') === 1 ? '' : 's'} · paper not published yet`} icon={Clock} loading={first} />
        <KpiCard label="Eligible — to pay out" value={formatMoney(total('eligible'), 'INR')} hint={`${n('eligible')} credit${n('eligible') === 1 ? '' : 's'} · paper published`} icon={Wallet} tone={n('eligible') ? 'warning' : 'default'} loading={first} />
        <KpiCard label="Paid" value={formatMoney(total('paid'), 'INR')} hint={`${n('paid')} credit${n('paid') === 1 ? '' : 's'}`} icon={CheckCircle2} loading={first} />
        <KpiCard label="Cancelled" value={n('cancelled')} hint={formatMoney(total('cancelled'), 'INR')} icon={Ban} loading={first} />
      </section>

      <DataTable id="referrals" data={rows} columns={columns} rowKey={(c) => c.id} loading={first} error={!!r.error} onRetry={r.reload}
        search={{ placeholder: 'Search referrer, author or Paper ID', text: (c) => `${c.id} ${c.referrer} ${c.referrerEmail} ${c.referredAuthor} ${c.paperId}` }}
        views={{ filters: f, applyFilters: (x) => setF(x as typeof f) }}
        filters={<>
          <SelectFilter label="Status" value={f.status} onChange={set('status')} options={Object.entries(STATUS).map(([value, m]) => ({ value, label: m.label }))} />
          <SelectFilter label="Referrer" value={f.referrer} onChange={set('referrer')} options={referrers} />
        </>}
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
        empty={{ icon: Gift, title: 'No referral credits', hint: 'Credits appear when a paper carries a referral code. They become Eligible once that paper is published.' }} />

      <div className="mt-5">
        <SectionCard title="Payout history" flush>
          {history.length === 0 ? (
            <p className="p-4 text-sm text-muted">{first ? 'Loading…' : 'No payouts recorded yet. Record one from an Eligible credit above.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">Recorded referral payouts</caption>
                <thead className="bg-subtle text-xs text-muted"><tr>
                  {['Date', 'Referrer', 'Credits', 'Amount', 'Mode · reference', 'Proof'].map((h, i) => <th key={h} scope="col" className={`px-4 py-2 font-medium ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {history.map((g) => (
                    <tr key={g.key}>
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDate(g.date)}</td>
                      <td className="px-4 py-2.5"><p className="font-medium">{g.referrer}</p><p className="text-xs text-muted">Recorded by {g.recordedBy}</p></td>
                      <td className="px-4 py-2.5 text-xs text-muted">{g.ids.join(', ')}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">{formatMoney(g.amount, 'INR')}</td>
                      <td className="px-4 py-2.5"><p>{PAYOUT_MODE_LABEL[g.mode]}</p><p className="font-mono text-xs text-muted">{g.reference}</p></td>
                      <td className="px-4 py-2.5">{g.proof ? <span className="inline-flex items-center gap-1 text-xs"><FileCheck2 size={13} aria-hidden className="text-green-700" />{g.proof.name} · {fileSize(g.proof.size)}</span> : <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

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

function PayoutDialog({ credits, onClose, onDone }: { credits: ReferralRow[] | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={!!credits} onClose={onClose} title="Record payout" description="Record a payment you have already made to the referrer. This does not move any money."
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" form="payout-form">Record payout</button></>}>
      {credits && <PayoutForm credits={credits} onClose={onClose} onDone={onDone} />}
    </Dialog>
  )
}

function PayoutForm({ credits, onClose, onDone }: { credits: ReferralRow[]; onClose: () => void; onDone: () => void }) {
  const total = credits.reduce((a, c) => a + c.amount, 0)
  const [proof, setProof] = useState<{ name: string; size: number } | undefined>()
  const [proofError, setProofError] = useState<string>()
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { date: new Date().toISOString().slice(0, 10), amount: total, mode: 'bank_transfer' as PayoutMode, reference: '' },
  })
  const submit = handleSubmit(async (v) => {
    if (Math.abs(v.amount - total) > 0.001) return setError('amount', { message: `Amount must equal the selected credits (${formatMoney(total, 'INR')})` })
    if (!proof) return setProofError('Attach the proof of payment (screenshot, receipt or cheque copy).')
    try {
      await recordPayout(credits.map((c) => c.id), { ...v, proof })
      toast.success(`Payout of ${formatMoney(v.amount, 'INR')} recorded for ${credits[0].referrer}`)
      onDone()
      onClose()
    } catch (e) { toast.error((e as Error).message) }
  })
  return (
    <form id="payout-form" onSubmit={submit} noValidate className="space-y-4">
      <div className="rounded-lg bg-subtle px-3 py-2.5 text-sm">
        <p className="font-medium">{credits[0].referrer}</p>
        <p className="text-muted">{credits.length} credit{credits.length === 1 ? '' : 's'} · {credits.map((c) => `${c.id} (${c.paperId})`).join(', ')} · total {formatMoney(total, 'INR')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Payout date" required error={errors.date?.message}>{(a) => <input {...a} type="date" max={new Date().toISOString().slice(0, 10)} className="input" {...register('date')} />}</FormField>
        <FormField label="Amount paid (INR)" required error={errors.amount?.message} hint={`Must equal ${formatMoney(total, 'INR')}`}>{(a) => <input {...a} type="number" step="0.01" min={0} className="input" {...register('amount', { valueAsNumber: true })} />}</FormField>
        <FormField label="Mode" required error={errors.mode?.message}>{(a) => <select {...a} className="input" {...register('mode')}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}</FormField>
        <FormField label="Reference" required error={errors.reference?.message} hint="UTR, cheque number or transaction ID">{(a) => <input {...a} className="input" {...register('reference')} />}</FormField>
        <FormField label="Proof of payment" required error={proofError} hint="PNG, JPG or PDF. Prototype: only the file name and size are kept." className="sm:col-span-2">
          {(a) => (
            <div className="flex flex-wrap items-center gap-3">
              <input {...a} type="file" accept="image/png,image/jpeg,application/pdf" className="input !h-auto py-1.5"
                onChange={(e) => { const file = e.target.files?.[0]; setProof(file ? { name: file.name, size: file.size } : undefined); setProofError(undefined) }} />
              {proof && <span className="inline-flex items-center gap-1 text-xs text-muted"><Paperclip size={13} aria-hidden /> {proof.name} · {fileSize(proof.size)}</span>}
            </div>
          )}
        </FormField>
      </div>
    </form>
  )
}
