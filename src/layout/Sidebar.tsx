import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NAV_GROUPS } from '@/navigation/nav'
import { levelFor } from '@/permissions/matrix'
import { useCurrentUser, useRole } from '@/permissions/hooks'
import { ROLE_META } from '@/permissions/roles'
import { useSession } from '@/mock/store'
import { cn, initials } from '@/lib/utils'
import { useUi } from './uiStore'

export function Logo({ compact, dark }: { compact?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-sm ring-1 ring-white/10" aria-hidden>
        <svg width="17" height="17" viewBox="0 0 32 32" fill="none"><path d="M7 9h18M7 16h18M7 23h11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className={cn('text-[15px] font-semibold tracking-tight', dark && 'text-white')}>Journal Admin</div>
          <div className={cn('text-[11px]', dark ? 'text-slate-400' : 'text-muted')}>EdTech Publishers</div>
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
    <nav aria-label="Main" className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-4">
      {groups.map((g) => (
        <div key={g.label} className="mt-5 first:mt-2">
          {!collapsed ? (
            <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">{g.label}</div>
          ) : (
            <div className="mx-3 mb-2 border-t border-white/10" />
          )}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex w-full items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white',
                    )
                  }
                  style={{ height: 'var(--control-h)' }}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span aria-hidden className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-indigo-400" />}
                      <item.icon size={17} strokeWidth={1.6} aria-hidden className={cn('shrink-0 transition-colors', isActive ? 'text-indigo-300' : 'text-slate-400 group-hover:text-slate-200')} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.draft && <span className="ml-auto rounded-full bg-amber-400/15 px-1.5 py-px text-[10px] font-semibold text-amber-300">Draft</span>}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function UserCard({ collapsed }: { collapsed: boolean }) {
  const user = useCurrentUser()
  const role = useRole()
  if (!user) return null
  return (
    <div className={cn('flex items-center gap-2.5 rounded-lg bg-white/5 p-2', collapsed && 'justify-center p-1.5')} title={collapsed ? `${user.name} · ${role ? ROLE_META[role].label : ''}` : undefined}>
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-semibold text-indigo-100">{initials(user.name)}</span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[13px] font-medium text-white">{user.name}</span>
          <span className="block truncate text-[11px] text-slate-400">{role ? ROLE_META[role].label : 'No role'}</span>
        </span>
      )}
    </div>
  )
}

export function Sidebar() {
  const collapsed = useSession((s) => s.sidebarCollapsed)
  const toggle = useSession((s) => s.toggleSidebar)
  return (
    <aside className={cn('hidden shrink-0 flex-col bg-slate-900 text-slate-300 transition-[width] lg:flex', collapsed ? 'w-[68px]' : 'w-[260px]')}>
      <div className={cn('flex h-14 items-center border-b border-white/10', collapsed ? 'justify-center' : 'px-5')}><Logo compact={collapsed} dark /></div>
      <Nav collapsed={collapsed} />
      <div className="space-y-2 border-t border-white/10 p-3">
        <UserCard collapsed={collapsed} />
        <button onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn('flex h-9 w-full items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white', collapsed && 'justify-center px-0')}>
          {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.6} /> : <><PanelLeftClose size={17} strokeWidth={1.6} /> Collapse</>}
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
      <div className="absolute inset-0 bg-slate-900/50" onClick={() => set(false)} />
      <aside role="dialog" aria-modal="true" aria-label="Navigation" className="absolute left-0 top-0 flex h-full w-[284px] max-w-[85vw] flex-col bg-slate-900 shadow-overlay">
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
          <Logo dark />
          <button aria-label="Close navigation" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white" onClick={() => set(false)}><X size={18} strokeWidth={1.6} /></button>
        </div>
        <Nav collapsed={false} onNavigate={() => set(false)} />
        <div className="border-t border-white/10 p-3"><UserCard collapsed={false} /></div>
      </aside>
    </div>
  )
}
