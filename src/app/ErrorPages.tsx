import { Link } from 'react-router-dom'
import { Compass, ShieldAlert } from 'lucide-react'
import { useCurrentUser, useRole } from '@/permissions/hooks'
import { ROLE_META } from '@/permissions/roles'
import { useSession } from '@/mock/store'

function Shell({ icon: Icon, code, title, children }: { icon: typeof Compass; code: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-muted"><Icon size={24} strokeWidth={1.5} aria-hidden /></div>
      <p className="text-sm font-semibold text-accent">{code}</p>
      <h1 className="mt-1 text-[22px] font-semibold">{title}</h1>
      <div className="mt-2 text-sm text-muted">{children}</div>
      <Link to="/" className="btn-primary mt-6">Back to dashboard</Link>
    </div>
  )
}

export function ForbiddenPage() {
  const role = useRole()
  const user = useCurrentUser()
  const scope = useSession((s) => s.journal)
  return (
    <Shell icon={ShieldAlert} code="403" title="You do not have access to this page">
      <p>
        {user?.name}, your role in {scope === 'ALL' ? 'all journals' : scope} is <strong>{role ? ROLE_META[role].label : 'not set'}</strong>, which does not include this area.
        Ask a Super Admin if you think this is a mistake, or switch journal if you hold a different role elsewhere.
      </p>
    </Shell>
  )
}

export function NotFoundPage() {
  return (
    <Shell icon={Compass} code="404" title="Page not found">
      <p>The page you are looking for does not exist or has moved.</p>
    </Shell>
  )
}
