import { Hammer } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { EmptyState } from '@/components/States'
import type { NavItem } from '@/navigation/nav'

/** Shown in `VITE_DEV_MODE=prod` for screens that are not connected to the backend yet (no mock data is displayed). */
export function NotConnected({ item }: { item: Pick<NavItem, 'label' | 'description' | 'draft'> }) {
  return (
    <>
      <PageHeader title={item.label} description={item.description} draft={item.draft} />
      <div className="card">
        <EmptyState icon={Hammer} title="Not connected to the backend yet" hint="This screen has no live data source yet, and demo data is switched off in this environment. Set VITE_DEV_MODE=local to see the prototype data." />
      </div>
    </>
  )
}

/** Placeholder for screens landing in a later build phase. */
export function ComingSoon({ item }: { item: Pick<NavItem, 'label' | 'description' | 'phase' | 'draft'> }) {
  return (
    <>
      <PageHeader title={item.label} description={item.description} draft={item.draft} />
      <div className="card">
        <EmptyState icon={Hammer} title={`Scheduled for build phase ${item.phase}`} hint="This screen is part of the agreed scope and will be built in a later phase of the prototype. Navigation and permissions for it are already live." />
      </div>
    </>
  )
}
