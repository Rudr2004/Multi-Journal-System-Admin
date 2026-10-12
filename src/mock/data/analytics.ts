import { addDays, format, startOfDay } from 'date-fns'
import type { JournalCode, Paper } from '@/shared/types'
import { computeGst } from '@/shared/gst'
import { JOURNAL_CODES } from './core'
import { NOW } from './papers'
import { APC_DEFAULTS } from './settings'

/* Deterministic mock analytics: 365 days of per-journal figures, generated once from a seeded PRNG. */

export const DATA_DAYS = 365

export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DayPoint {
  date: string // yyyy-MM-dd
  submissions: number
  accepted: number
  rejected: number
  decisions: number
  fdSum: number // sum of days-to-first-decision across decisions
  published: number
  pubSum: number // sum of days-to-publication across published
  views: number
  downloads: number
  payIntra: number // INR payments from authors in the publisher's state (CGST+SGST)
  payInter: number // INR payments from other states (IGST)
  payUsd: number
  referralsSent: number
  referralsConverted: number
  awards: number
}

interface Profile { sub: number; acc: number; fd: number; pub: number; views: number; dl: number; trend: number; usd: number }
const PROFILE: Record<JournalCode, Profile> = {
  IJMAT: { sub: 2.6, acc: 0.46, fd: 19, pub: 41, views: 520, dl: 0.27, trend: 0.32, usd: 0.14 },
  JIMRT: { sub: 1.7, acc: 0.52, fd: 22, pub: 46, views: 340, dl: 0.24, trend: 0.18, usd: 0.1 },
  IJCSD: { sub: 3.1, acc: 0.38, fd: 17, pub: 38, views: 690, dl: 0.31, trend: 0.45, usd: 0.2 },
  IJECM: { sub: 1.9, acc: 0.44, fd: 24, pub: 49, views: 410, dl: 0.22, trend: 0.12, usd: 0.17 },
  IJFRD: { sub: 1.3, acc: 0.55, fd: 21, pub: 44, views: 270, dl: 0.29, trend: 0.25, usd: 0.09 },
}

let cache: Record<JournalCode, DayPoint[]> | null = null

export function startDate(): Date {
  return addDays(startOfDay(NOW), -(DATA_DAYS - 1))
}
export const endDate = () => startOfDay(NOW)

export function dailySeries(): Record<JournalCode, DayPoint[]> {
  if (cache) return cache
  const start = startDate()
  const out = {} as Record<JournalCode, DayPoint[]>
  JOURNAL_CODES.forEach((code, ji) => {
    const p = PROFILE[code]
    const r = rng(7919 * (ji + 3))
    const days: DayPoint[] = []
    for (let i = 0; i < DATA_DAYS; i++) {
      const d = addDays(start, i)
      const f = i / (DATA_DAYS - 1)
      const growth = 1 + p.trend * f
      const season = 1 + 0.14 * Math.sin((i / DATA_DAYS) * Math.PI * 4 + ji)
      const weekend = d.getDay() === 0 || d.getDay() === 6
      const wk = weekend ? 0.42 : 1.12
      const submissions = Math.round(p.sub * growth * season * wk * (0.55 + 0.9 * r()))
      const decisions = Math.round(submissions * 0.85 * (0.5 + r()))
      const accepted = Math.min(decisions, Math.round(decisions * p.acc * (0.75 + 0.5 * r())))
      const rejected = decisions - accepted
      const fdAvg = p.fd * (1.14 - 0.22 * f) + (r() - 0.5) * 5
      const published = accepted > 0 ? Math.round(accepted * 0.9 * (0.5 + r())) : 0
      const pubAvg = p.pub * (1.1 - 0.16 * f) + (r() - 0.5) * 8
      const views = Math.round(p.views * growth * season * (weekend ? 0.7 : 1.08) * (0.7 + 0.6 * r()))
      const downloads = Math.round(views * p.dl * (0.8 + 0.4 * r()))
      const payments = Math.round(accepted * 0.85 * (0.6 + 0.8 * r()))
      const usd = Math.round(payments * p.usd)
      const inr = payments - usd
      const payIntra = Math.round(inr * 0.22)
      const sent = r() < 0.4 ? 1 + Math.floor(r() * 3) : 0
      days.push({
        date: format(d, 'yyyy-MM-dd'),
        submissions,
        accepted,
        rejected,
        decisions,
        fdSum: Math.round(decisions * Math.max(6, fdAvg) * 10) / 10,
        published,
        pubSum: Math.round(published * Math.max(18, pubAvg) * 10) / 10,
        views,
        downloads,
        payIntra,
        payInter: inr - payIntra,
        payUsd: usd,
        referralsSent: sent,
        referralsConverted: sent && r() < 0.45 ? 1 : 0,
        awards: d.getDate() === 28 && r() < 0.6 ? 1 : 0,
      })
    }
    out[code] = days
  })
  cache = out
  return out
}

/* ---------- Aggregation ---------- */

export interface Metrics {
  submissions: number
  accepted: number
  rejected: number
  decisions: number
  fdSum: number
  published: number
  pubSum: number
  views: number
  downloads: number
  inrBase: number
  cgst: number
  sgst: number
  igst: number
  usdBase: number
  referralsSent: number
  referralsConverted: number
  awards: number
}

export const emptyMetrics = (): Metrics => ({
  submissions: 0, accepted: 0, rejected: 0, decisions: 0, fdSum: 0, published: 0, pubSum: 0, views: 0, downloads: 0,
  inrBase: 0, cgst: 0, sgst: 0, igst: 0, usdBase: 0, referralsSent: 0, referralsConverted: 0, awards: 0,
})

export function addDay(m: Metrics, d: DayPoint, code: JournalCode) {
  const apc = APC_DEFAULTS[code]
  const intra = computeGst(apc.inr, 'INR', 'Gujarat')
  const inter = computeGst(apc.inr, 'INR', 'Maharashtra')
  m.submissions += d.submissions
  m.accepted += d.accepted
  m.rejected += d.rejected
  m.decisions += d.decisions
  m.fdSum += d.fdSum
  m.published += d.published
  m.pubSum += d.pubSum
  m.views += d.views
  m.downloads += d.downloads
  m.inrBase += (d.payIntra + d.payInter) * apc.inr
  m.cgst += d.payIntra * intra.cgst
  m.sgst += d.payIntra * intra.sgst
  m.igst += d.payInter * inter.igst
  m.usdBase += d.payUsd * apc.usd
  m.referralsSent += d.referralsSent
  m.referralsConverted += d.referralsConverted
  m.awards += d.awards
}

export function mergeMetrics(a: Metrics, b: Metrics): Metrics {
  const out = emptyMetrics()
  for (const k of Object.keys(out) as (keyof Metrics)[]) out[k] = a[k] + b[k]
  return out
}

export function scaleMetrics(m: Metrics, s: number): Metrics {
  if (s === 1) return m
  const out = emptyMetrics()
  for (const k of Object.keys(out) as (keyof Metrics)[]) out[k] = k === 'fdSum' || k === 'pubSum' ? m[k] * s : Math.round(m[k] * s)
  return out
}

/* Derived figures */
export const acceptanceRate = (m: Metrics) => (m.accepted + m.rejected ? (m.accepted / (m.accepted + m.rejected)) * 100 : 0)
export const rejectionRate = (m: Metrics) => (m.accepted + m.rejected ? (m.rejected / (m.accepted + m.rejected)) * 100 : 0)
export const avgFirstDecision = (m: Metrics) => (m.decisions ? m.fdSum / m.decisions : 0)
export const avgPublication = (m: Metrics) => (m.published ? m.pubSum / m.published : 0)
export const inrTotal = (m: Metrics) => m.inrBase + m.cgst + m.sgst + m.igst
export const gstTotal = (m: Metrics) => m.cgst + m.sgst + m.igst
export const conversionRate = (m: Metrics) => (m.referralsSent ? (m.referralsConverted / m.referralsSent) * 100 : 0)

/* ---------- Articles & countries ---------- */

export const ARTICLE_TYPES = ['Research article', 'Review article', 'Case study', 'Short communication']
/** Approximate share of each article type within a journal's traffic and submissions. */
export const ARTICLE_TYPE_SHARE: Record<string, number> = {
  'Research article': 0.58, 'Review article': 0.17, 'Case study': 0.15, 'Short communication': 0.1,
}

export const COUNTRY_WEIGHTS: Record<JournalCode, [string, number][]> = {
  IJMAT: [['India', 48], ['United States', 9], ['United Kingdom', 6], ['Nigeria', 5], ['Saudi Arabia', 4], ['Vietnam', 4], ['Bangladesh', 4], ['Russia', 3], ['Germany', 3], ['Other', 14]],
  JIMRT: [['India', 56], ['United States', 7], ['United Kingdom', 6], ['Saudi Arabia', 5], ['Bangladesh', 4], ['Nigeria', 4], ['Vietnam', 2], ['Russia', 2], ['Germany', 2], ['Other', 12]],
  IJCSD: [['India', 42], ['United States', 12], ['United Kingdom', 7], ['Vietnam', 6], ['Germany', 5], ['Russia', 4], ['Nigeria', 4], ['Bangladesh', 3], ['Saudi Arabia', 3], ['Other', 14]],
  IJECM: [['India', 44], ['United States', 8], ['Saudi Arabia', 7], ['United Kingdom', 6], ['Vietnam', 5], ['Russia', 5], ['Germany', 4], ['Nigeria', 4], ['Bangladesh', 3], ['Other', 14]],
  IJFRD: [['India', 51], ['United States', 8], ['United Kingdom', 8], ['Nigeria', 6], ['Bangladesh', 4], ['Saudi Arabia', 3], ['Vietnam', 3], ['Germany', 3], ['Russia', 2], ['Other', 12]],
}

export const isPublished = (p: Paper) => ['published', 'indexed', 'corrected'].includes(p.status)

/** Relative weight of an article within its journal (popularity), stable per Paper ID. */
export function articleWeight(p: Paper): number {
  const h = hashStr(p.id)
  return 0.35 + ((h % 1000) / 1000) ** 2 * 3
}

export interface CountryShare { country: string; views: number; share: number }

/** Split an article's views across countries: author's country is boosted, rest follows the journal profile with jitter. */
export function articleCountries(p: Paper, views: number): CountryShare[] {
  const base = COUNTRY_WEIGHTS[p.journal].filter(([c]) => c !== 'Other')
  const r = rng(hashStr(p.id) + 17)
  const weights = base.map(([c, w]) => [c, w * (0.5 + r()) * (c === p.authorCountry ? 2.2 : 1)] as [string, number])
  if (!weights.some(([c]) => c === p.authorCountry)) weights.push([p.authorCountry, 6 * (0.5 + r())])
  const total = weights.reduce((s, [, w]) => s + w, 0)
  return weights
    .map(([country, w]) => ({ country, views: Math.round((views * w) / total), share: (w / total) * 100 }))
    .sort((a, b) => b.views - a.views)
}
