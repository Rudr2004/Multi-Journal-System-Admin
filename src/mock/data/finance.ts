import type { Issue, JournalCode, Paper, Payment } from '@/shared/types'
import { computeGst } from '@/shared/gst'
import { NOW } from './papers'

const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)

const STATES = ['Gujarat', 'Maharashtra', 'Karnataka', 'Delhi', 'Kerala', 'Telangana']

function mk(p: Paper, n: number, method: Payment['method'], currency: 'INR' | 'USD', g: ReturnType<typeof computeGst>, status: Payment['status']): Payment {
  const offline = method === 'upi' || method === 'bank_transfer' || method === 'other'
  return {
    id: `PAY-${5000 + n}`,
    paperId: p.id,
    journal: p.journal,
    payer: p.author,
    method,
    currency,
    base: g.base,
    cgst: g.cgst,
    sgst: g.sgst,
    igst: g.igst,
    total: g.total,
    status,
    reference: offline ? `UTR${412000000000 + n * 7919}` : `pay_${(900000 + n * 137).toString(36).toUpperCase()}X${n}`,
    createdAt: ago(6 + n * 7),
    proofLabel: offline ? (method === 'upi' ? 'UPI payment screenshot' : 'Bank transfer receipt') : undefined,
    invoiceNo: status === 'verified' || status === 'verified_auto' ? `INV-${p.journal}-2026-${String(n).padStart(4, '0')}` : undefined,
  }
}

export function buildPayments(papers: Paper[]): Payment[] {
  const out: Payment[] = []
  let n = 0
  for (const p of papers) {
    if (p.paymentStatus === 'none') continue
    n++
    const india = p.authorCountry === 'India'
    const currency = india ? 'INR' : 'USD'
    const base = india ? 2500 : 49
    const g = computeGst(base, currency, india ? STATES[n % STATES.length] : undefined)
    const offline = india && n % 3 === 0
    const method: Payment['method'] = offline ? (n % 2 ? 'upi' : 'bank_transfer') : india ? (n % 2 ? 'razorpay' : 'card') : 'card'
    let status: Payment['status']
    if (p.paymentStatus === 'pending') status = 'awaiting_proof'
    else if (p.paymentStatus === 'verification') status = 'pending_verification'
    else status = offline ? 'verified' : 'verified_auto'
    // Guarantee a demo-able offline UPI proof for every paper waiting on verification in India.
    const forced: Payment['method'] = status === 'pending_verification' && india ? 'upi' : status === 'pending_verification' ? 'bank_transfer' : method
    out.push(mk(p, n, status === 'pending_verification' ? forced : method, currency, g, status))
  }
  return out
}

const CFP = 'We invite original research articles, reviews and case studies. All submissions are peer reviewed and receive a DOI on publication.'

export function buildIssues(papers: Paper[], codes: JournalCode[]): Issue[] {
  const out: Issue[] = []
  for (const j of codes) {
    const published = papers.filter((p) => p.journal === j && ['published', 'indexed', 'corrected', 'retracted'].includes(p.status))
    const defs: [number, number, number, Issue['status']][] = [
      [1, 1, 2024, 'published'], [1, 2, 2024, 'published'], [2, 1, 2025, 'published'], [2, 2, 2025, 'published'],
      [3, 1, 2026, 'published'], [3, 2, 2026, 'published'], [3, 3, 2026, 'published'], [3, 4, 2026, 'in_production'],
      [4, 1, 2027, 'open'],
    ]
    for (const [volume, number, year, status] of defs) {
      const month = [0, 3, 6, 9][(number - 1) % 4]
      const articles = status === 'published' && year === 2026 ? published.filter((_, k) => k % 3 === number - 1) : []
      out.push({
        id: `${j}-V${volume}I${number}`,
        journal: j,
        volume,
        number,
        label: `Volume ${volume}, Issue ${number}`,
        month: iso(year, month, 1),
        submissionDeadline: iso(year, month - 1, 20),
        publicationDate: iso(year, month, 28),
        status,
        callForPapers: CFP,
        articleIds: articles.map((a) => a.id),
        pages: Object.fromEntries(articles.map((a, i) => [a.id, `${i * 9 + 1}–${i * 9 + 9}`])),
        actualOnlineDate: status === 'published' ? iso(year, month, 28) : undefined,
      })
    }
  }
  return out
}
