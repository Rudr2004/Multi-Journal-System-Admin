import { platformApi } from './http'
import type { GrantableRole, InviteInput, StaffDetail, StaffPage, StaffQuery, StaffSession } from './types'

/** `/admin/staff` (Super Admin, permission `staff.manage`). Every change that lists a reason needs 3 to 500 characters. */

export const REASON_MIN = 3
export const REASON_MAX = 500

const base = (id: string) => `/admin/staff/${encodeURIComponent(id)}`

export const listStaff = (query: StaffQuery) => platformApi.get<StaffPage>('/admin/staff', { query: { ...query } })
export const getStaff = (id: string) => platformApi.get<StaffDetail>(base(id))
export const listStaffSessions = (id: string) => platformApi.get<StaffSession[]>(`${base(id)}/sessions`)
export const inviteStaff = (input: InviteInput) => platformApi.post<StaffDetail>('/admin/staff/invite', input)

/** `version` is the one read with the person; a stale one answers 412 PRECONDITION_FAILED. */
export const updateStaff = (id: string, version: number, input: { fullName?: string; phone?: string | null }) =>
  platformApi.patch<StaffDetail>(base(id), input, { headers: { 'If-Match': `"${version}"` } })

export const grantRole = (id: string, input: { journalCode: string; role: GrantableRole; reason: string }) => platformApi.post<StaffDetail>(`${base(id)}/roles`, input)
export const revokeRole = (id: string, roleGrantId: string, reason: string) => platformApi.post<StaffDetail>(`${base(id)}/roles/${encodeURIComponent(roleGrantId)}/revoke`, { reason })
export const setSuperAdmin = (id: string, grant: boolean, reason: string) => platformApi.post<StaffDetail>(`${base(id)}/super-admin`, { grant, reason })
export const disableStaff = (id: string, reason: string) => platformApi.post<StaffDetail>(`${base(id)}/disable`, { reason })
export const enableStaff = (id: string, reason: string) => platformApi.post<StaffDetail>(`${base(id)}/enable`, { reason })
export const resendInvite = (id: string) => platformApi.post<StaffDetail>(`${base(id)}/resend-invite`)
export const revokeStaffSessions = (id: string, reason: string) => platformApi.post<{ revokedSessions: number }>(`${base(id)}/revoke-sessions`, { reason })
export const forcePasswordReset = (id: string, reason: string) => platformApi.post<StaffDetail>(`${base(id)}/force-password-reset`, { reason })
export const resetStaffMfa = (id: string, reason: string) => platformApi.post<void>(`${base(id)}/mfa/reset`, { reason })
