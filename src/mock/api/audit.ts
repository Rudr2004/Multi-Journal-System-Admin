import type { AuditEntry, JournalCode } from '@/shared/types'
import { AUDIT_CATEGORIES, auditCategory, buildAuditHistory } from '../data/settings'
import { useDataStore } from '../store'
import { delay } from './latency'

let history: AuditEntry[] | null = null
const seeded = () => (history ??= buildAuditHistory())

/** Seeded history merged with live entries written by recordAudit(), newest first. */
export function allAuditEntries(): AuditEntry[] {
  const live = useDataStore.getState().audit
  return [...live, ...seeded()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

export interface AuditFilters {
  journal?: JournalCode | 'ALL' | ''
  actor?: string
  category?: string
  from?: string // yyyy-MM-ddTHH:mm (local time); a plain yyyy-MM-dd means the start of that day
  to?: string // yyyy-MM-ddTHH:mm; a plain yyyy-MM-dd means the end of that day
  /** restrict to the journals in scope (plus platform-wide entries) */
  scope?: JournalCode[]
}

export interface AuditResult {
  entries: AuditEntry[]
  actors: string[]
}

/** Local-time boundary: 'yyyy-MM-ddTHH:mm' is used as is (to = end of that minute); a bare date covers the whole day. */
const bound = (v: string, end: boolean) => {
  if (v.length <= 10) return new Date(`${v}T${end ? '23:59:59.999' : '00:00:00'}`).getTime()
  return new Date(v).getTime() + (end ? 59_999 : 0)
}

export async function listAudit(f: AuditFilters = {}): Promise<AuditResult> {
  await delay(null, 250, 550)
  const all = allAuditEntries()
  const entries = all.filter((e) => {
    if (f.scope && e.journal !== 'ALL' && !f.scope.includes(e.journal)) return false
    if (f.journal && e.journal !== f.journal) return false
    if (f.actor && e.actor !== f.actor) return false
    if (f.category && auditCategory(e.action) !== f.category) return false
    const t = new Date(e.at).getTime()
    if (f.from && t < bound(f.from, false)) return false
    if (f.to && t > bound(f.to, true)) return false
    return true
  })
  return { entries, actors: [...new Set(all.map((e) => e.actor))].sort() }
}

/** Entries performed by, or targeting, a person (used for the per-user activity list). */
export function activityForUser(name: string): AuditEntry[] {
  return allAuditEntries().filter((e) => e.actor === name || e.target === name)
}

export const categoryLabel = (action: string) => AUDIT_CATEGORIES.find((c) => c.id === auditCategory(action))?.label ?? 'Other'
