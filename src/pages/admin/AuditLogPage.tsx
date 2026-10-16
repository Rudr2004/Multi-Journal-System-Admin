import { useMemo, useState } from 'react'
import { ArrowRight, Download, ScrollText } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { useAsync } from '@/lib/useAsync'
import { useScopeJournals } from '@/lib/scope'
import { useDataStore, useSession } from '@/mock/store'
import { Badge, JournalBadge } from '@/components/Badges'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Drawer } from '@/components/Dialog'
import { DescriptionList } from '@/components/Form'
import { ErrorState } from '@/components/States'
import { toast } from '@/components/Toasts'
import { formatDateTime } from '@/shared/formatters'
import type { AuditEntry } from '@/shared/types'
import { JOURNAL_CODES } from '@/mock/data/core'
import { AUDIT_CATEGORIES, auditCategory } from '@/mock/data/settings'
import { categoryLabel, listAudit } from '@/mock/api/audit'
import { recordAudit } from '@/mock/actions'
import { downloadCsv } from '@/pages/insights/csv'

const CATEGORY_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent'> = {
  decision: 'accent', status: 'info', payment: 'success', publishing: 'info', users: 'warning', settings: 'warning', content: 'neutral', export: 'neutral', other: 'neutral',
}

function parsePairs(text?: string): Map<string, string> | null {
  if (!text) return new Map()
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    const i = line.indexOf(': ')
    if (i < 1) return null
    map.set(line.slice(0, i), line.slice(i + 2))
  }
  return map
}

/** Old → new, field by field when the values are "Label: value" lines, otherwise side by side. */
function Diff({ entry }: { entry: AuditEntry }) {
  const { oldValue, newValue } = entry
  if (!oldValue && !newValue) return <p className="text-sm text-muted">This action did not change a stored value.</p>
  const a = parsePairs(oldValue)
  const b = parsePairs(newValue)
  if (a && b && (a.size > 0 || b.size > 0)) {
    const keys = [...new Set([...a.keys(), ...b.keys()])]
    return (
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">Changed values</caption>
          <thead className="bg-subtle text-xs text-muted">
            <tr><th scope="col" className="px-3 py-2 text-left font-medium">Field</th><th scope="col" className="px-3 py-2 text-left font-medium">Before</th><th scope="col" className="w-6" aria-hidden /><th scope="col" className="px-3 py-2 text-left font-medium">After</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {keys.map((k) => (
              <tr key={k}>
                <th scope="row" className="px-3 py-2 text-left align-top font-medium">{k}</th>
                <td className="px-3 py-2 align-top">{a.has(k) ? <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-800 line-through decoration-red-300"><span className="sr-only">Removed: </span>{a.get(k)}</span> : <span className="text-muted">—</span>}</td>
                <td className="align-top pt-2.5 text-faint" aria-hidden><ArrowRight size={14} strokeWidth={1.5} /></td>
                <td className="px-3 py-2 align-top">{b.has(k) ? <span className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-800"><span className="sr-only">Added: </span>{b.get(k)}</span> : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><p className="label">Before</p><pre className="whitespace-pre-wrap rounded-md bg-red-50 p-3 text-sm text-red-800">{oldValue ?? '—'}</pre></div>
      <div><p className="label">After</p><pre className="whitespace-pre-wrap rounded-md bg-green-50 p-3 text-sm text-green-800">{newValue ?? '—'}</pre></div>
    </div>
  )
}

const oneLine = (e: AuditEntry) => {
  const first = (s?: string) => s?.split('\n')[0]
  const more = (s?: string) => ((s?.split('\n').length ?? 0) > 1 ? ' …' : '')
  if (!e.oldValue && !e.newValue) return '—'
  return `${first(e.oldValue) ?? '—'}${more(e.oldValue)}  →  ${first(e.newValue) ?? '—'}${more(e.newValue)}`
}

/** yyyy-MM-ddTHH:mm in local time, as <input type="datetime-local"> expects. */
const localInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
function quickRange(id: string): { from: string; to: string } | undefined {
  const now = new Date()
  const ago = (ms: number) => new Date(now.getTime() - ms)
  if (id === '1h') return { from: localInput(ago(3_600_000)), to: localInput(now) }
  if (id === '24h') return { from: localInput(ago(86_400_000)), to: localInput(now) }
  if (id === '7d') return { from: localInput(ago(7 * 86_400_000)), to: localInput(now) }
  if (id === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return { from: localInput(d), to: localInput(now) } }
  return undefined
}

export function AuditLogPage() {
  const scope = useScopeJournals()
  const allJournals = useSession((s) => s.journal) === 'ALL'
  const live = useDataStore((s) => s.audit.length)
  const [journal, setJournal] = useState('')
  const [actor, setActor] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<AuditEntry | null>(null)

  const { data, loading, error, reload } = useAsync(
    () => listAudit({ journal: journal as never, actor, category, from, to, scope: allJournals ? undefined : scope }),
    [journal, actor, category, from, to, allJournals, scope, live],
  )
  const entries = useMemo(() => data?.entries ?? [], [data])

  const exportCsv = () => {
    const range = from || to ? `_${(from || 'start').replace(/[:T]/g, '-')}_to_${(to || 'now').replace(/[:T]/g, '-')}` : ''
    downloadCsv(`audit-log_${new Date().toISOString().slice(0, 10)}${range}.csv`, [
      ['Time (IST)', 'Actor', 'Journal', 'Action', 'Category', 'Target', 'Old value', 'New value'],
      ...entries.map((e) => [formatDateTime(e.at), e.actor, e.journal, e.action, categoryLabel(e.action), e.target, e.oldValue?.replace(/\n/g, '; '), e.newValue?.replace(/\n/g, '; ')]),
    ])
    recordAudit({ journal: 'ALL', action: 'Exported audit log (CSV)', target: 'Audit log', newValue: `${entries.length} rows` })
    toast.success(`Exported ${entries.length} audit entries${from || to ? ' for the selected date and time range' : ''}.`)
  }

  const columns: Column<AuditEntry>[] = [
    { id: 'at', header: 'When', locked: true, sort: (e) => e.at, cell: (e) => <span className="whitespace-nowrap" title={e.at}>{formatDateTime(e.at)}</span> },
    { id: 'actor', header: 'Who', sort: (e) => e.actor, cell: (e) => <span className="whitespace-nowrap font-medium">{e.actor}</span> },
    { id: 'journal', header: 'Journal', sort: (e) => e.journal, cell: (e) => (e.journal === 'ALL' ? <Badge>All journals</Badge> : <JournalBadge code={e.journal} />) },
    {
      id: 'action', header: 'What', sort: (e) => e.action,
      cell: (e) => (
        <div className="min-w-0">
          <p className="line-clamp-2" title={e.action}>{e.action}</p>
          <p className="text-xs text-muted"><span className="whitespace-nowrap">{e.target}</span></p>
        </div>
      ),
    },
    { id: 'category', header: 'Type', sort: (e) => categoryLabel(e.action), cell: (e) => <Badge tone={CATEGORY_TONE[auditCategory(e.action)]}>{categoryLabel(e.action)}</Badge> },
    { id: 'change', header: 'Change', mobileHide: true, cell: (e) => <span className="line-clamp-2 max-w-[280px] text-sm text-muted" title={oneLine(e)}>{oneLine(e)}</span> },
  ]

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who did what, when and in which journal — including the old and new values."
        actions={<button className="btn-secondary" onClick={exportCsv} disabled={loading || entries.length === 0}><Download size={15} strokeWidth={1.5} aria-hidden /> Export CSV</button>}
      />
      {error ? (
        <div className="card"><ErrorState message="The audit log could not be loaded." onRetry={reload} /></div>
      ) : (
        <DataTable<AuditEntry>
          id="audit-log" data={entries} columns={columns} rowKey={(e) => e.id} loading={loading} pageSize={15}
          onRowClick={setOpen}
          search={{ placeholder: 'Search actions, targets, people', text: (e) => `${e.actor} ${e.action} ${e.target} ${e.oldValue ?? ''} ${e.newValue ?? ''}` }}
          filters={
            <>
              <SelectFilter label="Journal" value={journal} onChange={setJournal} options={[...JOURNAL_CODES.filter((c) => scope.includes(c)).map((c) => ({ value: c, label: c })), { value: 'ALL', label: 'All journals (platform)' }]} />
              <SelectFilter label="Actor" value={actor} onChange={setActor} options={(data?.actors ?? []).map((a) => ({ value: a, label: a }))} />
              <SelectFilter label="Type" value={category} onChange={setCategory} options={AUDIT_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} />
              <select aria-label="Quick range" className="input !w-auto" value="" onChange={(e) => { const r = quickRange(e.target.value); if (r) { setFrom(r.from); setTo(r.to) } }}>
                <option value="">Quick range…</option>
                <option value="1h">Last hour</option>
                <option value="24h">Last 24 hours</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted">From
                <input type="datetime-local" aria-label="From date and time" className="input !w-auto" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted">To
                <input type="datetime-local" aria-label="To date and time" className="input !w-auto" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
              {(journal || actor || category || from || to) && <button className="btn-ghost" onClick={() => { setJournal(''); setActor(''); setCategory(''); setFrom(''); setTo('') }}>Clear filters</button>}
            </>
          }
          empty={{ icon: ScrollText, title: 'No audit entries match', hint: 'Widen the date range or clear a filter.' }}
        />
      )}

      <Drawer open={!!open} onClose={() => setOpen(null)} title="Audit entry" width={560}>
        {open && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold">{open.action}</h3>
              <p className="mt-0.5 text-sm text-muted">{open.target}</p>
            </div>
            <DescriptionList items={[
              { label: 'When', value: formatDateTime(open.at) },
              { label: 'Who', value: open.actor },
              { label: 'Journal', value: open.journal === 'ALL' ? 'All journals' : <JournalBadge code={open.journal} /> },
              { label: 'Type', value: <Badge tone={CATEGORY_TONE[auditCategory(open.action)]}>{categoryLabel(open.action)}</Badge> },
              { label: 'Entry ID', value: <span className="font-mono text-xs">{open.id}</span> },
            ]} />
            <section aria-labelledby="diff-h">
              <h3 id="diff-h" className="mb-2 text-sm font-semibold">What changed</h3>
              <Diff entry={open} />
            </section>
            <p className="text-xs text-muted">Audit entries are append-only and cannot be edited or deleted.</p>
          </div>
        )}
      </Drawer>
    </>
  )
}
