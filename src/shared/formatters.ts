import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import type { Currency } from './gst'

const d = (v: string | Date) => (typeof v === 'string' ? parseISO(v) : v)

/** 15 Sep 2026 */
export const formatDate = (v: string | Date) => format(d(v), 'd MMM yyyy')
/** 08:45 */
export const formatTime = (v: string | Date) => format(d(v), 'HH:mm')
export const formatDateTime = (v: string | Date) => `${formatDate(v)}, ${formatTime(v)} IST`

const UNITS: [RegExp, string][] = [
  [/ seconds?/, ' s'],
  [/ minutes?/, ' min'],
  [/ hours?/, ' h'],
  [/ days?/, ' d'],
  [/ months?/, ' mo'],
  [/ years?/, ' y'],
]

/** "2 h ago" style; pair with formatDateTime in a title attribute for the exact time. */
export function formatRelative(v: string | Date, now: Date = new Date()): string {
  const date = d(v)
  const diffMs = now.getTime() - date.getTime()
  if (Math.abs(diffMs) < 60_000) return 'just now'
  let s = formatDistanceToNowStrict(date)
  for (const [re, rep] of UNITS) s = s.replace(re, rep)
  return diffMs >= 0 ? `${s} ago` : `in ${s}`
}

/** ₹2,950.00 and $49.00 */
export function formatMoney(amount: number, currency: Currency): string {
  const symbol = currency === 'INR' ? '₹' : '$'
  const locale = currency === 'INR' ? 'en-IN' : 'en-US'
  return `${symbol}${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const formatNumber = (n: number) => n.toLocaleString('en-IN')
export const formatPercent = (n: number, digits = 1) => `${n.toFixed(digits)}%`
