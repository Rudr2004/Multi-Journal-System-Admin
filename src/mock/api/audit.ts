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
  from?: string // yyyy-MM-dd
  to?: string
  /** restrict to the journals in scope (plus platform-wide entries) */
  scope?: JournalCode[]
}

export interface AuditResult {
  entries: AuditEntry[]
  actors: string[]
}

export async function listAudit(f: AuditFilters = {}): Promise<AuditResult> {
  await delay(null, 250, 550)
  const all = allAuditEntries()
  const entries = all.filter((e) => {
    if (f.scope && e.journal !== 'ALL' && !f.scope.includes(e.journal)) return false
    if (f.journal && e.journal !== f.journal) return false
    if (f.actor && e.actor !== f.actor) return false
    if (f.category && auditCategory(e.action) !== f.category) return false
    // compare in local time so the date pickers behave as users expect
    const local = new Date(e.at)
    const localDay = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
    if (f.from && localDay < f.from) return false
    if (f.to && localDay > f.to) return false
    return true
  })
  return { entries, actors: [...new Set(all.map((e) => e.actor))].sort() }
}

/** Entries performed by, or targeting, a person (used for the per-user activity list). */
export function activityForUser(name: string): AuditEntry[] {
  return allAuditEntries().filter((e) => e.actor === name || e.target === name)
}

export const categoryLabel = (action: string) => AUDIT_CATEGORIES.find((c) => c.id === auditCategory(action))?.label ?? 'Other'
