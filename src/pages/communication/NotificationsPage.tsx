import { useCallback, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { ErrorState } from '@/components/States'
import { Tabs } from '@/components/Tabs'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { usePermission } from '@/permissions/hooks'
import { ROLE_META } from '@/permissions/roles'
import { listTemplateBundle } from '@/mock/api/templates'
import { listStaffAlerts, setStaffAlert } from '@/mock/api/notifications'
import { useCommStore } from '@/mock/stores/communication'
import { ALERT_ROLES, STAFF_ALERT_TYPES, type AlertRole } from '@/mock/data/inbox'
import { PageSkeleton } from './parts'
import { PauseTab, RemindersTab, SlotsTab, TemplatesTab } from './TemplatesPage'

/* ------------------------------ staff alerts ------------------------------ */

function AlertSwitch({ on, disabled, label, onToggle }: { on: boolean; disabled?: boolean; label: string; onToggle: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onToggle(!on)}
      className={cn('relative inline-block h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50', on ? 'bg-accent' : 'bg-slate-300')}>
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

function StaffAlertsTab({ canEdit, why }: { canEdit: boolean; why?: string }) {
  const prefs = useCommStore((s) => s.staffAlerts)
  const [busy, setBusy] = useState<string | null>(null)
  const toggle = async (key: string, role: AlertRole, value: boolean, label: string) => {
    setBusy(`${key}:${role}`)
    try {
      await setStaffAlert(key, role, value)
      toast.success(`${label} alerts ${value ? 'on' : 'off'} for ${ROLE_META[role].label}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the alert')
    } finally {
      setBusy(null)
    }
  }
  return (
    <SectionCard title="In-app alerts by role" flush>
      <p className="border-b border-line px-4 py-3 text-sm text-muted">
        Choose which in-app alerts (the bell in the top bar) each role receives. A dash means the role has no access to the screen the alert opens.
        {!canEdit && <span className="ml-1 font-medium">{why}</span>}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-page text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-medium">Alert</th>
              {ALERT_ROLES.map((r) => <th key={r} scope="col" className="px-3 py-2 text-center font-medium">{ROLE_META[r].label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {STAFF_ALERT_TYPES.map((a) => (
              <tr key={a.key}>
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <span className="block font-medium">{a.label}</span>
                  <span className="block text-xs text-muted">{a.description}</span>
                </th>
                {ALERT_ROLES.map((r) => (
                  <td key={r} className="px-3 py-3 text-center">
                    {a.roles.includes(r)
                      ? <AlertSwitch on={!!prefs[a.key]?.[r]} disabled={!canEdit || busy === `${a.key}:${r}`} label={`${a.label} for ${ROLE_META[r].label}`} onToggle={(v) => toggle(a.key, r, v, a.label)} />
                      : <span aria-label="Not applicable" className="text-faint">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

/* ------------------------------ page ------------------------------ */

export function NotificationsPage() {
  const { can, why } = usePermission('notifications')
  const canEdit = can('manage')
  const { data, loading, error, reload } = useAsync(listTemplateBundle, [])
  const alerts = useAsync(listStaffAlerts, [])
  const [tab, setTab] = useState('messages')
  const [sub, setSub] = useState('slots')
  const dirtyRef = useRef(false)
  const onDirty = useCallback((d: boolean) => { dirtyRef.current = d }, [])
  const guarded = (cur: string, next: string, set: (v: string) => void) => {
    if (cur === next) return
    if (dirtyRef.current && !window.confirm('You have unsaved changes. Discard them and switch tab?')) return
    dirtyRef.current = false
    set(next)
  }
  const w = why('manage')

  return (
    <>
      <PageHeader title="Notification Management" description="Author messages by event and channel, when they are sent, and which in-app alerts each staff role receives."
        actions={!canEdit ? <Badge tone="neutral"><Clock size={12} aria-hidden /> View only</Badge> : undefined} />
      {error || alerts.error ? <div className="card"><ErrorState message="Notification settings could not be loaded." onRetry={() => { reload(); alerts.reload() }} /></div>
        : (loading && !data) || (alerts.loading && !alerts.data) ? <PageSkeleton rows={3} />
        : data && (
          <Tabs value={tab} onChange={(id) => guarded(tab, id, setTab)} tabs={[
            { id: 'messages', label: 'Author Messages', badge: data.templates.length, content: <TemplatesTab bundle={data} canEdit={canEdit} why={w} onDirty={onDirty} reload={reload} /> },
            { id: 'schedule', label: 'Schedule', badge: Object.values(data.channelPaused).filter(Boolean).length || undefined, content: (
              <Tabs value={sub} onChange={(id) => guarded(sub, id, setSub)} tabs={[
                { id: 'slots', label: 'Time slots', content: <div className="pt-4"><SlotsTab initial={data.timeSlots} canEdit={canEdit} why={w} onDirty={onDirty} reload={reload} /></div> },
                { id: 'reminders', label: 'Reminder sequences', content: <div className="pt-4"><RemindersTab initial={data.reminders} canEdit={canEdit} why={w} onDirty={onDirty} reload={reload} /></div> },
                { id: 'pause', label: 'Pause switches', content: <div className="pt-4"><PauseTab paused={data.channelPaused} canEdit={canEdit} why={w} reload={reload} /></div> },
              ]} />
            ) },
            { id: 'staff', label: 'Staff Alerts', content: <StaffAlertsTab canEdit={canEdit} why={w} /> },
          ]} />
        )}
    </>
  )
}
