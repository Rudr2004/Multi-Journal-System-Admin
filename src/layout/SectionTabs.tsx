import { NavLink, useLocation } from 'react-router-dom'
import { sectionFor } from '@/navigation/nav'
import { levelForRoles } from '@/permissions/matrix'
import { useRoles } from '@/permissions/hooks'
import { cn } from '@/lib/utils'

/** Secondary navigation inside a module (e.g. Manuscript Submissions → Review management → Final approval). */
export function SectionTabs() {
  const { pathname } = useLocation()
  const roles = useRoles()
  const section = sectionFor(roles, pathname)
  if (!section) return null
  const tabs = section.tabs.filter((t) => levelForRoles(roles, t.area) !== 'none')
  if (tabs.length < 2) return null
  return (
    <nav aria-label={`${section.label} sections`} className="-mt-1 mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <NavLink key={t.path} to={t.path} end
          className={({ isActive }) => cn('-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink')}>
          <t.icon size={15} strokeWidth={1.5} aria-hidden /> {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
