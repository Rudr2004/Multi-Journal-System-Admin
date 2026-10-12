import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, CheckCircle2, CircleDollarSign, Clock, Mail, Undo2, UserCheck, XCircle } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { ConfirmDialog, Drawer } from '@/components/Dialog'
import { DescriptionList } from '@/components/Form'
import { KpiCard } from '@/components/KpiCard'
import { ReasonDialog } from '@/components/ReasonDialog'
import { RelativeTime } from '@/components/Time'
import { Timeline } from '@/components/Timeline'
import { GuardedButton } from '@/components/Tooltip'
import { ProofViewer } from '@/components/Viewers'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import {
  assignProduction, eligibleAssociateEditors, isOffline, listPayments, refundPayment, rejectPayment, verifyPayment, type PaymentRow, type VerifyResult,
} from '@/mock/api/payments'
import { useDataStore } from '@/mock/store'
import { formatDate, formatDateTime, formatMoney } from '@/shared/formatters'
import { METHOD_LABEL, PAYMENT_STATUS, PaymentStatusBadge } from './parts'

export function PaymentsPage() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const [f, setF] = useState({ status: '', method: '', currency: '', from: '', to: '' })
  const [openId, setOpenId] = useState<string | null>(null)
  const r = useAsync(() => listPayments(journals), [journals.join()])

  const rows = useMemo(() => (r.data ?? []).filter((p) => {
    const day = p.createdAt.slice(0, 10)
    return (!f.status || p.status === f.status) && (!f.method || p.method === f.method) && (!f.currency || p.currency === f.currency)
      && (!f.from || day >= f.from) && (!f.to || day <= f.to)
  }), [r.data, f])
  const current = r.data?.find((p) => p.id === openId)

  const sum = (cur: 'INR' | 'USD') => (r.data ?? []).filter((p) => p.currency === cur && ['verified', 'verified_auto'].includes(p.status)).reduce((a, p) => a + p.total, 0)
  const pending = (r.data ?? []).filter((p) => p.status === 'pending_verification').length
  const loadingFirst = r.loading && !r.data

  const columns: Column<PaymentRow>[] = [
    { id: 'id', header: 'Payment', locked: true, sort: (p) => p.id, cell: (p) => <span className="whitespace-nowrap font-medium">{p.id}</span> },
    { id: 'paper', header: 'Paper', sort: (p) => p.paperId, cell: (p) => (
      <div className="min-w-0">
        <Link to={`/submissions/${p.paperId}`} className="whitespace-nowrap font-medium text-accent hover:underline">{p.paperId}</Link>
        {p.paper && <p className="line-clamp-2 max-w-[300px] text-sm text-muted" title={p.paper.title}>{p.paper.title}</p>}
      </div>
    ) },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (p: PaymentRow) => p.journal, cell: (p: PaymentRow) => <JournalBadge code={p.journal} /> }] : []),
    { id: 'payer', header: 'Payer', sort: (p) => p.payer, cell: (p) => p.payer },
    { id: 'method', header: 'Method', sort: (p) => p.method, cell: (p) => (
      <div><p>{METHOD_LABEL[p.method]}</p><p className="text-xs text-muted">{isOffline(p.method) ? 'Offline · manual check' : 'Online'}</p></div>
    ) },
    { id: 'amount', header: 'Amount', align: 'right', sort: (p) => (p.currency === 'USD' ? p.total * 83 : p.total), cell: (p) => (
      <div className="whitespace-nowrap"><p className="font-medium tabular-nums">{formatMoney(p.total, p.currency)}</p>
        <p className="text-xs text-muted">{p.currency === 'USD' ? 'No GST' : `incl. ${formatMoney(p.cgst + p.sgst + p.igst, 'INR')} GST`}</p></div>
    ) },
    { id: 'status', header: 'Status', sort: (p) => p.status, cell: (p) => <PaymentStatusBadge status={p.status} /> },
    { id: 'date', header: 'Created', sort: (p) => p.createdAt, cell: (p) => <RelativeTime value={p.createdAt} /> },
    { id: 'actions', header: '', locked: true, mobileHide: true, cell: (p) => (
      <button className={p.status === 'pending_verification' ? 'btn-primary !h-8' : 'btn-ghost !h-8'} onClick={() => setOpenId(p.id)}>{p.status === 'pending_verification' ? 'Review proof' : 'Details'}</button>
    ) },
  ]

  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  return (
    <>
      <PageHeader title="Payments" description="Online payments are verified automatically. Offline UPI and bank-transfer proofs wait here for an editor to verify or reject." />
      <section aria-label="Payment summary" className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Awaiting verification" value={pending} icon={Clock} tone={pending ? 'warning' : 'default'} loading={loadingFirst} hint="Offline proofs to check" />
        <KpiCard label="Collected (INR, incl. GST)" value={formatMoney(sum('INR'), 'INR')} icon={CircleDollarSign} loading={loadingFirst} />
        <KpiCard label="Collected (USD)" value={formatMoney(sum('USD'), 'USD')} icon={CircleDollarSign} loading={loadingFirst} />
        <KpiCard label="Refunded" value={(r.data ?? []).filter((p) => p.status === 'refunded').length} icon={Undo2} loading={loadingFirst} hint="Each has a credit note" />
      </section>

      <DataTable id="payments" data={rows} columns={columns} rowKey={(p) => p.id} loading={loadingFirst} error={!!r.error} onRetry={r.reload}
        onRowClick={(p) => setOpenId(p.id)}
        search={{ placeholder: 'Search payment, paper, payer or reference', text: (p) => `${p.id} ${p.paperId} ${p.payer} ${p.reference} ${p.invoiceNo ?? ''}` }}
        views={{ filters: f, applyFilters: (x) => setF(x as typeof f) }}
        filters={<>
          <SelectFilter label="Status" value={f.status} onChange={set('status')} options={Object.entries(PAYMENT_STATUS).map(([value, m]) => ({ value, label: m.label }))} />
          <SelectFilter label="Method" value={f.method} onChange={set('method')} options={Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }))} />
          <SelectFilter label="Currency" value={f.currency} onChange={set('currency')} options={[{ value: 'INR', label: 'INR (₹)' }, { value: 'USD', label: 'USD ($)' }]} />
          <label className="flex items-center gap-1.5 text-xs text-muted">From<input type="date" aria-label="From date" className="input !w-auto" value={f.from} max={f.to || undefined} onChange={(e) => set('from')(e.target.value)} /></label>
          <label className="flex items-center gap-1.5 text-xs text-muted">To<input type="date" aria-label="To date" className="input !w-auto" value={f.to} min={f.from || undefined} onChange={(e) => set('to')(e.target.value)} /></label>
          {Object.values(f).some(Boolean) && <button className="btn-ghost" onClick={() => setF({ status: '', method: '', currency: '', from: '', to: '' })}>Clear filters</button>}
        </>}
        rowClassName={(p) => (p.status === 'pending_verification' ? 'bg-amber-50/40' : undefined)}
        empty={{ icon: CircleDollarSign, title: 'No payments match', hint: 'Adjust the filters or the date range to see more payments.' }} />

      <Drawer open={!!current} onClose={() => setOpenId(null)} title={current ? `Payment ${current.id}` : 'Payment'} width={560}>
        {current && <PaymentDetail key={current.id} row={current} onChanged={r.reload} />}
      </Drawer>
    </>
  )
}

function PaymentDetail({ row: p, onChanged }: { row: PaymentRow; onChanged: () => void }) {
  const perm = usePermission('payments')
  const canApprove = perm.can('approve')
  const events = useDataStore((s) => s.events)
  const trail = useMemo(() => events.filter((e) => e.paperId === p.paperId).slice(0, 5), [events, p.paperId])
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [assignedName, setAssignedName] = useState<string | undefined>()
  const [confirmVerify, setConfirmVerify] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [busy, setBusy] = useState(false)
  const offline = isOffline(p.method)

  const verify = async () => {
    setBusy(true)
    try {
      const res = await verifyPayment(p.id)
      setResult(res)
      toast.success(`Payment verified · invoice ${res.invoiceNo} sent to the author`)
      onChanged()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <PaymentStatusBadge status={p.status} />
        {p.status === 'verified_auto' && <span className="inline-flex items-center gap-1 text-xs text-green-700"><BadgeCheck size={14} aria-hidden /> Confirmed by the payment gateway, no manual check needed</span>}
      </div>

      {result && <VerifySuccess result={result} assignedName={assignedName} onAssigned={(n) => { setAssignedName(n); onChanged() }} />}

      {p.status === 'rejected' && p.rejectReason && (
        <div role="note" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><p className="font-medium">Proof rejected</p><p className="mt-0.5">{p.rejectReason}</p></div>
      )}

      <DescriptionList items={[
        { label: 'Paper', value: <><Link to={`/submissions/${p.paperId}`} className="whitespace-nowrap font-medium text-accent hover:underline">{p.paperId}</Link>{p.paper && <p className="line-clamp-2 text-muted" title={p.paper.title}>{p.paper.title}</p>}</> },
        { label: 'Journal', value: <JournalBadge code={p.journal} /> },
        { label: 'Payer', value: p.payer },
        { label: 'Method', value: <>{METHOD_LABEL[p.method]} {offline ? <Badge tone="neutral">Offline</Badge> : <Badge tone="success">Online</Badge>}</> },
        { label: 'Reference / UTR', value: <code className="font-mono text-xs">{p.reference}</code> },
        { label: 'Created', value: formatDateTime(p.createdAt) },
        ...(p.invoiceNo ? [{ label: 'Invoice', value: <Link to="/invoices" className="font-medium text-accent hover:underline">{p.invoiceNo}</Link> }] : []),
        ...(p.refundedAt ? [{ label: 'Refunded', value: formatDate(p.refundedAt) }] : []),
      ]} />

      <section aria-label="Amount">
        <h3 className="mb-2 text-sm font-semibold">Amount</h3>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            <tr><td className="py-1.5 text-muted">Article processing charge</td><td className="py-1.5 text-right tabular-nums">{formatMoney(p.base, p.currency)}</td></tr>
            {p.currency === 'INR' ? (<>
              <tr><td className="py-1.5 text-muted">CGST 9%</td><td className="py-1.5 text-right tabular-nums">{p.cgst ? formatMoney(p.cgst, 'INR') : '—'}</td></tr>
              <tr><td className="py-1.5 text-muted">SGST 9%</td><td className="py-1.5 text-right tabular-nums">{p.sgst ? formatMoney(p.sgst, 'INR') : '—'}</td></tr>
              <tr><td className="py-1.5 text-muted">IGST 18%</td><td className="py-1.5 text-right tabular-nums">{p.igst ? formatMoney(p.igst, 'INR') : '—'}</td></tr>
            </>) : <tr><td className="py-1.5 text-muted">GST</td><td className="py-1.5 text-right text-muted">Not applicable (USD)</td></tr>}
            <tr className="font-semibold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{formatMoney(p.total, p.currency)}</td></tr>
          </tbody>
        </table>
      </section>

      {offline && (p.status === 'awaiting_proof'
        ? <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">The author has chosen an offline method but has not uploaded a payment proof yet.</div>
        : <section aria-label="Payment proof"><h3 className="mb-2 text-sm font-semibold">Proof uploaded by the author</h3>
          <ProofViewer caption={p.proofLabel ?? 'Payment proof'} reference={p.reference} amount={formatMoney(p.total, p.currency)} date={formatDate(p.createdAt)} /></section>)}

      {trail.length > 0 && <section aria-label="Paper activity"><h3 className="mb-3 text-sm font-semibold">Recent paper activity</h3><Timeline items={trail} /></section>}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap gap-2 border-t border-line bg-surface px-5 py-3">
        {p.status === 'pending_verification' && (<>
          <GuardedButton className="btn-primary" allowed={canApprove} why={perm.why('approve')} disabled={busy} onClick={() => setConfirmVerify(true)}><CheckCircle2 size={15} strokeWidth={1.5} aria-hidden /> {busy ? 'Verifying…' : 'Verify payment'}</GuardedButton>
          <GuardedButton className="btn-danger" allowed={canApprove} why={perm.why('approve')} disabled={busy} onClick={() => setRejecting(true)}><XCircle size={15} strokeWidth={1.5} aria-hidden /> Reject proof</GuardedButton>
        </>)}
        {(p.status === 'verified' || p.status === 'verified_auto') && (
          <GuardedButton className="btn-secondary" allowed={canApprove} why={perm.why('approve')} onClick={() => setRefunding(true)}><Undo2 size={15} strokeWidth={1.5} aria-hidden /> Refund…</GuardedButton>
        )}
        {!['pending_verification', 'verified', 'verified_auto'].includes(p.status) && <p className="text-sm text-muted">No actions available for a payment that is {PAYMENT_STATUS[p.status].label.toLowerCase()}.</p>}
      </div>

      <ConfirmDialog open={confirmVerify} onClose={() => setConfirmVerify(false)} title="Verify this payment?" confirmLabel="Verify & send invoice"
        consequences={[
          `Mark ${formatMoney(p.total, p.currency)} (${p.reference}) as received.`,
          'Generate the GST invoice and email it to the author.',
          'Move the paper to Paid and assign it to the journal’s Associate Editor for production.',
        ]} onConfirm={verify} />
      <ReasonDialog open={rejecting} onClose={() => setRejecting(false)} danger confirmLabel="Reject proof" title="Reject payment proof"
        description={`${p.id} · ${formatMoney(p.total, p.currency)} · ${p.reference}`} label="Reason for rejection"
        consequences={['The paper stays at “Payment pending”.', 'The author is emailed the reason and asked to upload a clear proof again.']}
        emailPreview={{ to: p.paper?.authorEmail ?? p.payer, subject: `Payment proof for ${p.paperId} could not be verified`,
          body: (reason) => `Dear ${p.payer},\n\nWe could not verify the payment proof you uploaded for ${p.paperId} (${p.reference}).\n\nReason: ${reason}\n\nPlease upload a clear proof from your author dashboard so we can continue with production.\n\nRegards,\nEdTech Publishers accounts team` }}
        onSubmit={async (reason) => {
          try { await rejectPayment(p.id, reason); toast.success('Proof rejected. The author has been emailed.'); onChanged() } catch (e) { toast.error((e as Error).message) }
        }} />
      <ReasonDialog open={refunding} onClose={() => setRefunding(false)} danger confirmLabel="Refund & issue credit note" title="Refund payment"
        description={`${p.id} · ${formatMoney(p.total, p.currency)} · invoice ${p.invoiceNo}`} label="Reason for refund"
        consequences={[`Refund ${formatMoney(p.total, p.currency)} in full to the author.`, 'Issue a credit note against the invoice (tax adjusted).', 'The author is emailed the credit note.']}
        onSubmit={async (reason) => {
          try { const n = await refundPayment(p.id, reason); toast.success(`Refunded. Credit note ${n.id} issued.`); onChanged() } catch (e) { toast.error((e as Error).message) }
        }} />
    </div>
  )
}

function VerifySuccess({ result, assignedName, onAssigned }: { result: VerifyResult; assignedName?: string; onAssigned: (name: string) => void }) {
  const options = eligibleAssociateEditors(result.journal)
  const [pick, setPick] = useState('')
  const [saving, setSaving] = useState(false)
  const name = assignedName ?? result.assigneeName
  const assign = async () => {
    if (!pick) return
    setSaving(true)
    try { const n = await assignProduction(result.paperId, pick); toast.success(`${result.paperId} assigned to ${n}`); onAssigned(n) } catch (e) { toast.error((e as Error).message) } finally { setSaving(false) }
  }
  return (
    <div role="status" className="space-y-2.5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
      <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={16} aria-hidden /> Payment verified</p>
      <p className="flex items-start gap-2"><Mail size={15} className="mt-0.5 shrink-0" aria-hidden /><span><strong>Invoice sent</strong> — {result.invoiceNo} emailed to {result.authorEmail}. Paper status: Paid.</span></p>
      {name ? (
        <p className="flex items-start gap-2"><UserCheck size={15} className="mt-0.5 shrink-0" aria-hidden /><span><strong>Assigned to Associate Editor {name}</strong> — {result.paperId} now appears in their <Link to="/production" className="font-medium underline">production queue</Link>.</span></p>
      ) : (
        <div className="space-y-2">
          <p className="flex items-start gap-2"><UserCheck size={15} className="mt-0.5 shrink-0" aria-hidden /><span><strong>Unassigned — assign in Production queue.</strong> {result.journal} has no Associate Editor of its own. Pick one now:</span></p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <label htmlFor="ae-pick" className="label">Assign Associate Editor</label>
              <select id="ae-pick" className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Choose an Associate Editor…</option>
                {options.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.title}</option>)}
              </select>
            </div>
            <button className="btn-primary" disabled={!pick || saving} onClick={assign}>{saving ? 'Assigning…' : 'Assign'}</button>
          </div>
          {options.length === 0 && <p className="text-xs">No active user holds the Associate Editor role. Add one in Users & roles.</p>}
        </div>
      )}
    </div>
  )
}
