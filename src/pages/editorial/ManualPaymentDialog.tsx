import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Paperclip } from 'lucide-react'
import type { Paper, Payment } from '@/shared/types'
import { computeGst } from '@/shared/gst'
import { formatMoney } from '@/shared/formatters'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { recordManualPayment } from '@/mock/api/payments'

const today = () => new Date().toISOString().slice(0, 10)

const schema = z.object({
  method: z.enum(['upi', 'bank_transfer', 'other']),
  reference: z.string().trim().min(6, 'Enter the UTR or transaction reference (at least 6 characters).').max(60),
  date: z.string().min(1, 'Choose the date the author paid.').refine((d) => d <= today(), 'The payment date cannot be in the future.'),
  note: z.string().trim().max(300, 'Keep the note under 300 characters.'),
})

const METHODS = [
  { value: 'upi', label: 'UPI', hint: 'The author paid to the journal UPI ID. Use the 12-digit UTR from the payment app.' },
  { value: 'bank_transfer', label: 'Bank transfer', hint: 'NEFT, RTGS or IMPS. Use the bank reference.' },
  { value: 'other', label: 'Other', hint: 'Cheque, demand draft or another offline method.' },
] as const

/** Verify a payment the author made by UPI (or another offline way) in one step. */
export function ManualPaymentDialog({ open, paper, existing, onClose }: { open: boolean; paper: Paper; existing?: Payment; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} width={560} title="Manual payment" description={`${paper.id} · verify a payment the author made outside the payment gateway`}
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" form="manual-payment-form">Verify payment</button></>}>
      {open && <Form paper={paper} existing={existing} onClose={onClose} />}
    </Dialog>
  )
}

function Form({ paper, existing, onClose }: { paper: Paper; existing?: Payment; onClose: () => void }) {
  const india = paper.authorCountry === 'India'
  const g = existing ? { currency: existing.currency, base: existing.base, cgst: existing.cgst, sgst: existing.sgst, igst: existing.igst, total: existing.total } : computeGst(india ? 2500 : 49, india ? 'INR' : 'USD', india ? 'Gujarat' : undefined)
  const [proof, setProof] = useState<string>()
  const { register, handleSubmit, watch, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { method: 'upi' as const, reference: '', date: today(), note: '' } })
  const method = watch('method')
  const submit = handleSubmit(async (v) => {
    try {
      const r = await recordManualPayment(paper.id, { ...v, proofName: proof })
      toast.success(`Payment verified · invoice ${r.invoiceNo} sent${r.assigneeName ? ` · assigned to ${r.assigneeName}` : ' · no Associate Editor assigned yet'}.`)
      onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'The payment could not be recorded.') }
  })
  return (
    <form id="manual-payment-form" onSubmit={submit} noValidate className="space-y-4">
      <div className="rounded-lg bg-subtle px-3 py-2.5 text-sm">
        <div className="flex items-center justify-between gap-3"><span className="text-muted">Amount payable (incl. GST)</span><span className="text-lg font-semibold tabular-nums">{formatMoney(g.total, g.currency)}</span></div>
        <p className="mt-0.5 text-xs text-muted">{g.currency === 'INR' ? `${formatMoney(g.base, 'INR')} + ${g.igst ? `IGST ${formatMoney(g.igst, 'INR')}` : `CGST ${formatMoney(g.cgst, 'INR')} + SGST ${formatMoney(g.sgst, 'INR')}`}` : 'No GST on USD payments from foreign authors'}</p>
      </div>
      <fieldset>
        <legend className="label">Payment method</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {METHODS.map((m) => (
            <label key={m.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" value={m.value} className="accent-indigo-600" {...register('method')} /> {m.label}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">{METHODS.find((m) => m.value === method)?.hint}</p>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={method === 'upi' ? 'UTR / UPI reference' : 'Transaction reference'} required error={errors.reference?.message}>{(a) => <input {...a} className="input font-mono" autoComplete="off" placeholder={method === 'upi' ? '412345678901' : 'Reference'} {...register('reference')} />}</FormField>
        <FormField label="Date paid" required error={errors.date?.message}>{(a) => <input {...a} type="date" max={today()} className="input" {...register('date')} />}</FormField>
      </div>
      <FormField label="Proof of payment (optional)" hint="Screenshot or receipt the author sent. Only the file name is kept in this prototype.">
        {(a) => (
          <div className="flex flex-wrap items-center gap-3">
            <input {...a} type="file" accept="image/png,image/jpeg,application/pdf" className="input !h-auto py-1.5" onChange={(e) => setProof(e.target.files?.[0]?.name)} />
            {proof && <span className="inline-flex items-center gap-1 text-xs text-muted"><Paperclip size={13} aria-hidden /> {proof}</span>}
          </div>
        )}
      </FormField>
      <FormField label="Note (optional)" error={errors.note?.message}>{(a) => <textarea {...a} rows={2} className="input !h-auto py-2" placeholder="e.g. Author called the helpdesk; screenshot matched the bank statement." {...register('note')} />}</FormField>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
        <li>The payment is marked verified and a GST invoice is emailed to {paper.authorEmail}.</li>
        <li>The paper moves to Paid and is assigned to an Associate Editor for production.</li>
        <li>It is recorded in the paper timeline and the audit log under your name.</li>
      </ul>
    </form>
  )
}
