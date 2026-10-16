import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Ban, Banknote, CheckCircle2, Clock, Copy, Download, FileCheck2, Gift, Mail, Paperclip, Pencil, Phone, SlidersHorizontal, Wallet } from 'lucide-react'
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
import { PHONE_RE, UPI_RE, cancelReferral, listReferrals, recordPayout, setReferralAmounts, updateCreditAmount, updateReferrerProfile, type PayoutEmail, type ReferralRow } from '@/mock/api/referrals'
import { useFinanceStore } from '@/mock/stores/finance'
import { EmailPreview } from '@/components/EmailPreview'
import { Switch } from '@/components/Form'
import { JOURNALS } from '@/mock/data/core'
import type { JournalCode } from '@/shared/types'
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

interface PayoutGroup { key: string; referrer: string; email: string; date: string; mode: PayoutMode; reference: string; recordedBy: string; proof?: { name: string; size: number }; ids: string[]; amount: number; status: 'processing' | 'paid' | 'failed'; transactionId?: string; emailSentAt?: string; emailKind?: 'proof' | 'confirmation' }

export function ReferralsPage() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const perm = usePermission('referrals')
  const [f, setF] = useState({ status: '', referrer: '' })
  const [paying, setPaying] = useState<ReferralRow[] | null>(null)
  const [cancelling, setCancelling] = useState<ReferralRow | null>(null)
  const [editing, setEditing] = useState<ReferralRow | null>(null)
  const [repricing, setRepricing] = useState<ReferralRow | null>(null)
  const [pricing, setPricing] = useState(false)
  const [sent, setSent] = useState<PayoutEmail | null>(null)
  const profiles = useFinanceStore((st) => st.profiles)
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
      const g = m.get(key) ?? { key, referrer: c.referrer, email: c.referrerEmail, date: c.payout.date, mode: c.payout.mode, reference: c.payout.reference, recordedBy: c.payout.recordedBy, proof: c.payout.proof, ids: [], amount: 0, status: c.payout.status ?? 'paid', transactionId: c.payout.transactionId ?? c.payout.reference, emailSentAt: c.payout.emailSentAt, emailKind: c.payout.emailKind }
      g.ids.push(c.id)
      g.amount += c.payout.amount
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => b.date.localeCompare(a.date))
  }, [r.data])

  const columns: Column<ReferralRow>[] = [
    { id: 'referrer', header: 'Referrer', locked: true, sort: (c) => c.referrer, cell: (c) => (
      <div>
        <p className="font-medium">{c.referrer}</p>
        <p className="text-xs text-muted">{c.referrerType} · {c.referrerEmail}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Phone size={11} aria-hidden /> {profiles[c.referrerEmail]?.phone ?? 'No phone'}</span>
          <span className={profiles[c.referrerEmail]?.upiId ? '' : 'text-amber-700'}>UPI: {profiles[c.referrerEmail]?.upiId ?? 'not added'}</span>
        </p>
      </div>
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
      ? <div className="text-sm"><p className="whitespace-nowrap">{formatDate(c.payout.date)} · {PAYOUT_MODE_LABEL[c.payout.mode]}</p><p className="font-mono text-xs text-muted">{c.payout.transactionId ?? c.payout.reference}</p></div>
      : <span className="text-muted">—</span>) },
    { id: 'actions', header: 'Actions', locked: true, cell: (c) => (
      <div className="flex flex-wrap gap-1.5 whitespace-nowrap" data-no-row-click>
        {c.status === 'eligible' && (
          <GuardedButton className="btn-secondary !h-8" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setPaying([c])}><Banknote size={14} strokeWidth={1.5} aria-hidden /> Record payout</GuardedButton>
        )}
        <GuardedButton className="btn-ghost !h-8" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setEditing(c)} aria-label={`Edit referee details for ${c.referrer}`}><Pencil size={14} strokeWidth={1.5} aria-hidden /> Details</GuardedButton>
        {(c.status === 'pending' || c.status === 'eligible') && (
          <GuardedButton className="btn-ghost !h-8" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setRepricing(c)} aria-label={`Change amount of ${c.id}`}>Amount</GuardedButton>
        )}
        {(c.status === 'pending' || c.status === 'eligible') && (
          <GuardedButton className="btn-ghost !h-8" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setCancelling(c)} aria-label={`Cancel credit ${c.id}`}><Ban size={14} strokeWidth={1.5} aria-hidden /> Cancel</GuardedButton>
        )}
      </div>
    ) },
  ]

  return (
    <>
      <PageHeader title="Referral Management" description="A credit becomes Eligible only after the referred paper is published. Record manual payouts with proof after you have paid the referrer; the referee is emailed the proof. Gateway payments email a confirmation automatically."
        actions={<>
          <GuardedButton className="btn-secondary" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setPricing(true)}><SlidersHorizontal size={15} strokeWidth={1.5} aria-hidden /> Referral amount</GuardedButton>
          <button className="btn-secondary" disabled={rows.length === 0} onClick={() => exportCsv(rows)}><Download size={15} strokeWidth={1.5} aria-hidden /> Export CSV</button>
        </>} />
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
                  {['Date', 'Referrer', 'Credits', 'Amount', 'Mode · transaction', 'Status', 'Referee email', 'Proof'].map((h, i) => <th key={h} scope="col" className={`px-4 py-2 font-medium ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {history.map((g) => (
                    <tr key={g.key}>
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDate(g.date)}</td>
                      <td className="px-4 py-2.5"><p className="font-medium">{g.referrer}</p><p className="text-xs text-muted">Recorded by {g.recordedBy}</p></td>
                      <td className="px-4 py-2.5 text-xs text-muted">{g.ids.join(', ')}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums">{formatMoney(g.amount, 'INR')}</td>
                      <td className="px-4 py-2.5"><p>{PAYOUT_MODE_LABEL[g.mode]}</p><p className="font-mono text-xs text-muted">{g.transactionId ?? g.reference}</p></td>
                      <td className="px-4 py-2.5"><Badge tone={g.status === 'paid' ? 'success' : g.status === 'failed' ? 'danger' : 'warning'}>{g.status === 'paid' ? 'Paid' : g.status === 'failed' ? 'Failed' : 'Processing'}</Badge></td>
                      <td className="px-4 py-2.5 text-xs">{g.emailSentAt ? <span className="inline-flex items-center gap-1 text-muted"><Mail size={12} aria-hidden /> {g.emailKind === 'confirmation' ? 'Confirmation' : 'Proof attached'} · {formatDate(g.emailSentAt)}</span> : <span className="text-muted">Not sent</span>}</td>
                      <td className="px-4 py-2.5">{g.proof ? <span className="inline-flex items-center gap-1 text-xs"><FileCheck2 size={13} aria-hidden className="text-green-700" />{g.proof.name} · {fileSize(g.proof.size)}</span> : <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <PayoutDialog credits={paying} profile={paying ? profiles[paying[0].referrerEmail] : undefined} onClose={() => setPaying(null)} onDone={(email) => { r.reload(); setSent(email) }} onEditProfile={(c) => { setPaying(null); setEditing(c) }} />
      <ProfileDialog credit={editing} onClose={() => setEditing(null)} onDone={r.reload} />
      <AmountDialog open={pricing} onClose={() => setPricing(false)} onDone={r.reload} />
      <CreditAmountDialog credit={repricing} onClose={() => setRepricing(null)} onDone={r.reload} />
      <Dialog open={!!sent} onClose={() => setSent(null)} title="Email sent to the referee" description="This is the message the referee received." width={620}
        footer={<button className="btn-primary" type="button" onClick={() => setSent(null)}>Done</button>}>
        {sent && <div className="space-y-3">
          <EmailPreview to={sent.to} subject={sent.subject} body={sent.body} />
          {sent.attachment && <p className="inline-flex items-center gap-1.5 text-sm text-muted"><Paperclip size={14} aria-hidden /> Attached: <span className="font-medium text-ink">{sent.attachment}</span></p>}
        </div>}
      </Dialog>
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
  mode: z.enum(['bank_transfer', 'upi', 'cheque', 'other', 'gateway']),
  reference: z.string().trim().max(60),
})

function PayoutDialog({ credits, profile, onClose, onDone, onEditProfile }: {
  credits: ReferralRow[] | null; profile?: { phone?: string; upiId?: string }; onClose: () => void; onDone: (email: PayoutEmail) => void; onEditProfile: (c: ReferralRow) => void
}) {
  return (
    <Dialog open={!!credits} onClose={onClose} width={620} title="Record payout" description="Pay the referee, then record it here. The referee is emailed automatically."
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" form="payout-form">Record payout</button></>}>
      {credits && <PayoutForm credits={credits} profile={profile} onClose={onClose} onDone={onDone} onEditProfile={onEditProfile} />}
    </Dialog>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <button type="button" className="btn-ghost !h-7 !px-2 text-xs" aria-label={`Copy ${label}`} onClick={() => { void navigator.clipboard?.writeText(text); toast.success(`${label} copied`) }}>
      <Copy size={12} aria-hidden /> Copy
    </button>
  )
}

function PayoutForm({ credits, profile, onClose, onDone, onEditProfile }: {
  credits: ReferralRow[]; profile?: { phone?: string; upiId?: string }; onClose: () => void; onDone: (email: PayoutEmail) => void; onEditProfile: (c: ReferralRow) => void
}) {
  const total = credits.reduce((a, c) => a + c.amount, 0)
  const [proof, setProof] = useState<{ name: string; size: number } | undefined>()
  const [proofError, setProofError] = useState<string>()
  const { register, handleSubmit, setError, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { date: new Date().toISOString().slice(0, 10), amount: total, mode: (profile?.upiId ? 'upi' : 'bank_transfer') as PayoutMode, reference: '' },
  })
  const mode = watch('mode')
  const gateway = mode === 'gateway'
  const submit = handleSubmit(async (v) => {
    if (Math.abs(v.amount - total) > 0.001) return setError('amount', { message: `Amount must equal the selected credits (${formatMoney(total, 'INR')})` })
    if (!gateway && v.reference.trim().length < 4) return setError('reference', { message: 'Enter the UTR / cheque / transaction reference' })
    if (!gateway && !proof) return setProofError('Attach the proof of payment (screenshot, receipt or cheque copy).')
    try {
      const res = await recordPayout(credits.map((c) => c.id), { ...v, proof: gateway ? undefined : proof })
      toast.success(gateway ? `Paid ${formatMoney(v.amount, 'INR')} through the gateway. Confirmation emailed to ${credits[0].referrer}.` : `Payout of ${formatMoney(v.amount, 'INR')} recorded. Proof emailed to ${credits[0].referrer}.`)
      onDone(res.email)
      onClose()
    } catch (e) { toast.error((e as Error).message) }
  })
  return (
    <form id="payout-form" onSubmit={submit} noValidate className="space-y-4">
      <div className="rounded-lg bg-subtle px-3 py-2.5 text-sm">
        <p className="font-medium">{credits[0].referrer}</p>
        <p className="text-muted">{credits.length} credit{credits.length === 1 ? '' : 's'} · {credits.map((c) => `${c.id} (${c.paperId})`).join(', ')} · total {formatMoney(total, 'INR')}</p>
      </div>

      <section aria-label="Referee payment details" className="rounded-lg border border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Referee payment details</p>
          <button type="button" className="btn-ghost !h-7 text-xs" onClick={() => onEditProfile(credits[0])}><Pencil size={12} aria-hidden /> Edit</button>
        </div>
        <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Phone number</dt><dd className="flex items-center gap-1 font-medium"><Phone size={13} aria-hidden className="text-faint" /> {profile?.phone ?? <span className="text-amber-700">Not added</span>}</dd></div>
          <div><dt className="text-xs text-muted">UPI ID</dt><dd className="flex items-center gap-1 font-medium">{profile?.upiId ? <><span className="font-mono">{profile.upiId}</span><CopyButton text={profile.upiId} label="UPI ID" /></> : <span className="text-amber-700">Not added</span>}</dd></div>
        </dl>
        {mode === 'upi' && !profile?.upiId && <p role="alert" className="mt-2 text-xs text-amber-800">No UPI ID is on file for this referee. Add it with Edit, or ask them to add it in Track My Paper.</p>}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Payout date" required error={errors.date?.message}>{(a) => <input {...a} type="date" max={new Date().toISOString().slice(0, 10)} className="input" {...register('date')} />}</FormField>
        <FormField label="Amount paid (INR)" required error={errors.amount?.message} hint={`Must equal ${formatMoney(total, 'INR')}`}>{(a) => <input {...a} type="number" step="0.01" min={0} className="input" {...register('amount', { valueAsNumber: true })} />}</FormField>
        <FormField label="Payment method" required error={errors.mode?.message} className="sm:col-span-2">{(a) => <select {...a} className="input" {...register('mode')}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}{v === 'gateway' ? ' (proposed)' : ''}</option>)}</select>}</FormField>
        {gateway ? (
          <p className="rounded-lg border border-indigo-200 bg-accent-soft px-3 py-2.5 text-sm text-accent sm:col-span-2">
            <Badge tone="accent">Proposed</Badge> The payment completes through the payment gateway and a transaction ID is saved automatically. A confirmation email is sent to the referee. The proposal says referral payouts are manual, so this is shown for the client to decide.
          </p>
        ) : (
          <>
            <FormField label="Reference" required error={errors.reference?.message} hint="UTR, cheque number or transaction ID">{(a) => <input {...a} className="input" {...register('reference')} />}</FormField>
            <FormField label="Proof of payment" required error={proofError} hint="PNG, JPG or PDF. It is attached to the email sent to the referee.">
              {(a) => (
                <div className="flex flex-wrap items-center gap-3">
                  <input {...a} type="file" accept="image/png,image/jpeg,application/pdf" className="input !h-auto py-1.5"
                    onChange={(e) => { const file = e.target.files?.[0]; setProof(file ? { name: file.name, size: file.size } : undefined); setProofError(undefined) }} />
                  {proof && <span className="inline-flex items-center gap-1 text-xs text-muted"><Paperclip size={13} aria-hidden /> {proof.name} · {fileSize(proof.size)}</span>}
                </div>
              )}
            </FormField>
          </>
        )}
      </div>
      <p className="flex items-start gap-2 text-xs text-muted"><Mail size={14} className="mt-0.5 shrink-0" aria-hidden /> {gateway ? 'A payment confirmation' : 'An email with the proof of payment attached'} will be sent to {credits[0].referrerEmail}, and the status and transaction details are kept in Payout history.</p>
    </form>
  )
}

const profileSchema = z.object({
  phone: z.string().trim().refine((v) => v === '' || PHONE_RE.test(v), 'Enter a valid phone number, e.g. +91 98765 43210.'),
  upiId: z.string().trim().refine((v) => v === '' || UPI_RE.test(v), 'Enter a valid UPI ID, e.g. name@okhdfcbank.'),
})

/** Add or update the referee's phone number and UPI ID. */
function ProfileDialog({ credit, onClose, onDone }: { credit: ReferralRow | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={!!credit} onClose={onClose} title="Referee payment details" description={credit ? `${credit.referrer} · ${credit.referrerEmail}` : undefined}
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" form="profile-form">Save details</button></>}>
      {credit && <ProfileForm credit={credit} onClose={onClose} onDone={onDone} />}
    </Dialog>
  )
}

function ProfileForm({ credit, onClose, onDone }: { credit: ReferralRow; onClose: () => void; onDone: () => void }) {
  const profile = useFinanceStore((st) => st.profiles[credit.referrerEmail])
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(profileSchema), defaultValues: { phone: profile?.phone ?? '', upiId: profile?.upiId ?? '' } })
  const submit = handleSubmit(async (v) => {
    try {
      await updateReferrerProfile(credit.referrerEmail, credit.referrer, credit.journal, v)
      toast.success('Referee details saved')
      onDone()
      onClose()
    } catch (e) { toast.error((e as Error).message) }
  })
  return (
    <form id="profile-form" onSubmit={submit} noValidate className="space-y-4">
      <FormField label="Phone number" error={errors.phone?.message} hint="Shown in the payment section so you can reach the referee.">{(a) => <input {...a} type="tel" className="input" placeholder="+91 98765 43210" {...register('phone')} />}</FormField>
      <FormField label="UPI ID" error={errors.upiId?.message} hint="Shown to admins when paying manually.">{(a) => <input {...a} className="input font-mono" placeholder="name@okhdfcbank" autoComplete="off" {...register('upiId')} />}</FormField>
      <p className="text-xs text-muted">Referees can also add or update their own UPI ID from Track My Paper on the journal website. {profile?.updatedAt ? `Last updated ${formatDate(profile.updatedAt)}${profile.updatedBy ? ` by ${profile.updatedBy}` : ''}.` : ''}</p>
    </form>
  )
}

/** Change the referral credit per journal, e.g. ₹150 or ₹250. */
function AmountDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const journals = useScopeJournals()
  const amounts = useFinanceStore((st) => st.amounts)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [apply, setApply] = useState(false)
  const [busy, setBusy] = useState(false)
  const value = (j: JournalCode) => draft[j] ?? String(amounts[j])
  const save = async () => {
    const next: Partial<Record<JournalCode, number>> = {}
    for (const j of journals) next[j] = Number(value(j))
    setBusy(true)
    try {
      const n = await setReferralAmounts(next, apply)
      toast.success(apply && n ? `Referral amount saved. ${n} unpaid credit${n === 1 ? '' : 's'} updated.` : 'Referral amount saved for new credits.')
      onDone()
      setDraft({})
      onClose()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Referral amount" description="The credit a referrer earns when a referred paper is published. Set it per journal."
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save amount'}</button></>}>
      <ul className="space-y-3">
        {journals.map((j) => (
          <li key={j} className="flex items-center justify-between gap-3">
            <label htmlFor={`amt-${j}`} className="flex items-center gap-2 text-sm font-medium"><JournalBadge code={j} /> <span className="hidden text-xs font-normal text-muted sm:inline">{JOURNALS.find((x) => x.code === j)?.name.slice(0, 40)}…</span></label>
            <div className="relative w-36"><span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
              <input id={`amt-${j}`} type="number" min={1} step={1} inputMode="numeric" className="input pl-7 text-right tabular-nums" value={value(j)} onChange={(e) => setDraft((d) => ({ ...d, [j]: e.target.value }))} /></div>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-lg border border-line p-3"><Switch checked={apply} onChange={setApply} label="Also update credits that are not paid yet" description="Pending and Eligible credits take the new amount. Paid and cancelled credits never change." /></div>
    </Dialog>
  )
}

/** Edit the amount of a single credit (for example one agreed at a different rate). */
function CreditAmountDialog({ credit, onClose, onDone }: { credit: ReferralRow | null; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const current = credit ? String(credit.amount) : ''
  const save = async () => {
    setBusy(true)
    try {
      await updateCreditAmount(credit!.id, Number(v || current))
      toast.success(`Credit ${credit!.id} updated`)
      onDone()
      setV('')
      onClose()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={!!credit} onClose={onClose} width={420} title="Change credit amount" description={credit ? `${credit.id} · ${credit.referrer}` : undefined}
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <FormField label="Amount (INR)" required hint="For example 150 or 250.">{(a) => <input {...a} type="number" min={1} step={1} autoFocus className="input tabular-nums" value={v || current} onChange={(e) => setV(e.target.value)} />}</FormField>
    </Dialog>
  )
}
