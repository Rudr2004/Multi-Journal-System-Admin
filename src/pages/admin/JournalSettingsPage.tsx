import { useCallback, useMemo, useState } from 'react'
import { PageHeader } from '@/layout/PageHeader'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { useJournals } from '@/permissions/hooks'
import { useSession } from '@/mock/store'
import { useAdminStore } from '@/mock/stores/admin'
import { ErrorState, Skeleton } from '@/components/States'
import { Tabs } from '@/components/Tabs'
import { getJournalSettings, diffSettings } from '@/mock/api/journalSettings'
import type { JournalSettings } from '@/mock/data/settings'
import type { JournalCode } from '@/shared/types'
import { JournalSettingsForm } from './JournalSettingsForm'

export function JournalSettingsPage() {
  const journals = useJournals()
  const scope = useSession((s) => s.journal)
  const savedStore = useAdminStore((s) => s.journalSettings)
  const { loading, error, reload } = useAsync(() => getJournalSettings(), [])
  const [tab, setTab] = useState<string>(scope === 'ALL' ? '' : scope)
  const [drafts, setDrafts] = useState<Partial<Record<JournalCode, JournalSettings>>>({})

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

  return (
    <>
      <PageHeader title="Journals & settings" description="Identity, Paper IDs, charges, GST, contact slots and website badges — one tab per journal." />
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
    </>
  )
}
