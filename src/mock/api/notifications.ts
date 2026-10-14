import { recordAudit } from '../actions'
import { ALERT_ROLES, STAFF_ALERT_TYPES, type AlertRole, type StaffAlertPrefs } from '../data/inbox'
import { useCommStore } from '../stores/communication'
import { ApiError, delay } from './latency'

export const listStaffAlerts = (): Promise<StaffAlertPrefs> => delay(structuredClone(useCommStore.getState().staffAlerts))

/** Turns one in-app alert on or off for a role. */
export async function setStaffAlert(alertKey: string, role: AlertRole, enabled: boolean) {
  const type = STAFF_ALERT_TYPES.find((a) => a.key === alertKey)
  if (!type || !ALERT_ROLES.includes(role)) throw new ApiError('Unknown alert type or role', 'not_found')
  if (!type.roles.includes(role)) throw new ApiError('This role has no access to the screen this alert opens', 'invalid')
  const { staffAlerts, patch } = useCommStore.getState()
  patch({ staffAlerts: { ...staffAlerts, [alertKey]: { ...staffAlerts[alertKey], [role]: enabled } } })
  recordAudit({ journal: 'ALL', action: `${enabled ? 'Enabled' : 'Disabled'} staff alert`, target: `${type.label} / ${role}`, oldValue: enabled ? 'off' : 'on', newValue: enabled ? 'on' : 'off' })
  return delay(true, 120, 260)
}
