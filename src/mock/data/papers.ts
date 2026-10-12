import type { JournalCode, Paper, PaperStatus, PaymentStatus } from '@/shared/types'
import { formatPaperId } from '@/shared/paperId'
import { JOURNAL_CODES } from './core'

export const NOW = new Date()
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()
const ahead = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

/** Next 08:45 dispatch (today if still ahead, otherwise tomorrow). */
export function nextDispatch(from: Date = NOW): Date {
  const d = new Date(from)
  d.setHours(8, 45, 0, 0)
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 1)
  return d
}

const STATUS_SEQ: PaperStatus[] = [
  'submitted', 'screening', 'under_review', 'decision_pending', 'changes_requested', 'accepted', 'payment_pending',
  'paid', 'in_production', 'returned_to_production', 'ready_for_approval', 'published', 'indexed', 'rejected',
  'withdrawn', 'retracted', 'corrected',
]

const TOPICS: Record<JournalCode, string[]> = {
  IJMAT: ['smart-material adoption in small manufacturing units', 'digital twins for process monitoring', 'additive manufacturing supply chains', 'blended learning platforms in engineering colleges', 'sensor networks for precision agriculture', 'low-cost water purification technology'],
  JIMRT: ['employee retention in hybrid workplaces', 'startup funding networks in tier-2 cities', 'leadership styles and team innovation', 'consumer trust in quick-commerce apps', 'sustainability reporting by mid-size firms', 'technology transfer in public universities'],
  IJCSD: ['transformer models for low-resource languages', 'federated learning on edge devices', 'static analysis of open-source Python packages', 'graph neural networks for fraud detection', 'serverless architectures for e-governance', 'API rate limiting under bursty traffic'],
  IJECM: ['fibre-reinforced concrete under cyclic load', 'thermal management of lithium-ion packs', 'FPGA-based signal filtering', 'composite lay-up optimisation', 'rooftop solar inverter reliability', 'vibration damping in machine tool beds'],
  IJFRD: ['UPI adoption and household savings behaviour', 'volatility spillovers in emerging equity markets', 'credit scoring for thin-file borrowers', 'ESG disclosure and cost of capital', 'microfinance repayment under climate shocks', 'bank mergers and deposit pricing'],
}
const FRAMES = [
  (t: string) => `A comparative study of ${t}`,
  (t: string) => `${t[0].toUpperCase()}${t.slice(1)}: an empirical analysis in emerging economies`,
  (t: string) => `Evaluating ${t} using mixed-method evidence`,
]
const AUTHORS: [string, string, string][] = [
  ['Aarav Sharma', 'aarav.sharma@iitd.example', 'India'], ['Meera Nair', 'meera.nair@nitc.example', 'India'],
  ['Vikram Singh', 'vikram.singh@bits.example', 'India'], ['Sana Qureshi', 'sana.qureshi@jmi.example', 'India'],
  ['Rahul Verma', 'rahul.verma@iiml.example', 'India'], ['Lakshmi Pillai', 'lakshmi.pillai@cusat.example', 'India'],
  ['Arjun Reddy', 'arjun.reddy@osmania.example', 'India'], ['Divya Joshi', 'divya.joshi@du.example', 'India'],
  ['James Okafor', 'j.okafor@unilag.example', 'Nigeria'], ['Nguyen Thi Lan', 'lan.nguyen@hust.example', 'Vietnam'],
  ['Amelia Brooks', 'a.brooks@leeds.example', 'United Kingdom'], ['Tariq Hassan', 'tariq.hassan@kau.example', 'Saudi Arabia'],
  ['Kavya Rao', 'kavya.rao@manipal.example', 'India'], ['Imran Khan', 'imran.khan@aiub.example', 'Bangladesh'],
  ['Pooja Bhatt', 'pooja.bhatt@gtu.example', 'India'], ['Siddharth Jain', 'sid.jain@vit.example', 'India'],
  ['Elena Petrova', 'e.petrova@msu.example', 'Russia'],
]
const TYPES = ['Research article', 'Review article', 'Case study', 'Short communication']

function paymentFor(s: PaperStatus, i: number): PaymentStatus {
  switch (s) {
    case 'accepted': case 'payment_pending': return i % 2 ? 'verification' : 'pending'
    case 'paid': case 'in_production': case 'returned_to_production': case 'ready_for_approval':
    case 'published': case 'indexed': case 'retracted': case 'corrected': return 'verified'
    default: return 'none'
  }
}

export function buildPapers(): Paper[] {
  const year = NOW.getFullYear()
  const counters: Record<string, number> = {}
  const out: Paper[] = []
  for (let n = 0; n < 85; n++) {
    const journal = JOURNAL_CODES[n % 5]
    const status = STATUS_SEQ[n % 17]
    const k = (counters[journal] = (counters[journal] ?? -1) + 1)
    const topic = TOPICS[journal][k % 6]
    const [author, email, country] = AUTHORS[(n * 7 + 3) % AUTHORS.length]
    const submittedHrs = 24 * (3 + ((n * 11) % 80))
    const p: Paper = {
      id: formatPaperId(journal, year, 100 + k * 13),
      journal,
      title: FRAMES[k % 3](topic),
      author, authorEmail: email, authorCountry: country,
      articleType: TYPES[n % 4],
      status,
      submittedAt: ago(submittedHrs),
      updatedAt: ago(Math.min(submittedHrs - 1, 1 + ((n * 5) % 70))),
      paymentStatus: paymentFor(status, n),
    }
    if (status === 'accepted') p.dispatchAt = nextDispatch().toISOString()
    if (status === 'under_review') {
      if (journal === 'IJMAT') p.reviewerId = 'u-reviewer'
      if (journal === 'IJECM') p.reviewerId = 'u-panel'
      p.reviewDue = ahead(24 * (2 + (n % 6)) - 30)
    }
    if (journal === 'IJMAT' && status === 'decision_pending') p.reviewerId = 'u-reviewer'
    if (journal === 'IJECM' && status === 'screening') p.reviewerId = 'u-panel'
    if (journal === 'JIMRT' && ['paid', 'in_production', 'returned_to_production', 'ready_for_approval'].includes(status)) {
      p.assigneeId = n % 2 ? 'u-ae' : 'u-multi'
      p.productionDue = ahead(24 * (n % 5) - 20)
    }
    out.push(p)
  }
  return out
}
