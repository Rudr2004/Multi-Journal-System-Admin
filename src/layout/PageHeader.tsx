import { ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { ALL_NAV_ITEMS, NAV_GROUPS } from '@/navigation/nav'
import { DraftLabel } from '@/components/States'

interface Props {
  title: string
  description?: string
  actions?: React.ReactNode
  /** Extra breadcrumb crumbs after the section, e.g. a paper ID. */
  crumbs?: { label: string; to?: string }[]
  draft?: boolean
}

export function PageHeader({ title, description, actions, crumbs = [], draft }: Props) {
  const { pathname } = useLocation()
  const item = ALL_NAV_ITEMS.find((n) => n.path === pathname) ?? ALL_NAV_ITEMS.find((n) => n.path !== '/' && pathname.startsWith(n.path))
  const group = item && NAV_GROUPS.find((g) => g.items.includes(item))
  const trail = [{ label: group?.label ?? 'Home' }, ...(item && item.path !== '/' ? [{ label: item.label, to: item.path }] : []), ...crumbs]
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1 text-xs text-muted">
          {trail.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} strokeWidth={1.5} aria-hidden />}
              {c.to && i < trail.length - 1 ? <Link to={c.to} className="hover:text-ink hover:underline">{c.label}</Link> : <span aria-current={i === trail.length - 1 ? 'page' : undefined}>{c.label}</span>}
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold leading-8 tracking-tight">{title}</h1>
          {draft && <DraftLabel />}
        </div>
        {description && <p className="mt-0.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
