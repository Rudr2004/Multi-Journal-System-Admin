export const GST_RATE = 0.18
export const PUBLISHER_STATE = 'Gujarat'

export type Currency = 'INR' | 'USD'

export interface GstBreakdown {
  currency: Currency
  base: number
  cgst: number
  sgst: number
  igst: number
  total: number
  note: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * 18% GST for Indian authors (CGST 9% + SGST 9% inside the publisher's state, otherwise IGST 18%).
 * No GST for USD payments from foreign authors.
 */
export function computeGst(base: number, currency: Currency, authorState?: string): GstBreakdown {
  if (currency === 'USD') {
    return { currency, base, cgst: 0, sgst: 0, igst: 0, total: base, note: 'No GST — export of services (USD)' }
  }
  const intra = authorState?.toLowerCase() === PUBLISHER_STATE.toLowerCase()
  if (intra) {
    const half = r2(base * (GST_RATE / 2))
    return { currency, base, cgst: half, sgst: half, igst: 0, total: r2(base + half * 2), note: 'CGST 9% + SGST 9%' }
  }
  const igst = r2(base * GST_RATE)
  return { currency, base, cgst: 0, sgst: 0, igst, total: r2(base + igst), note: 'IGST 18%' }
}
