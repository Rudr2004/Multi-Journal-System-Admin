import { useState } from 'react'
import { PageHeader } from '@/layout/PageHeader'
import { Tabs } from '@/components/Tabs'
import { AnalyticsOverview } from './AnalyticsOverview'
import { PublicMetrics } from './PublicMetrics'
import { useSession } from '@/mock/store'

export function AnalyticsPage() {
  const [tab, setTab] = useState('overview')
  // re-mount the overview when the journal scope changes so its default selection follows the switcher
  const scope = useSession((s) => s.journal)
  return (
    <>
      <PageHeader title="Analytics" description="Submissions, decisions, revenue, readership and delivery across your journals." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview', content: <AnalyticsOverview key={scope} /> },
        { id: 'public', label: 'Public metrics', content: <PublicMetrics /> },
      ]} />
    </>
  )
}
