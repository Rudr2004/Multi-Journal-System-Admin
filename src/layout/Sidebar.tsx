import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV_GROUPS } from '@/navigation/nav'
import { levelFor } from '@/permissions/matrix'
import { useRole } from '@/permissions/hooks'
import { useSession } from '@/mock/store'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/Tooltip'
import { useUi } from './uiStore'

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M7 9h18M7 16h18M7 23h11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-sm font-semibold">Journal Admin</div>
          <div className="text-[11px] text-muted">EdTech Publishers</div>
        </div>
      )}
    </div>
  )
}

function Nav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const role = useRole()
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => levelFor(role, i.area) !== 'none') }))
    .filter((g) => g.items.length)
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 pb-4">
      {groups.map((g) => (
        <div key={g.label} className="mt-4 first:mt-1">
          {!collapsed ? (
            <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{g.label}</div>
          ) : (
            <div className="mx-2 mb-1 border-t border-line" />
          )}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.path}>
                <Tooltip text={collapsed ? item.label : undefined} className="flex w-full">
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    onClick={onNavigate}
                    aria-label={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-ink',
                      )
                    }
                    style={{ height: 'var(--control-h)' }}
                  >
                    <item.icon size={17} strokeWidth={1.5} className="shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.draft && <span className="ml-auto rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-800">Draft</span>}
                  </NavLink>
                </Tooltip>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function Sidebar() {
  const collapsed = useSession((s) => s.sidebarCollapsed)
  const toggle = useSession((s) => s.toggleSidebar)
  return (
    <aside className={cn('hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] lg:flex', collapsed ? 'w-[60px]' : 'w-[248px]')}>
      <div className={cn('flex h-14 items-center border-b border-line', collapsed ? 'justify-center' : 'px-4')}><Logo compact={collapsed} /></div>
      <Nav collapsed={collapsed} />
      <div className="border-t border-line p-2">
        <button onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={cn('btn-ghost w-full', collapsed ? 'px-0' : 'justify-start')}>
          {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.5} /> : <><PanelLeftClose size={17} strokeWidth={1.5} /> Collapse</>}
        </button>
      </div>
    </aside>
  )
}

/** Drawer version used below the lg breakpoint. */
export function MobileNav() {
  const open = useUi((s) => s.mobileNavOpen)
  const set = useUi((s) => s.setMobileNav)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => set(false)} />
      <aside role="dialog" aria-modal="true" aria-label="Navigation" className="absolute left-0 top-0 flex h-full w-[280px] max-w-[85vw] flex-col bg-surface shadow-overlay">
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <Logo />
          <button aria-label="Close navigation" className="btn-ghost h-8 w-8 px-0" onClick={() => set(false)}><X size={18} strokeWidth={1.5} /></button>
        </div>
        <Nav collapsed={false} onNavigate={() => set(false)} />
      </aside>
    </div>
  )
}
