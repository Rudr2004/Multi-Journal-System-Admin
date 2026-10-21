import type { Role, UserStatus } from '@/shared/types'

/** Roles that can be granted in a journal (Super Admin is a separate flag). */
export type GrantableRole = Exclude<Role, 'SUPER_ADMIN'>
export const GRANTABLE_ROLES: readonly GrantableRole[] = ['EDITOR', 'ASSOCIATE_EDITOR', 'REVIEWER', 'REVIEW_PANEL_MEMBER', 'SUPPORT_EXECUTIVE']

/** `user` of the login answer and `GET /auth/me`. */
export interface Me {
  id: string
  email: string
  fullName: string
  phone: string | null
  status: UserStatus
  isSuperAdmin: boolean
  mustChangePassword: boolean
  twoStepEnabled: boolean
  /** True for a Super Admin while two-step login is switched on. Absent on older servers. */
  twoStepRequired?: boolean
  journals: MeJournal[]
  flags: { reviewPanel: boolean }
}

export interface MeJournal {
  code: string
  name: string
  /** Several roles per journal are possible. SUPER_ADMIN is never listed here (see `isSuperAdmin`). */
  roles: Role[]
  permissions: string[]
}

export interface SessionGrant {
  accessToken: string
  expiresIn: number
  user: Me
}

/** What the login (and the second step) can answer. */
export type LoginOutcome =
  | { kind: 'session'; session: SessionGrant }
  | { kind: 'mfa'; mfaToken: string }
  | { kind: 'mfaSetup'; mfaToken: string }

export interface MfaSetup {
  otpauthUrl: string
  qrDataUrl: string
}

export interface MfaEnabled {
  recoveryCodes: string[]
  /** Only when the setup was forced at sign-in: the session the person was waiting for. */
  session?: SessionGrant
}

/* ---------- staff management ---------- */

export interface RoleGrant {
  /** Use it to revoke the grant. */
  id: string
  role: Role
  grantedAt: string
  grantReason: string | null
}

export interface JournalRoles {
  journalCode: string
  journalName: string
  roles: RoleGrant[]
}

export interface StaffItem {
  id: string
  email: string
  fullName: string
  phone: string | null
  status: UserStatus
  isSuperAdmin: boolean
  twoStepEnabled: boolean
  lastLoginAt: string | null
  createdAt: string
  /** Sent back as `If-Match` when editing. */
  version: number
  journals: JournalRoles[]
}

export interface StaffDetail extends StaffItem {
  mustChangePassword: boolean
  rolesVersion: number
  disabledAt: string | null
  disabledReason: string | null
  lockedUntil: string | null
  activeSessions: number
  createdById: string | null
}

export interface StaffPage {
  items: StaffItem[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface StaffSession {
  id: string
  device: string
  createdAt: string
  lastUsedAt: string
  idleExpiresAt: string
  absoluteExpiresAt: string
}

export interface StaffQuery {
  page?: number
  limit?: number
  journalCode?: string
  role?: GrantableRole
  status?: UserStatus
  q?: string
}

export interface InviteInput {
  email: string
  fullName: string
  phone?: string
  roles: { journalCode: string; role: GrantableRole }[]
}
