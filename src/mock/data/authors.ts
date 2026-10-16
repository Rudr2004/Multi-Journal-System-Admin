import type { Author, DoiDeposit, Paper } from '@/shared/types'
import { doiFor } from '@/shared/paperId'
import { NOW } from './papers'
import { portraitDataUrl } from '@/lib/portrait'

const CO: Omit<Author, 'corresponding'>[] = [
  { name: 'Prof. Hemant Kulkarni', email: 'h.kulkarni@coep.example', affiliation: 'College of Engineering Pune', country: 'India', orcid: '0000-0002-1825-0097' },
  { name: 'Dr. Ritu Agarwal', email: 'ritu.agarwal@iimk.example', affiliation: 'IIM Kozhikode', country: 'India', orcid: '0000-0001-5109-3700' },
  { name: 'Faisal Ahmed', email: 'faisal.ahmed@buet.example', affiliation: 'BUET Dhaka', country: 'Bangladesh' },
  { name: 'Dr. Olivia Grant', email: 'o.grant@ucl.example', affiliation: 'University College London', country: 'United Kingdom', orcid: '0000-0003-1415-9269' },
  { name: 'Shreya Banerjee', email: 'shreya.b@jadavpur.example', affiliation: 'Jadavpur University', country: 'India' },
  { name: 'Tomás Herrera', email: 't.herrera@uc.example', affiliation: 'Universidad de Chile', country: 'Chile' },
]

const DIAL: Record<string, string> = { India: '+91', Nigeria: '+234', Vietnam: '+84', 'United Kingdom': '+44', 'Saudi Arabia': '+966', Bangladesh: '+880', Russia: '+7', Chile: '+56' }
/** A plausible, deterministic contact number for the author's country. */
const phoneFor = (country: string, h: number) => {
  const dial = DIAL[country] ?? '+1'
  const n = String(7000000000 + (h % 2999999999))
  return dial === '+91' ? `${dial} ${n.slice(0, 5)} ${n.slice(5, 10)}` : `${dial} ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 10)}`
}
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

/** Deterministic author list (1–3 authors) derived from the paper; the submitting author is first. */
export function generatedAuthors(p: Paper): Author[] {
  const h = hash(p.id)
  const lead: Author = {
    name: p.author, email: p.authorEmail, country: p.authorCountry, corresponding: true, phone: phoneFor(p.authorCountry, h), photo: portraitDataUrl(p.author),
    affiliation: p.authorEmail.split('@')[1].split('.')[0].toUpperCase() + ' University',
    orcid: h % 2 ? `0000-0002-${1000 + (h % 8999)}-${1000 + ((h >> 3) % 8999)}` : undefined,
  }
  const n = 1 + (h % 3)
  return [lead, ...Array.from({ length: n - 1 }, (_, i) => {
    const c = CO[(h + i * 2) % CO.length]
    return { ...c, phone: phoneFor(c.country, h + i * 977), photo: portraitDataUrl(c.name) }
  })]
}

const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

export function buildDeposits(papers: Paper[]): DoiDeposit[] {
  return papers
    .filter((p) => ['published', 'indexed', 'corrected', 'retracted'].includes(p.status))
    .map((p, i) => {
      const status: DoiDeposit['status'] = i % 9 === 4 ? 'failed' : i % 9 === 6 ? 'pending' : p.status === 'corrected' ? 're_deposited' : 'success'
      return {
        id: `dep-${i + 1}`, paperId: p.id, journal: p.journal, doi: doiFor(p.id), status,
        version: p.status === 'corrected' ? 2 : 1, at: ago(12 + i * 20),
        error: status === 'failed' ? 'Crossref responded 503: batch queue unavailable' : undefined,
      }
    })
}
