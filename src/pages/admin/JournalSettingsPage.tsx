import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PageHeader } from '@/layout/PageHeader'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { useJournals, usePermission } from '@/permissions/hooks'
import { FLAG_META, type FeatureFlags } from '@/permissions/flags'
import { useSession } from '@/mock/store'
import { useAdminStore } from '@/mock/stores/admin'
import { Badge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { Switch } from '@/components/Form'
import { ErrorState, Skeleton } from '@/components/States'
import { Tabs } from '@/components/Tabs'
import { toast } from '@/components/Toasts'
import { getJournalSettings, diffSettings, auditFlagChange } from '@/mock/api/journalSettings'
import type { JournalSettings } from '@/mock/data/settings'
import type { JournalCode } from '@/shared/types'
import { JournalSettingsForm, SETTINGS_SECTIONS } from './JournalSettingsForm'

const BADGE_TONE = { Proposed: 'accent', 'Under discussion': 'info', 'To confirm': 'warning' } as const

function scrollToSection(id: string) {
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

function ProposedFeatures() {
  const flags = useSession((s) => s.flags)
  const setFlag = useSession((s) => s.setFlag)
  const { can, why } = usePermission('journalSettings')
  const canEdit = can('manage')
  const keys = Object.keys(FLAG_META) as (keyof FeatureFlags)[]
  const change = (k: keyof FeatureFlags, on: boolean) => {
    setFlag(k, on)
    auditFlagChange(k, on)
    toast.success(`${FLAG_META[k].label} switched ${on ? 'on' : 'off'}. Recorded in the audit log.`)
  }
  return (
    <div id="sec-features" className="scroll-mt-20">
      <SectionCard title="Proposed features">
        <p className="mb-3 text-sm text-muted">Features that may be outside the original scope. Switch them on or off to see how the product looks with and without them. {!canEdit && (why('manage') ?? '')}</p>
        <ul className="divide-y divide-line">
          {keys.map((k) => (
            <li key={k} className="py-3 first:pt-0 last:pb-0">
              <div className="mb-1"><Badge tone={BADGE_TONE[FLAG_META[k].badge]}>{FLAG_META[k].badge}</Badge></div>
              <Switch label={FLAG_META[k].label} description={FLAG_META[k].description} checked={flags[k]} disabled={!canEdit} onChange={(on) => change(k, on)} />
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}

export function JournalSettingsPage() {
  const journals = useJournals()
  const scope = useSession((s) => s.journal)
  const savedStore = useAdminStore((s) => s.journalSettings)
  const { loading, error, reload } = useAsync(() => getJournalSettings(), [])
  const [tab, setTab] = useState<string>(scope === 'ALL' ? '' : scope)
  const [drafts, setDrafts] = useState<Partial<Record<JournalCode, JournalSettings>>>({})
  const { hash } = useLocation()

  // drafts live here so switching journal tabs never loses unsaved edits
  const onDraft = useCallback((code: JournalCode, v: JournalSettings | null) => {
    setDrafts((d) => {
      const next = { ...d }
      if (v) next[code] = v
      else delete next[code]
      return next
    })
  }, [])

  const dirty = useMemo(
    () => journals.filter((c) => drafts[c] && diffSettings(savedStore[c], drafts[c]!).length > 0),
    [journals, drafts, savedStore],
  )
  useUnsavedChanges(dirty.length > 0)
  const current = (journals.includes(tab as JournalCode) ? tab : journals[0]) as JournalCode | undefined

  useEffect(() => {
    if (!hash || loading) return
    const t = setTimeout(() => document.getElementById(hash.slice(1) === 'features' ? 'sec-features' : `sec-${hash.slice(1)}`)?.scrollIntoView({ block: 'start' }), 50)
    return () => clearTimeout(t)
  }, [hash, loading])

  return (
    <>
      <PageHeader title="Journal Settings" description="Every value the journal websites show: identity, contact, fees, subjects, trust and call for papers, plus feature switches." />
      <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-4 space-y-0.5 text-sm">
            {[...SETTINGS_SECTIONS, { id: 'features', label: 'Proposed features' }].map((s) => (
              <li key={s.id}>
                <a href={`#sec-${s.id}`} className="block rounded-md px-2.5 py-1.5 text-muted hover:bg-subtle hover:text-ink"
                  onClick={(e) => { e.preventDefault(); scrollToSection(s.id) }}>{s.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          {error ? (
            <div className="card"><ErrorState message="Settings could not be loaded." onRetry={reload} /></div>
          ) : loading || !current ? (
            <div className="space-y-4" aria-busy="true" aria-label="Loading settings"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div>
          ) : (
            <Tabs value={current} onChange={setTab} tabs={journals.map((c) => ({
              id: c, label: c, badge: dirty.includes(c) ? 'unsaved' : undefined,
              content: <JournalSettingsForm key={c} code={c} saved={savedStore[c]} draft={drafts[c]} onDraft={onDraft} />,
            }))} />
          )}
          <ProposedFeatures />
        </div>
      </div>
    </>
  )
}
