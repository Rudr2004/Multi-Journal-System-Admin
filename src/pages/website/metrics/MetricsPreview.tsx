import { BadgeCheck, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LISTING_LABEL, SYSTEM_STATS, type JournalMetricsConfig } from '@/mock/data/metrics'
import type { SystemFigures } from '@/mock/api/journalMetrics'

export interface StatInfo { key: string; label: string; value: string; note: string }

/** Label and value for any statistic key (system figure, SJIF or another rating). */
export function statInfo(key: string, c: JournalMetricsConfig, sys: SystemFigures): StatInfo | undefined {
  const s = SYSTEM_STATS.find((x) => x.key === key)
  if (s) return { key, label: s.label, value: sys[s.key].display, note: 'Calculated' }
  if (key === 'sjif') return c.sjif.value.trim() ? { key, label: 'SJIF impact factor', value: c.sjif.value.trim(), note: c.sjif.year ? `SJIF ${c.sjif.year}` : 'SJIF' } : undefined
  const r = c.ratings.find((x) => `rating:${x.id}` === key)
  return r ? { key, label: r.name || 'Rating', value: r.value || '-', note: r.year ? String(r.year) : 'Manual' } : undefined
}

const LOGO_TONE: Record<string, string> = {
  indexed: 'border-emerald-300 text-emerald-800',
  evaluation: 'border-amber-300 text-amber-800',
  applied: 'border-slate-300 text-slate-600',
}

/** Mock of the public website: home-page statistics, the statistics table and the indexing logo strip. */
export function MetricsPreview({ config, system, domain }: { config: JournalMetricsConfig; system: SystemFigures; domain: string }) {
  const home = config.home.filter((p) => p.show).map((p) => statInfo(p.key, config, system)).filter((x): x is StatInfo => !!x)
  const table = config.table.filter((p) => p.show).map((p) => statInfo(p.key, config, system)).filter((x): x is StatInfo => !!x)
  const logos = config.logos.filter((l) => l.show)
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-surface" aria-label="Preview of the journal website">
      <figcaption className="flex items-center justify-between border-b border-line bg-subtle px-3 py-1.5 text-xs text-muted">
        <span>Preview: how it appears on the website</span><span>{domain}</span>
      </figcaption>
      <div className="space-y-5 p-4">
        <section aria-label="Home page statistics">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Home page statistics</p>
          {home.length ? (
            <ul className="grid grid-cols-2 gap-2">
              {home.map((s) => (
                <li key={s.key} className="rounded-md bg-slate-900 px-3 py-2 text-white">
                  <p className="text-xl font-semibold tabular-nums leading-6">{s.value}</p>
                  <p className="text-xs text-slate-300">{s.label}</p>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-md border border-dashed border-line p-3 text-center text-xs text-muted">No statistics are shown on the home page.</p>}
        </section>

        <section aria-label="Statistics table">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Journal statistics table</p>
          {table.length ? (
            <table className="w-full text-sm">
              <caption className="sr-only">Journal statistics</caption>
              <tbody className="divide-y divide-line rounded-md border border-line">
                {table.map((s) => (
                  <tr key={s.key}>
                    <th scope="row" className="px-3 py-1.5 text-left font-normal text-muted">{s.label}</th>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="rounded-md border border-dashed border-line p-3 text-center text-xs text-muted">The statistics table is hidden.</p>}
        </section>

        <section aria-label="Indexing logos">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Indexed in</p>
          {logos.length ? (
            <ul className="flex flex-wrap gap-2">
              {logos.map((l) => (
                <li key={l.id} className={cn('rounded-md border bg-surface px-2.5 py-1.5 text-center', LOGO_TONE[l.status])}>
                  <p className="flex items-center justify-center gap-1 text-sm font-semibold">
                    {l.status === 'indexed' && <BadgeCheck size={14} strokeWidth={1.75} aria-hidden />}
                    {l.name}
                    {l.verifyUrl && <ExternalLink size={11} strokeWidth={1.75} aria-label="Verification link" />}
                  </p>
                  {l.status !== 'indexed' && <p className="text-[11px]">{LISTING_LABEL[l.status]}</p>}
                </li>
              ))}
            </ul>
          ) : <p className="rounded-md border border-dashed border-line p-3 text-center text-xs text-muted">No logos are shown.</p>}
        </section>
      </div>
    </figure>
  )
}
