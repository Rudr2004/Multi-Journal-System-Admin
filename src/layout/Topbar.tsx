import { Bell, CircleHelp, LogOut, Menu, RotateCcw, Rows3, Rows4, Search, Send, ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'
import { resetAll } from '@/mock/reset'
import { toast } from '@/components/Toasts'
import { Link, useNavigate } from 'react-router-dom'
import { useDataStore, useSession } from '@/mock/store'
import { MOCK_DATA } from '@/mock/mode'
import { nextDispatch } from '@/mock/data/papers'
import { signOut } from '@/lib/api/session'
import { useCurrentUser, usePermission, useRole, useRoles } from '@/permissions/hooks'
import { ROLE_META } from '@/permissions/roles'
import { formatDate, formatRelative, formatTime } from '@/shared/formatters'
import { Tooltip } from '@/components/Tooltip'
import { UserAvatar } from '@/components/UserAvatar'
import { JournalSwitcher } from './JournalSwitcher'
import { Popover } from './Popover'
import { useUi } from './uiStore'

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

function DispatchIndicator() {
  const scope = useSession((s) => s.journal)
  const dispatchAccess = usePermission('dispatch')
  const { can } = usePermission('submissions')
  const count = useDataStore((s) => s.papers.filter((p) => p.dispatchAt && (scope === 'ALL' || p.journal === scope)).length)
  if (!can('approve')) return null
  const at = nextDispatch()
  return (
    <Tooltip text={`Next dispatch ${formatDate(at)}, ${formatTime(at)} IST`}>
      <Link to={dispatchAccess.can('view') ? '/dispatch' : '#'} onClick={(e) => { if (!dispatchAccess.can('view')) e.preventDefault() }} className="btn-ghost hidden gap-1.5 md:inline-flex">
        <Send size={16} strokeWidth={1.5} aria-hidden />
        <span className="hidden whitespace-nowrap xl:inline">Next {formatTime(at)} dispatch</span><span className="whitespace-nowrap xl:hidden">{formatTime(at)}</span>
        <span className="rounded-full bg-accent-soft px-1.5 text-xs font-semibold text-accent">{count}</span>
      </Link>
    </Tooltip>
  )
}

function Notifications() {
  const scope = useSession((s) => s.journal)
  const all = useDataStore((s) => s.activity)
  const activity = useMemo(() => all.filter((a) => scope === 'ALL' || a.journal === scope).slice(0, 5), [all, scope])
  return (
    <Popover
      align="right" panelClassName="w-[340px] max-w-[92vw]"
      trigger={({ toggle, props }) => (
        <button {...props} onClick={toggle} aria-label="Notifications" className="btn-ghost relative h-9 w-9 px-0">
          <Bell size={18} strokeWidth={1.5} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-surface" aria-hidden />
        </button>
      )}
    >
      {() => (
        <div>
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">Notifications</div>
          {activity.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">You are all caught up.</p> : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {activity.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <p><span className="font-medium">{a.actor}</span> {a.text}</p>
                  <p className="mt-0.5 text-xs text-muted">{a.paperId} · {formatRelative(a.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  )
}

function HelpMenu() {
  return (
    <Popover
      align="right" panelClassName="w-64 p-1.5"
      trigger={({ toggle, props }) => <button {...props} onClick={toggle} aria-label="Help" className="btn-ghost h-9 w-9 px-0"><CircleHelp size={18} strokeWidth={1.5} /></button>}
    >
      {(close) => (
        <div className="text-sm">
          <p className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-faint">Help</p>
          <p className="px-2.5 py-1.5">Press <span className="kbd">{isMac ? '⌘' : 'Ctrl'} K</span> to search or jump anywhere.</p>
          <p className="px-2.5 py-1.5">Press <span className="kbd">/</span> to focus table search.</p>
          <p className="px-2.5 py-1.5 text-muted">Need help? support@edtechpublishers.in</p>
          {MOCK_DATA && <button className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-2.5 py-2 text-left hover:bg-subtle" onClick={() => { resetAll(); close(); toast.success('Demo data reset to its starting state.') }}><RotateCcw size={15} strokeWidth={1.5} aria-hidden /> Reset demo data</button>}
        </div>
      )}
    </Popover>
  )
}

function UserMenu() {
  const user = useCurrentUser()
  const roles = useRoles()
  const density = useSession((s) => s.density)
  const setDensity = useSession((s) => s.setDensity)
  const navigate = useNavigate()
  if (!user) return null
  return (
    <Popover
      align="right" panelClassName="w-72"
      trigger={({ toggle, props }) => (
        <button {...props} onClick={toggle} className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-subtle" aria-label="User menu">
          <UserAvatar name={user.name} photo={user.photo} size={32} />
          <span className="hidden whitespace-nowrap text-left leading-tight xl:block">
            <span className="block text-sm font-medium">{user.name}</span>
            <span className="block text-xs text-muted">{roles.length ? roles.map((r) => ROLE_META[r].label).join(', ') : 'No role'}</span>
          </span>
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">{user.name}</p>
            <p className="text-xs text-muted">{user.email}</p>
            <Link to="/profile" onClick={close} className="mt-2 inline-block text-sm font-medium text-accent hover:underline">My profile &amp; password</Link>
            <p className="mt-1.5 text-xs text-muted">Role in this journal: <span className="font-medium text-ink">{roles.length ? roles.map((r) => ROLE_META[r].label).join(', ') : '—'}</span></p>
          </div>
          <div className="border-b border-line px-4 py-3">
            <p className="label">Display density</p>
            <div role="radiogroup" aria-label="Display density" className="grid grid-cols-2 gap-1 rounded-md bg-subtle p-1">
              {([['comfortable', 'Comfortable', Rows3], ['compact', 'Compact', Rows4]] as const).map(([v, label, Icon]) => (
                <button key={v} role="radio" aria-checked={density === v} onClick={() => setDensity(v)}
                  className={`flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium ${density === v ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
                  <Icon size={14} strokeWidth={1.5} aria-hidden /> {label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-1.5">
            <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-subtle" onClick={() => { close(); void signOut().then(() => navigate('/login')) }}>
              <LogOut size={16} strokeWidth={1.5} aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}
    </Popover>
  )
}

export function Topbar() {
  const setPalette = useUi((s) => s.setPalette)
  const setMobileNav = useUi((s) => s.setMobileNav)
  const role = useRole()
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
      <button aria-label="Open navigation" className="btn-ghost h-9 w-9 px-0 lg:hidden" onClick={() => setMobileNav(true)}><Menu size={18} strokeWidth={1.5} /></button>
      <JournalSwitcher />
      <button onClick={() => setPalette(true)} className="ml-2 hidden h-9 min-w-0 max-w-md flex-1 items-center gap-2 rounded-md border border-line bg-page px-3 text-sm text-faint hover:border-slate-300 sm:flex">
        <Search size={15} strokeWidth={1.5} aria-hidden />
        <span className="flex-1 truncate text-left">Search Paper ID, DOI, email, ticket…</span>
        <span className="kbd">{isMac ? '⌘' : 'Ctrl'} K</span>
      </button>
      <button aria-label="Search" className="btn-ghost h-9 w-9 px-0 sm:hidden" onClick={() => setPalette(true)}><Search size={18} strokeWidth={1.5} /></button>
      <div className="ml-auto flex items-center gap-1">
        {(role === 'REVIEWER' || role === 'REVIEW_PANEL_MEMBER') && (
          <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800" title="Authors and reviewers stay anonymous to each other throughout peer review.">
            <ShieldCheck size={14} aria-hidden /><span className="whitespace-nowrap"><span className="hidden md:inline">Double Blind Peer Review (Anonymous)</span><span className="md:hidden">Double blind</span></span>
          </span>
        )}
        {MOCK_DATA && <DispatchIndicator />}
        {MOCK_DATA && <Notifications />}
        <HelpMenu />
        <UserMenu />
      </div>
    </header>
  )
}
