import { Download, Printer } from 'lucide-react'
import { Badge } from '@/components/Badges'
import { toast } from '@/components/Toasts'
import { computeGst } from '@/shared/gst'
import { formatDate, formatMoney } from '@/shared/formatters'
import { journalByCode } from '@/mock/data/core'
import type { JournalCode, PaymentMethod, PaymentRecordStatus } from '@/shared/types'
import type { Tone } from '@/shared/statuses'

export const PAYMENT_STATUS: Record<PaymentRecordStatus, { label: string; tone: Tone }> = {
  verified_auto: { label: 'Verified automatically', tone: 'success' },
  awaiting_proof: { label: 'Awaiting proof', tone: 'neutral' },
  pending_verification: { label: 'Pending verification', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  refunded: { label: 'Refunded', tone: 'info' },
}

export const METHOD_LABEL: Record<PaymentMethod, string> = { razorpay: 'Razorpay', card: 'Card', upi: 'UPI', bank_transfer: 'Bank transfer', other: 'Other' }

export const PaymentStatusBadge = ({ status }: { status: PaymentRecordStatus }) => <Badge tone={PAYMENT_STATUS[status].tone}>{PAYMENT_STATUS[status].label}</Badge>

/** Opens the element in a print window carrying the app's stylesheets — "Save as PDF" in the print dialog produces the PDF. */
export function printElement(el: HTMLElement | null, title: string) {
  if (!el) return
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) { toast.error('Your browser blocked the print window. Allow pop-ups for this site and try again.'); return }
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('\n')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>${styles}<style>body{background:#fff;padding:24px}@page{margin:12mm}</style></head><body>${el.outerHTML}</body></html>`)
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch { /* window already closed */ } }, 600)
}

export interface TaxDocData {
  kind: 'invoice' | 'credit_note'
  number: string
  date: string
  billTo: { name: string; email?: string; country?: string }
  journal: JournalCode
  paperId: string
  paperTitle?: string
  currency: 'INR' | 'USD'
  base: number
  cgst: number
  sgst: number
  igst: number
  total: number
  reference?: string
  methodLabel?: string
  /** Credit notes only */
  againstInvoice?: string
  reason?: string
}

export const COMPANY = {
  name: 'EdTech Publishers Pvt. Ltd.',
  address: ['Ahmedabad, Gujarat 380015', 'India'],
  gstin: '24AAAAA0000A1Z5',
  email: 'accounts@edtechpublishers.in',
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <tr className={strong ? 'border-t-2 border-slate-800 font-semibold' : muted ? 'text-slate-400' : ''}>
      <td className="py-1.5 pr-4">{label}</td>
      <td className="py-1.5 text-right tabular-nums">{value}</td>
    </tr>
  )
}

/** GST invoice / credit note. The GST breakdown is always shown, including "not applicable" lines for USD. */
export function TaxDocument({ doc, innerRef }: { doc: TaxDocData; innerRef?: React.Ref<HTMLDivElement> }) {
  const j = journalByCode(doc.journal)
  const isCn = doc.kind === 'credit_note'
  const intra = doc.cgst > 0
  const inter = doc.igst > 0
  const usd = doc.currency === 'USD'
  const basis = computeGst(doc.base, doc.currency, intra ? 'Gujarat' : 'Other').note
  const m = (n: number) => formatMoney(n, doc.currency)
  const na = (n: number, applies: boolean) => (applies ? m(n) : '—')
  const totalGst = doc.cgst + doc.sgst + doc.igst
  return (
    <div ref={innerRef} aria-label={`${isCn ? 'Credit note' : 'Tax invoice'} ${doc.number}`} className="rounded-lg border border-line bg-white p-6 text-[13px] leading-5 text-slate-800 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">E</span>
            <p className="text-base font-semibold text-slate-900">{COMPANY.name}</p>
          </div>
          <p className="mt-2 text-slate-500">{COMPANY.address.join(', ')}</p>
          <p className="text-slate-500">GSTIN: <span className="font-medium text-slate-800">{COMPANY.gstin}</span> <span className="text-slate-400">(placeholder)</span></p>
          <p className="text-slate-500">{COMPANY.email}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold uppercase tracking-wide text-slate-900">{isCn ? 'Credit note' : 'Tax invoice'}</p>
          <p className="mt-1">No. <span className="font-semibold">{doc.number}</span></p>
          <p>Date: {formatDate(doc.date)}</p>
          {isCn && doc.againstInvoice && <p>Against invoice: <span className="font-medium">{doc.againstInvoice}</span></p>}
        </div>
      </div>

      <div className="mt-6 grid gap-5 border-t border-slate-200 pt-5 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Bill to</p>
          <p className="mt-1 font-medium text-slate-900">{doc.billTo.name}</p>
          {doc.billTo.email && <p className="text-slate-500">{doc.billTo.email}</p>}
          {doc.billTo.country && <p className="text-slate-500">{doc.billTo.country}</p>}
          <p className="mt-1 text-slate-500">Place of supply: {usd ? 'Outside India (export of services)' : intra ? 'Gujarat (intra-state)' : 'Other state (inter-state)'}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Journal</p>
          <p className="mt-1 font-medium text-slate-900">{j.name}</p>
          <p className="text-slate-500">{j.code} · ISSN {j.issn}</p>
          {doc.reference && <p className="mt-1 text-slate-500">Payment ref: <span className="font-mono text-xs text-slate-800">{doc.reference}</span>{doc.methodLabel ? ` · ${doc.methodLabel}` : ''}</p>}
        </div>
      </div>

      <table className="mt-6 w-full">
        <thead>
          <tr className="border-y border-slate-300 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <th className="px-2 py-2">#</th><th className="px-2 py-2">Description</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Rate</th><th className="px-2 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-200 align-top">
            <td className="px-2 py-3">1</td>
            <td className="px-2 py-3">
              <p className="font-medium text-slate-900">{isCn ? 'Refund of article processing charge (APC)' : 'Article processing charge (APC)'}</p>
              <p className="text-slate-500"><span className="whitespace-nowrap">{doc.paperId}</span>{doc.paperTitle ? ` — ${doc.paperTitle}` : ''}</p>
            </td>
            <td className="px-2 py-3 text-right tabular-nums">1</td>
            <td className="px-2 py-3 text-right tabular-nums">{m(doc.base)}</td>
            <td className="px-2 py-3 text-right tabular-nums">{m(doc.base)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-5 flex flex-wrap justify-between gap-6">
        <div className="max-w-xs text-slate-500">
          <p className="text-[11px] font-semibold uppercase tracking-wider">GST basis</p>
          <p className="mt-1">{usd ? 'No GST charged: services exported to a foreign author and paid in USD.' : `${basis}. ${intra ? 'Author is in Gujarat, the same state as the publisher.' : 'Author is outside Gujarat.'}`}</p>
          {isCn && doc.reason && <><p className="mt-3 text-[11px] font-semibold uppercase tracking-wider">Reason</p><p className="mt-1 text-slate-700">{doc.reason}</p></>}
        </div>
        <table className="min-w-[280px]" aria-label="GST breakdown">
          <tbody>
            <Row label="Taxable value" value={m(doc.base)} />
            <Row label="CGST @ 9%" value={na(doc.cgst, intra)} muted={!intra} />
            <Row label="SGST @ 9%" value={na(doc.sgst, intra)} muted={!intra} />
            <Row label="IGST @ 18%" value={na(doc.igst, inter)} muted={!inter} />
            <Row label="Total GST" value={usd ? 'Not applicable' : m(totalGst)} />
            <Row label={isCn ? 'Total credited' : 'Total payable'} value={m(doc.total)} strong />
          </tbody>
        </table>
      </div>

      <p className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-400">
        {isCn ? 'This credit note adjusts the invoice referenced above.' : 'This is a computer-generated invoice and does not require a signature.'} Generated by the EdTech Publishers journal admin.
      </p>
    </div>
  )
}

/** Download-PDF and Print buttons for a rendered document. */
export function DocActions({ docRef, name }: { docRef: React.RefObject<HTMLDivElement | null>; name: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-primary" onClick={() => { toast.success(`${name} ready — choose “Save as PDF” in the print dialog.`); printElement(docRef.current, name) }}>
        <Download size={15} strokeWidth={1.5} aria-hidden /> Download PDF
      </button>
      <button className="btn-secondary" onClick={() => printElement(docRef.current, name)}><Printer size={15} strokeWidth={1.5} aria-hidden /> Print</button>
    </div>
  )
}
