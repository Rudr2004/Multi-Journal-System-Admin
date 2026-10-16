import type { StaffUser } from '@/shared/types'
import { currentActor, recordAudit, sendMessage } from '../actions'
import { useDataStore, useSession } from '../store'
import { useCredentials } from '../stores/credentials'
import { passwordOf } from './auth'
import { ApiError, delay } from './latency'

export const PASSWORD_RULE = /^(?=.*\d).{8,}$/
export const PASSWORD_HINT = 'At least 8 characters, with at least one number.'

const me = () => {
  const id = useSession.getState().userId
  const u = useDataStore.getState().users.find((x) => x.id === id)
  if (!u) throw new ApiError('You are signed out.', 'unauthenticated')
  return u
}
const firstJournal = (u: StaffUser) => (Object.keys(u.assignments)[0] as keyof StaffUser['assignments'] | undefined) ?? 'IJMAT'

const setUser = (id: string, patch: Partial<StaffUser>) => {
  const { users, patch: set } = useDataStore.getState()
  set({ users: users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })
}

/** Update the signed-in person's own details. The registered email can only be changed by a Super Admin. */
export async function updateProfile(input: { name: string; title: string; phone: string }) {
  await delay(null, 300, 600)
  const u = me()
  const name = input.name.trim()
  if (name.length < 3) throw new ApiError('Enter your full name.', 'invalid')
  setUser(u.id, { name, title: input.title.trim(), phone: input.phone.trim() || undefined })
  recordAudit({ journal: 'ALL', action: 'Profile updated', target: name, oldValue: `${u.name} · ${u.title} · ${u.phone ?? 'no phone'}`, newValue: `${name} · ${input.title.trim()} · ${input.phone.trim() || 'no phone'}` })
}

export async function setProfilePhoto(photo: string | null) {
  await delay(null, 200, 450)
  const u = me()
  setUser(u.id, { photo: photo ?? undefined })
  recordAudit({ journal: 'ALL', action: photo ? 'Profile photo changed' : 'Profile photo removed', target: u.name })
}

/* ---------- password change with email verification ---------- */

const codes = new Map<string, { code: string; expires: number }>()

/** Emails a 6-digit code to the registered address. The prototype returns the code so it can be shown on screen. */
export async function sendVerificationCode(): Promise<{ code: string; maskedEmail: string }> {
  await delay(null, 300, 600)
  const u = me()
  const code = String(Math.floor(100000 + Math.random() * 900000))
  codes.set(u.id, { code, expires: Date.now() + 10 * 60_000 })
  sendMessage({ journal: firstJournal(u), recipient: u.email, channel: 'email', template: 'Password change verification code' })
  const [local, domain] = u.email.split('@')
  return { code, maskedEmail: `${local[0]}${'*'.repeat(Math.max(2, local.length - 2))}${local.slice(-1)}@${domain}` }
}

export async function changeOwnPassword(input: { current: string; next: string; code: string }) {
  await delay(null, 400, 800)
  const u = me()
  if (input.current !== passwordOf(u.id)) throw new ApiError('Your current password is incorrect.', 'invalid_credentials')
  if (!PASSWORD_RULE.test(input.next)) throw new ApiError(PASSWORD_HINT, 'weak_password')
  if (input.next === input.current) throw new ApiError('Choose a password you have not used just now.', 'same_password')
  const entry = codes.get(u.id)
  if (!entry || entry.expires < Date.now()) throw new ApiError('Request a new verification code. The last one expired.', 'code_expired')
  if (entry.code !== input.code.trim()) throw new ApiError('That verification code is not correct.', 'invalid_code')
  codes.delete(u.id)
  const c = useCredentials.getState()
  c.patch({ passwords: { ...c.passwords, [u.id]: input.next } })
  sendMessage({ journal: firstJournal(u), recipient: u.email, channel: 'email', template: 'Password changed' })
  recordAudit({ journal: 'ALL', action: 'Password changed', target: u.name, newValue: 'Changed by the user, verified by email code' })
}

/**
 * A Super Admin sets a new password for any user without telling them: no email or alert is sent and the user is not
 * signed out. It never changes the account status, so a suspended user stays suspended. Always recorded in the audit log.
 */
export async function adminSetUserPassword(userId: string, password: string) {
  await delay(null, 350, 700)
  const actor = me()
  if (!Object.values(actor.assignments).includes('super_admin')) throw new ApiError('Only a Super Admin can change another person’s password.', 'forbidden')
  const target = useDataStore.getState().users.find((u) => u.id === userId)
  if (!target) throw new ApiError('User not found.', 'not_found')
  if (!PASSWORD_RULE.test(password)) throw new ApiError(PASSWORD_HINT, 'weak_password')
  const c = useCredentials.getState()
  c.patch({ passwords: { ...c.passwords, [userId]: password } })
  recordAudit({ journal: 'ALL', action: 'Password changed by Super Admin (user not notified)', target: target.name, actor: currentActor(), newValue: 'Password replaced; no email sent to the user' })
}
