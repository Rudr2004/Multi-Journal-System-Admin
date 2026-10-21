import { ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { resolveNav } from '@/navigation/nav'
import { useRoles } from '@/permissions/hooks'
import { DraftLabel } from '@/components/States'
import { Badge } from '@/components/Badges'

interface Props {
  title: string
  description?: string
  actions?: React.ReactNode
  /** Extra breadcrumb crumbs after the module, e.g. a paper ID. */
  crumbs?: { label: string; to?: string }[]
  draft?: boolean
  /** Extra badges, e.g. a feature flag's "Proposed". */
  badges?: string[]
}

/**
 * Titles on a module's own page use the client's exact module name for the signed-in role
 * (e.g. "Manuscript Submissions" for an Editor, "Assigned Manuscripts" for an Associate Editor).
 */
export function PageHeader({ title, description, actions, crumbs = [], draft, badges = [] }: Props) {
  const { pathname } = useLocation()
  const roles = useRoles()
  const { group, item, exact } = resolveNav(roles, pathname)
  const shownTitle = exact && item ? item.label : title
  const trail = [
    ...(group?.label ? [{ label: group.label }] : []),
    ...(item && item.path !== '/' ? [{ label: item.label, to: item.path }] : [{ label: 'Home' }]),
    ...(!exact && item && title !== item.label && crumbs.length === 0 ? [{ label: title }] : []),
    ...crumbs,
  ]
  const allBadges = [...(exact && item?.badge ? [item.badge] : []), ...badges]
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted">
          {trail.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} strokeWidth={1.5} aria-hidden />}
              {'to' in c && c.to && i < trail.length - 1 ? <Link to={c.to} className="hover:text-ink hover:underline">{c.label}</Link> : <span aria-current={i === trail.length - 1 ? 'page' : undefined}>{c.label}</span>}
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold leading-8 tracking-tight">{shownTitle}</h1>
          {draft && <DraftLabel />}
          {[...new Set(allBadges)].map((b) => (
            <Badge key={b} tone={b === 'To confirm' ? 'warning' : b === 'Under discussion' ? 'info' : 'accent'}>{b}</Badge>
          ))}
        </div>
        {description && <p className="mt-0.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
