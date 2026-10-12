import type { JournalCode, Paper, Payment } from '@/shared/types'
import type { CreditNote } from '../data/financeExtra'
import { useDataStore } from '../store'
import { useFinanceStore } from '../stores/finance'
import { delay } from './latency'

export interface InvoiceRow {
  invoiceNo: string
  payment: Payment
  paper?: Paper
  issuedAt: string
  creditNote?: CreditNote
}

export interface CreditNoteRow extends CreditNote { paper?: Paper; payment?: Payment }

export function listInvoices(journals: JournalCode[]) {
  const { payments, papers } = useDataStore.getState()
  const { creditNotes } = useFinanceStore.getState()
  return delay(
    payments.filter((p) => p.invoiceNo && journals.includes(p.journal)).map((payment): InvoiceRow => ({
      invoiceNo: payment.invoiceNo!, payment, paper: papers.find((x) => x.id === payment.paperId), issuedAt: payment.createdAt,
      creditNote: creditNotes.find((c) => c.paymentId === payment.id),
    })).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
  )
}

export function listCreditNotes(journals: JournalCode[]) {
  const { payments, papers } = useDataStore.getState()
  return delay(
    useFinanceStore.getState().creditNotes.filter((c) => journals.includes(c.journal))
      .map((c): CreditNoteRow => ({ ...c, paper: papers.find((p) => p.id === c.paperId), payment: payments.find((p) => p.id === c.paymentId) }))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
  )
}
