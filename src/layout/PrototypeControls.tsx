import { useNavigate } from 'react-router-dom'
import { FlaskConical, RotateCcw } from 'lucide-react'
import { useDataStore, useSession } from '@/mock/store'
import { DEMO_USER_LABELS } from '@/mock/data/core'
import { assignedJournals, isSuperAdmin } from '@/permissions/hooks'
import { resetAll } from '@/mock/reset'
import { toast } from '@/components/Toasts'
import { Popover } from './Popover'

/** Hidden unless explicitly enabled with VITE_PROTOTYPE=true. */
export const PROTOTYPE_ENABLED = import.meta.env.VITE_PROTOTYPE === 'true'

const SCENARIOS: { label: string; user: string; to: string; phase: number }[] = [
  { label: '1 · Screen, review & approve an IJMAT paper', user: 'u-editor', to: '/submissions', phase: 2 },
  { label: '2 · Offline UPI payment → production queue', user: 'u-editor', to: '/payments', phase: 4 },
  { label: '3 · Production → return → publish', user: 'u-ae', to: '/production', phase: 3 },
  { label: '4 · Backdated publication', user: 'u-editor', to: '/backdated', phase: 3 },
  { label: '5 · Post-publication correction', user: 'u-editor', to: '/post-publication', phase: 3 },
  { label: '6 · Invite user with two roles', user: 'u-super', to: '/users', phase: 7 },
  { label: '7 · Forms inbox → Review Panel account', user: 'u-super', to: '/forms-inbox', phase: 6 },
  { label: '8 · Resend a failed WhatsApp message', user: 'u-super', to: '/communication-log', phase: 5 },
  { label: '9 · Schedule announcement for two journals', user: 'u-super', to: '/announcements', phase: 6 },
  { label: '10 · Best Paper award cycle', user: 'u-super', to: '/awards', phase: 6 },
  { label: '11 · Analytics compare & export', user: 'u-super', to: '/analytics', phase: 7 },
]

export function PrototypeControls() {
  const navigate = useNavigate()
  const { userId, flags, setUser, setFlag } = useSession()
  const users = useDataStore((s) => s.users)
  
  if (!PROTOTYPE_ENABLED) return null

  const switchTo = (id: string, to = '/') => {
    const u = users.find((x) => x.id === id)
    if (!u) return
    setUser(id, isSuperAdmin(u) ? 'ALL' : (assignedJournals(u, flags)[0] ?? 'ALL'))
    navigate(to)
  }

  return (
    <div className="fixed bottom-4 right-4 z-[80]">
      <Popover
        panelClassName="bottom-full right-0 left-auto mb-2 top-auto w-[340px] max-w-[92vw] p-3 !mt-0"
        trigger={({ toggle, props }) => (
          <button {...props} onClick={toggle} className="flex h-10 items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3.5 text-xs font-medium text-white shadow-overlay hover:bg-slate-800">
            <FlaskConical size={15} strokeWidth={1.5} aria-hidden /> Prototype controls
          </button>
        )}
      >
        {(close) => (
          <div className="space-y-3 text-sm">
            <div>
              <label className="label" htmlFor="proto-user">Switch user</label>
              <select id="proto-user" className="input" value={userId ?? ''} onChange={(e) => { switchTo(e.target.value); close() }}>
                {!userId && <option value="">— signed out —</option>}
                {users.map((u) => <option key={u.id} value={u.id}>{DEMO_USER_LABELS[u.id] ?? u.name}</option>)}
              </select>
            </div>
            <div>
              <p className="label">Feature flags</p>
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-line px-3 py-2">
                <span>reviewPanel <span className="text-xs text-muted">(Review Panel role)</span></span>
                <input type="checkbox" role="switch" checked={flags.reviewPanel} onChange={(e) => setFlag('reviewPanel', e.target.checked)} className="h-4 w-4 accent-indigo-600" />
              </label>
            </div>
            <div>
              <p className="label">Demo scenarios</p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                {SCENARIOS.map((s) => (
                  <li key={s.label}>
                    <button className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-subtle" onClick={() => { switchTo(s.user, s.to); close() }}>
                      <span>{s.label}</span>
                      <span className="shrink-0 text-faint">Ph {s.phase}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <button className="btn-secondary w-full" onClick={() => { resetAll(); toast.success('Demo data reset to its starting state.') }}>
              <RotateCcw size={15} strokeWidth={1.5} aria-hidden /> Reset demo data
            </button>
          </div>
        )}
      </Popover>
    </div>
  )
}
