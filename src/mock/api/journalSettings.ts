import type { JournalCode } from '@/shared/types'
import { journalByCode } from '../data/core'
import { INDEXING_SERVICES, type JournalSettings } from '../data/settings'
import { recordAudit } from '../actions'
import { FLAG_META, type FeatureFlags } from '@/permissions/flags'
import { useAdminStore } from '../stores/admin'
import { delay } from './latency'

export async function getJournalSettings(): Promise<Record<JournalCode, JournalSettings>> {
  await delay(null, 250, 550)
  return structuredClone(useAdminStore.getState().journalSettings)
}

const money = (n: number) => n.toLocaleString('en-IN')
const slots = (s: JournalSettings) => s.dispatchSlots.map((x) => `${x.label} ${x.time}`).join(', ') || 'None'

/** Field-level diff as "Label: value" lines, grouped into one audit entry per save. */
export function diffSettings(a: JournalSettings, b: JournalSettings): { field: string; from: string; to: string; group: string }[] {
  const out: { field: string; from: string; to: string; group: string }[] = []
  const add = (group: string, field: string, from: string, to: string) => from !== to && out.push({ group, field, from, to })
  add('Name', 'Journal name', a.name, b.name)
  add('Domain', 'Domain', a.domain, b.domain)
  add('ISSN', 'ISSN', a.issn, b.issn)
  add('Paper ID sequence', 'Next sequence', String(a.nextSequence), String(b.nextSequence))
  add('APC', 'APC (INR)', money(a.apcInr), money(b.apcInr))
  add('APC', 'APC (USD)', money(a.apcUsd), money(b.apcUsd))
  add('GSTIN', 'GSTIN', a.gstin, b.gstin)
  add('GST details', 'GST state', a.gstState, b.gstState)
  add('WhatsApp number', 'WhatsApp', a.whatsapp, b.whatsapp)
  add('Time slots', 'Dispatch slots', slots(a), slots(b))
  add('Time slots', 'Support hours', `${a.supportStart}–${a.supportEnd}`, `${b.supportStart}–${b.supportEnd}`)
  const lv = (l: { label: string; value: string }[]) => l.map((x) => `${x.label}: ${x.value}`).join('; ') || 'None'
  const list = (l: string[]) => l.join(', ') || 'None'
  const sa = a.site
  const sb = b.site
  add('Information table', 'Information table', lv(sa.infoTable), lv(sb.infoTable))
  add('Publisher', 'Publisher', sa.publisher, sb.publisher)
  add('Contact details', 'Emails', lv(sa.emails), lv(sb.emails))
  add('Contact details', 'Phones', lv(sa.phones), lv(sb.phones))
  add('Address and map', 'Address', sa.address, sb.address)
  add('Address and map', 'Map link', sa.mapLink, sb.mapLink)
  add('Social links', 'Social links', Object.entries(sa.social).map(([k, v]) => `${k}: ${v || '-'}`).join('; '), Object.entries(sb.social).map(([k, v]) => `${k}: ${v || '-'}`).join('; '))
  add('Subjects and branches', 'Subjects', sa.subjects.map((x) => `${x.name} (${list(x.branches)})`).join('; '), sb.subjects.map((x) => `${x.name} (${list(x.branches)})`).join('; '))
  add('Article types', 'Article types', list(sa.articleTypes), list(sb.articleTypes))
  add('Trust badges', 'Trust badges', list(sa.trustBadges), list(sb.trustBadges))
  add('Trust ledger', 'Trust ledger', sa.trustLedger.map((x) => `${x.date} ${x.title}`).join('; '), sb.trustLedger.map((x) => `${x.date} ${x.title}`).join('; '))
  add('Call for papers', 'Call for papers', `${sa.callForPapers.enabled ? 'On' : 'Off'}, ${sa.callForPapers.deadline}: ${sa.callForPapers.text}`, `${sb.callForPapers.enabled ? 'On' : 'Off'}, ${sb.callForPapers.deadline}: ${sb.callForPapers.text}`)
  for (const s of INDEXING_SERVICES) add('Indexing badges', `${s.label} badge`, a.indexing[s.id] ? 'On' : 'Off', b.indexing[s.id] ? 'On' : 'Off')
  return out
}

export async function saveJournalSettings(code: JournalCode, next: JournalSettings): Promise<{ changes: number }> {
  await delay(null, 500, 900)
  const admin = useAdminStore.getState()
  const prev = admin.journalSettings[code]
  const diff = diffSettings(prev, next)
  if (diff.length === 0) return { changes: 0 }
  admin.patch({ journalSettings: { ...admin.journalSettings, [code]: structuredClone(next) } })
  // keep the shared journal list (switcher, headers) in sync with name / domain / ISSN
  Object.assign(journalByCode(code), { name: next.name, domain: next.domain, issn: next.issn })
  const groups = [...new Set(diff.map((d) => d.group))]
  recordAudit({
    journal: code,
    action: `Journal settings updated: ${groups.join(', ')}`,
    target: `${code} settings`,
    oldValue: diff.map((d) => `${d.field}: ${d.from}`).join('\n'),
    newValue: diff.map((d) => `${d.field}: ${d.to}`).join('\n'),
  })
  return { changes: diff.length }
}

/** Audit a feature switch change made from Journal Settings (the switch itself lives in the session store). */
export function auditFlagChange(flag: keyof FeatureFlags, on: boolean) {
  recordAudit({ journal: 'ALL', action: 'Feature setting changed', target: FLAG_META[flag].label, oldValue: on ? 'Off' : 'On', newValue: on ? 'On' : 'Off' })
}
