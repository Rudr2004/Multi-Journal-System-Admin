import type { AuditEntry, JournalCode, Role, StaffUser, UserStatus } from '@/shared/types'
import { ROLE_META } from '@/permissions/roles'
import { JOURNAL_CODES, DEMO_USER_LABELS } from '../data/core'
import { recordAudit, sendMessage, currentActor } from '../actions'
import { useDataStore } from '../store'
import { useAdminStore, type InviteMeta } from '../stores/admin'
import { activityForUser } from './audit'
import { ApiError, delay } from './latency'

export type Assignments = Partial<Record<JournalCode, Role>>

/** "IJMAT: Journal Editor" lines used in audit entries and the UI. */
export function assignmentLines(a: Assignments): string {
  const lines = JOURNAL_CODES.filter((c) => a[c]).map((c) => `${c}: ${ROLE_META[a[c]!].label}`)
  return lines.length ? lines.join('\n') : 'No access'
}

const cleanAssignments = (a: Assignments): Assignments => Object.fromEntries(Object.entries(a).filter(([, r]) => !!r)) as Assignments

const isSuper = (u: StaffUser) => Object.values(u.assignments).includes('super_admin')
const activeSupers = (users: StaffUser[]) => users.filter((u) => u.status === 'active' && isSuper(u))

export interface UserRow extends StaffUser {
  lastActive?: string
  invite?: InviteMeta
}

const decorate = (u: StaffUser): UserRow => {
  const { lastActive, invites } = useAdminStore.getState()
  return { ...u, lastActive: lastActive[u.id], invite: invites[u.id] }
}

export async function listUsers(): Promise<UserRow[]> {
  await delay(null, 300, 600)
  return useDataStore.getState().users.map(decorate)
}

export async function getUser(id: string): Promise<{ user: UserRow; activity: AuditEntry[] }> {
  await delay(null, 250, 500)
  const u = useDataStore.getState().users.find((x) => x.id === id)
  if (!u) throw new ApiError('This user does not exist or was removed.', 'not_found')
  return { user: decorate(u), activity: activityForUser(u.name).slice(0, 40) }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const rand = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
const basePath = () => import.meta.env.BASE_URL.replace(/\/$/, '')
export const setPasswordLink = (token: string) => `${window.location.origin}${basePath()}/set-password?token=${token}`

export interface InviteInput { name: string; email: string; title: string; assignments: Assignments }

export async function inviteUser(input: InviteInput): Promise<{ user: StaffUser; link: string }> {
  await delay(null, 500, 900)
  const { users, patch } = useDataStore.getState()
  const email = input.email.trim().toLowerCase()
  if (users.some((u) => u.email.toLowerCase() === email)) throw new ApiError('A user with this email already exists.', 'duplicate')
  const assignments = cleanAssignments(input.assignments)
  if (Object.keys(assignments).length === 0) throw new ApiError('Give the user a role in at least one journal.', 'no_roles')

  let id = `u-${slug(input.name) || 'user'}`
  while (users.some((u) => u.id === id)) id += '-2'
  // The prototype signs invited people in straight away (password "demo"): status is active, the invitation is tracked in the admin store.
  const user: StaffUser = { id, name: input.name.trim(), email, title: input.title.trim() || 'Staff', status: 'active', twoStep: false, assignments }
  patch({ users: [...users, user] })

  const token = `invite-${rand()}`
  const link = setPasswordLink(token)
  const admin = useAdminStore.getState()
  const summary = Object.entries(assignments).map(([c, r]) => `${c} ${ROLE_META[r!].short}`).join(', ')
  DEMO_USER_LABELS[id] = `Invited — ${summary}`
  admin.patch({
    invites: { ...admin.invites, [id]: { invitedAt: new Date().toISOString(), invitedBy: currentActor(), token, link } },
    addedLabels: [...admin.addedLabels, id],
  })
  const first = Object.keys(assignments)[0] as JournalCode
  sendMessage({ journal: first, recipient: email, channel: 'email', template: 'Staff invitation' })
  recordAudit({ journal: Object.keys(assignments).length === 1 ? first : 'ALL', action: 'User invited', target: user.name, newValue: assignmentLines(assignments) })
  return { user, link }
}

export async function updateAssignments(id: string, next: Assignments): Promise<void> {
  await delay(null, 350, 700)
  const { users, patch } = useDataStore.getState()
  const u = users.find((x) => x.id === id)
  if (!u) throw new ApiError('User not found.', 'not_found')
  const assignments = cleanAssignments(next)
  if (Object.keys(assignments).length === 0) throw new ApiError('A user needs a role in at least one journal. Deactivate the account instead to remove all access.', 'no_roles')
  if (isSuper(u) && !Object.values(assignments).includes('super_admin') && activeSupers(users).length <= 1)
    throw new ApiError('This is the last Super Admin. Promote someone else first.', 'last_super_admin')
  patch({ users: users.map((x) => (x.id === id ? { ...x, assignments } : x)) })
  const changed = JOURNAL_CODES.filter((c) => u.assignments[c] !== assignments[c])
  const line = (a: Assignments) => changed.map((c) => `${c}: ${a[c] ? ROLE_META[a[c]!].label : 'No access'}`).join('\n')
  recordAudit({ journal: changed.length === 1 ? changed[0] : 'ALL', action: 'Role changed', target: u.name, oldValue: line(u.assignments), newValue: line(assignments) })
}

export type StatusAction = 'suspend' | 'reactivate' | 'deactivate'
const NEXT: Record<StatusAction, UserStatus> = { suspend: 'suspended', reactivate: 'active', deactivate: 'deactivated' }
const AUDIT: Record<StatusAction, string> = { suspend: 'User suspended', reactivate: 'User reactivated', deactivate: 'User deactivated' }

export async function changeUserStatus(id: string, action: StatusAction): Promise<void> {
  await delay(null, 300, 650)
  const { users, patch } = useDataStore.getState()
  const u = users.find((x) => x.id === id)
  if (!u) throw new ApiError('User not found.', 'not_found')
  if (action !== 'reactivate') {
    if (u.name === currentActor()) throw new ApiError('You cannot suspend or deactivate your own account.', 'self')
    if (isSuper(u) && u.status === 'active' && activeSupers(users).length <= 1) throw new ApiError('This is the last active Super Admin.', 'last_super_admin')
  }
  patch({ users: users.map((x) => (x.id === id ? { ...x, status: NEXT[action] } : x)) })
  recordAudit({ journal: 'ALL', action: AUDIT[action], target: u.name, oldValue: u.status, newValue: NEXT[action] })
}

/** Invalidate sessions, clear 2-step enrolment and issue a new set-password link. */
export async function resetUserAccess(id: string): Promise<{ link: string }> {
  await delay(null, 400, 800)
  const { users, patch } = useDataStore.getState()
  const u = users.find((x) => x.id === id)
  if (!u) throw new ApiError('User not found.', 'not_found')
  const token = `reset-${rand()}`
  const link = setPasswordLink(token)
  patch({ users: users.map((x) => (x.id === id ? { ...x, twoStep: false } : x)) })
  const admin = useAdminStore.getState()
  admin.patch({ accessReset: { ...admin.accessReset, [id]: new Date().toISOString() } })
  const first = (Object.keys(u.assignments)[0] as JournalCode | undefined) ?? 'IJMAT'
  sendMessage({ journal: first, recipient: u.email, channel: 'email', template: 'Access reset link' })
  recordAudit({ journal: 'ALL', action: 'User access reset', target: u.name, oldValue: u.twoStep ? '2-step: on' : '2-step: off', newValue: '2-step: re-enrol on next sign-in\nPassword: reset link sent' })
  return { link }
}

export async function resendInvitation(id: string): Promise<{ link: string }> {
  await delay(null, 300, 600)
  const { users } = useDataStore.getState()
  const u = users.find((x) => x.id === id)
  const admin = useAdminStore.getState()
  const inv = admin.invites[id]
  if (!u || !inv) throw new ApiError('No pending invitation for this user.', 'not_found')
  const first = (Object.keys(u.assignments)[0] as JournalCode | undefined) ?? 'IJMAT'
  sendMessage({ journal: first, recipient: u.email, channel: 'email', template: 'Staff invitation (reminder)' })
  recordAudit({ journal: 'ALL', action: 'User invitation resent', target: u.name })
  return { link: inv.link }
}
