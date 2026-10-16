import { Link } from 'react-router-dom'
import { Gauge, TriangleAlert } from 'lucide-react'
import { sjifForYear } from '@/mock/data/metrics'
import { useMetricsStore } from '@/mock/stores/metrics'
import { usePermission } from '@/permissions/hooks'
import type { JournalCode } from '@/shared/types'

/**
 * The SJIF impact factor that applies to a backdated article, looked up automatically from the year the
 * article is published in (the chosen past issue's year). Values are managed under Journal Metrics.
 */
export function SjifForIssue({ journal, issueDate }: { journal: JournalCode; issueDate: string }) {
  const years = useMetricsStore((s) => s.configs[journal].sjifYears)
  const canManage = usePermission('journalMetrics').can('manage')
  const year = new Date(issueDate).getFullYear()
  const hit = sjifForYear(years, year)

  if (hit?.exact) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
        <Gauge size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">SJIF impact factor for {year}: <span className="tabular-nums">{hit.entry.value}</span></p>
          <p className="text-xs text-green-800">Fetched automatically from Journal Metrics for the publication year of the chosen issue.
            {hit.entry.link && <> <a href={hit.entry.link} target="_blank" rel="noreferrer" className="underline">Evidence</a></>}</p>
        </div>
      </div>
    )
  }
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <TriangleAlert size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">
          {hit
            ? <>No SJIF value is entered for {year}. Closest earlier year: {hit.entry.year} (<span className="tabular-nums">{hit.entry.value}</span>).</>
            : <>No SJIF impact factor is recorded for {year} or any earlier year.</>}
        </p>
        <p className="text-xs text-amber-800">
          {canManage
            ? <>Add {year} under <Link to="/journal-metrics" className="underline">Journal Metrics → SJIF Impact Factor Management</Link>; this page will then pick it up automatically.</>
            : <>Ask a Super Admin to add {year} under Journal Metrics; this page will then pick it up automatically.</>}
        </p>
      </div>
    </div>
  )
}
