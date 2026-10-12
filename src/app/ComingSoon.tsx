import { Hammer } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { EmptyState } from '@/components/States'
import type { NavItem } from '@/navigation/nav'

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
