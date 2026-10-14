import { useCurrentUser, useRole } from '@/permissions/hooks'
import { useSession } from '@/mock/store'
import { PageHeader } from '@/layout/PageHeader'
import { ROLE_META } from '@/permissions/roles'
import { AdminDashboard } from './AdminDashboard'
import { EditorDashboard } from './EditorDashboard'
import { AssociateDashboard } from './AssociateDashboard'
import { ReviewerDashboard } from './ReviewerDashboard'
import { SupportDashboard } from './SupportDashboard'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** Role-specific home: the same route renders a different dashboard per role in the selected journal. */
export function DashboardPage() {
  const role = useRole()
  const user = useCurrentUser()
  const scope = useSession((s) => s.journal)
  const first = user?.name.replace(/^(Dr\.|Prof\.)\s*/, '').split(' ')[0]
  const where = scope === 'ALL' ? 'all journals' : scope

  return (
    <>
      <PageHeader title="Dashboard" description={`${greeting()}, ${first}. Here is ${where} as ${role ? ROLE_META[role].label : 'a user'}.`} />
      {role === 'super_admin' && <AdminDashboard />}
      {role === 'editor' && <EditorDashboard />}
      {role === 'associate_editor' && <AssociateDashboard />}
      {(role === 'reviewer' || role === 'panel_member') && <ReviewerDashboard />}
      {role === 'support' && <SupportDashboard />}
    </>
  )
}
