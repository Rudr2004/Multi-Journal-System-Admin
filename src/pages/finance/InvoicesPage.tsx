import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText, ReceiptText, Undo2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { Drawer } from '@/components/Dialog'
import { ReasonDialog } from '@/components/ReasonDialog'
import { Tabs } from '@/components/Tabs'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { listCreditNotes, listInvoices, type CreditNoteRow, type InvoiceRow } from '@/mock/api/invoices'
import { refundPayment } from '@/mock/api/payments'
import { formatDate, formatMoney } from '@/shared/formatters'
import { DocActions, METHOD_LABEL, TaxDocument, type TaxDocData } from './parts'

const invoiceDoc = (i: InvoiceRow): TaxDocData => ({
  kind: 'invoice', number: i.invoiceNo, date: i.issuedAt, billTo: { name: i.payment.payer, email: i.paper?.authorEmail, country: i.paper?.authorCountry },
  journal: i.payment.journal, paperId: i.payment.paperId, paperTitle: i.paper?.title, currency: i.payment.currency, base: i.payment.base,
  cgst: i.payment.cgst, sgst: i.payment.sgst, igst: i.payment.igst, total: i.payment.total, reference: i.payment.reference, methodLabel: METHOD_LABEL[i.payment.method],
})
const creditDoc = (c: CreditNoteRow): TaxDocData => ({
  kind: 'credit_note', number: c.id, date: c.issuedAt, billTo: { name: c.payer, email: c.paper?.authorEmail, country: c.paper?.authorCountry },
  journal: c.journal, paperId: c.paperId, paperTitle: c.paper?.title, currency: c.currency, base: c.base, cgst: c.cgst, sgst: c.sgst, igst: c.igst, total: c.total,
  againstInvoice: c.invoiceNo, reason: c.reason, reference: c.payment?.reference,
})

const gstLabel = (p: { currency: 'INR' | 'USD'; cgst: number; igst: number }) => (p.currency === 'USD' ? 'No GST (USD)' : p.cgst > 0 ? 'CGST 9% + SGST 9%' : 'IGST 18%')

export function InvoicesPage() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'credit-notes' ? 'credit-notes' : 'invoices'
  const [gst, setGst] = useState('')
  const [invoice, setInvoice] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const inv = useAsync(() => listInvoices(journals), [journals.join()])
  const cns = useAsync(() => listCreditNotes(journals), [journals.join()])
  const reloadAll = () => { inv.reload(); cns.reload() }

  const invRows = useMemo(() => (inv.data ?? []).filter((i) => !gst || gstLabel(i.payment) === gst), [inv.data, gst])
  const curInvoice = inv.data?.find((i) => i.invoiceNo === invoice)
  const curNote = cns.data?.find((c) => c.id === note)

  const invCols: Column<InvoiceRow>[] = [
    { id: 'no', header: 'Invoice', locked: true, sort: (i) => i.invoiceNo, cell: (i) => <span className="whitespace-nowrap font-medium">{i.invoiceNo}</span> },
    { id: 'paper', header: 'Paper', sort: (i) => i.payment.paperId, cell: (i) => <Link to={`/submissions/${i.payment.paperId}`} className="whitespace-nowrap text-accent hover:underline">{i.payment.paperId}</Link> },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (i: InvoiceRow) => i.payment.journal, cell: (i: InvoiceRow) => <JournalBadge code={i.payment.journal} /> }] : []),
    { id: 'billTo', header: 'Bill to', sort: (i) => i.payment.payer, cell: (i) => i.payment.payer },
    { id: 'date', header: 'Date', sort: (i) => i.issuedAt, cell: (i) => <span className="whitespace-nowrap">{formatDate(i.issuedAt)}</span> },
    { id: 'gst', header: 'GST', cell: (i) => <span className="whitespace-nowrap text-muted">{gstLabel(i.payment)}</span> },
    { id: 'total', header: 'Total', align: 'right', sort: (i) => i.payment.total, cell: (i) => <span className="whitespace-nowrap font-medium tabular-nums">{formatMoney(i.payment.total, i.payment.currency)}</span> },
    { id: 'status', header: 'Status', cell: (i) => (i.creditNote ? <Badge tone="info">Credited · {i.creditNote.id}</Badge> : <Badge tone="success">Paid</Badge>) },
  ]
  const cnCols: Column<CreditNoteRow>[] = [
    { id: 'no', header: 'Credit note', locked: true, sort: (c) => c.id, cell: (c) => <span className="whitespace-nowrap font-medium">{c.id}</span> },
    { id: 'inv', header: 'Against invoice', sort: (c) => c.invoiceNo, cell: (c) => <span className="whitespace-nowrap">{c.invoiceNo}</span> },
    { id: 'paper', header: 'Paper', cell: (c) => <Link to={`/submissions/${c.paperId}`} className="whitespace-nowrap text-accent hover:underline">{c.paperId}</Link> },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (c: CreditNoteRow) => c.journal, cell: (c: CreditNoteRow) => <JournalBadge code={c.journal} /> }] : []),
    { id: 'payer', header: 'Credited to', cell: (c) => c.payer },
    { id: 'reason', header: 'Reason', cell: (c) => <span className="line-clamp-2 max-w-[320px]" title={c.reason}>{c.reason}</span> },
    { id: 'date', header: 'Issued', sort: (c) => c.issuedAt, cell: (c) => <span className="whitespace-nowrap">{formatDate(c.issuedAt)}</span> },
    { id: 'total', header: 'Amount', align: 'right', sort: (c) => c.total, cell: (c) => <span className="whitespace-nowrap font-medium tabular-nums">{formatMoney(c.total, c.currency)}</span> },
  ]

  return (
    <>
      <PageHeader title="Invoices & credit notes" description="GST invoices are issued when a payment is verified. Credit notes are created automatically when a payment is refunded." />
      <Tabs value={tab} onChange={(t) => setParams(t === 'invoices' ? {} : { tab: t }, { replace: true })} tabs={[
        { id: 'invoices', label: 'Invoices', badge: inv.data?.length, content: (
          <DataTable id="invoices" data={invRows} columns={invCols} rowKey={(i) => i.invoiceNo} loading={inv.loading && !inv.data} error={!!inv.error} onRetry={inv.reload}
            onRowClick={(i) => setInvoice(i.invoiceNo)}
            search={{ placeholder: 'Search invoice, paper or payer', text: (i) => `${i.invoiceNo} ${i.payment.paperId} ${i.payment.payer}` }}
            filters={<SelectFilter label="GST" value={gst} onChange={setGst} options={['CGST 9% + SGST 9%', 'IGST 18%', 'No GST (USD)'].map((v) => ({ value: v, label: v }))} />}
            empty={{ icon: ReceiptText, title: 'No invoices yet', hint: 'An invoice is generated as soon as a payment is verified.' }} />
        ) },
        { id: 'credit-notes', label: 'Credit notes', badge: cns.data?.length, content: (
          <DataTable id="credit-notes" data={cns.data ?? []} columns={cnCols} rowKey={(c) => c.id} loading={cns.loading && !cns.data} error={!!cns.error} onRetry={cns.reload}
            onRowClick={(c) => setNote(c.id)}
            search={{ placeholder: 'Search credit note, invoice or paper', text: (c) => `${c.id} ${c.invoiceNo} ${c.paperId} ${c.payer}` }}
            empty={{ icon: Undo2, title: 'No credit notes', hint: 'Refund a verified payment from the Payments screen to issue a credit note.' }} />
        ) },
      ]} />

      <Drawer open={!!curInvoice} onClose={() => setInvoice(null)} title={curInvoice ? `Invoice ${curInvoice.invoiceNo}` : 'Invoice'} width={760}>
        {curInvoice && <InvoiceView row={curInvoice} onChanged={reloadAll} onOpenNote={(id) => { setInvoice(null); setParams({ tab: 'credit-notes' }, { replace: true }); setNote(id) }} />}
      </Drawer>
      <Drawer open={!!curNote} onClose={() => setNote(null)} title={curNote ? `Credit note ${curNote.id}` : 'Credit note'} width={760}>
        {curNote && <DocView doc={creditDoc(curNote)} name={curNote.id} />}
      </Drawer>
    </>
  )
}

function DocView({ doc, name, extra }: { doc: TaxDocData; name: string; extra?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><DocActions docRef={ref} name={name} />{extra}</div>
      <div className="overflow-x-auto"><TaxDocument doc={doc} innerRef={ref} /></div>
    </div>
  )
}

function InvoiceView({ row, onChanged, onOpenNote }: { row: InvoiceRow; onChanged: () => void; onOpenNote: (id: string) => void }) {
  const perm = usePermission('payments')
  const [refunding, setRefunding] = useState(false)
  const refundable = ['verified', 'verified_auto'].includes(row.payment.status)
  return (
    <>
      <DocView doc={invoiceDoc(row)} name={row.invoiceNo} extra={row.creditNote
        ? <button className="btn-secondary" onClick={() => onOpenNote(row.creditNote!.id)}><FileText size={15} strokeWidth={1.5} aria-hidden /> View credit note {row.creditNote.id}</button>
        : <GuardedButton className="btn-secondary" allowed={refundable && perm.can('manage')} why={perm.why('manage') ?? 'Only verified payments can be refunded.'} onClick={() => setRefunding(true)}><Undo2 size={15} strokeWidth={1.5} aria-hidden /> Refund & create credit note</GuardedButton>} />
      <ReasonDialog open={refunding} onClose={() => setRefunding(false)} danger confirmLabel="Refund & issue credit note" title="Create credit note"
        description={`Invoice ${row.invoiceNo} · ${formatMoney(row.payment.total, row.payment.currency)}`} label="Reason for the credit note"
        consequences={['The payment is refunded in full and marked Refunded.', 'A credit note is issued against this invoice with the tax reversed.', 'The author is emailed the credit note.']}
        onSubmit={async (reason) => {
          try { const n = await refundPayment(row.payment.id, reason); toast.success(`Credit note ${n.id} issued.`); onChanged() } catch (e) { toast.error((e as Error).message) }
        }} />
    </>
  )
}
