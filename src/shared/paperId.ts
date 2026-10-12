import type { JournalCode } from './types'

/** Paper ID: {CODE}{YEAR}{6-digit sequence}, e.g. IJMAT2026000123 */
export function formatPaperId(code: JournalCode, year: number, seq: number): string {
  return `${code}${year}${String(seq).padStart(6, '0')}`
}

const PAPER_ID_RE = /^(IJMAT|JIMRT|IJCSD|IJECM|IJFRD)(\d{4})(\d{6})$/

export function parsePaperId(id: string): { code: JournalCode; year: number; seq: number } | null {
  const m = PAPER_ID_RE.exec(id.trim().toUpperCase())
  return m ? { code: m[1] as JournalCode, year: Number(m[2]), seq: Number(m[3]) } : null
}

export const DOI_PREFIX = '10.55041'

/** DOI = 10.55041/{Paper ID} */
export function doiFor(paperId: string): string {
  return `${DOI_PREFIX}/${paperId}`
}

/** Backdated-ID format, e.g. IJMAT.V1I1.100 */
export function backdatedId(code: JournalCode, volume: number, issue: number, seq: number): string {
  return `${code}.V${volume}I${issue}.${seq}`
}
