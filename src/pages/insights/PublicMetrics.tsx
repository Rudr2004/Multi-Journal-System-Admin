import { Lock } from 'lucide-react'
import { useAsync } from '@/lib/useAsync'
import { useJournals, usePermission } from '@/permissions/hooks'
import { Switch } from '@/components/Form'
import { JournalBadge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { ErrorState, Skeleton } from '@/components/States'
import { toast } from '@/components/Toasts'
import { journalByCode } from '@/mock/data/core'
import { getPublicMetricValues, setPublicMetric } from '@/mock/api/analytics'
import { PUBLIC_METRICS, useInsightsStore, type PublicMetricId } from '@/mock/stores/insights'
import type { JournalCode } from '@/shared/types'

/** Which real figures each journal website may show. Super Admin edits; Editors can read. */
export function PublicMetrics() {
  const journals = useJournals()
  const perm = usePermission('analytics')
  const canEdit = perm.can('manage')
  const config = useInsightsStore((s) => s.publicMetrics)
  const { data, loading, error, reload } = useAsync(() => getPublicMetricValues(), [])

  const toggle = async (code: JournalCode, id: PublicMetricId, label: string, v: boolean) => {
    try {
      await setPublicMetric(code, id, label, v)
      toast.success(`${label} is now ${v ? 'shown' : 'hidden'} on ${journalByCode(code).domain}.`)
    } catch {
      toast.error('Could not save this setting. Try again.')
    }
  }

  if (error) return <div className="card"><ErrorState message="Public metrics could not be loaded." onRetry={reload} /></div>

  return (
    <div className="space-y-4">
      <div className="card flex items-start gap-3 p-4 text-sm">
        {!canEdit && <Lock size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-faint" />}
        <p className="text-muted">
          Only real figures from this dashboard can appear on a journal website — never typed-in numbers. The value shown under each switch is what the website would display
          (last 12 months). {canEdit ? 'Changes apply immediately and are written to the audit log.' : (perm.why('manage') ?? '')}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {journals.map((code) => (
          <SectionCard key={code} title={journalByCode(code).domain} action={<JournalBadge code={code} />}>
            <ul className="divide-y divide-line">
              {PUBLIC_METRICS.map((m) => (
                <li key={m.id} className="py-2.5 first:pt-0 last:pb-0">
                  <Switch
                    checked={config[code][m.id]} disabled={!canEdit} label={m.label}
                    description={loading ? m.description : `${m.description} Now: ${data?.[code][m.id]}`}
                    onChange={(v) => toggle(code, m.id, m.label, v)}
                  />
                </li>
              ))}
            </ul>
            {loading && <Skeleton className="mt-3 h-2 w-24" />}
          </SectionCard>
        ))}
      </div>
    </div>
  )
}
