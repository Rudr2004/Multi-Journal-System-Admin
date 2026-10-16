import type { StaffUser } from '@/shared/types'
import { DEMO_PASSWORD } from '../data/core'
import { useDataStore } from '../store'
import { useCredentials } from '../stores/credentials'
import { ApiError, delay } from './latency'

export const passwordOf = (userId: string) => useCredentials.getState().passwords[userId] ?? DEMO_PASSWORD

/**
 * The account status is checked on every sign-in, after the password is verified. A suspended or deactivated
 * account is refused even if the password was just reset or changed.
 */
export async function login(email: string, password: string): Promise<{ user: StaffUser; needsTwoStep: boolean }> {
  await delay(null)
  const user = useDataStore.getState().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  if (!user || password !== passwordOf(user.id)) throw new ApiError('Email or password is incorrect.', 'invalid_credentials')
  if (user.status === 'suspended' || user.status === 'deactivated') {
    throw new ApiError(
      user.status === 'suspended'
        ? 'Your account has been suspended. Resetting your password does not restore access. Contact a Super Admin.'
        : 'Your account has been deactivated. Contact a Super Admin.',
      'inactive',
    )
  }
  return { user, needsTwoStep: user.twoStep }
}

/** Prototype accepts any 6-digit code. */
export async function verifyTwoStep(code: string): Promise<void> {
  await delay(null, 300, 500)
  if (!/^\d{6}$/.test(code)) throw new ApiError('Enter the 6-digit code from your authenticator app.', 'invalid_code')
}

/**
 * "Forgot password": returns a one-time link token only when the email belongs to a staff account (the screen shows the
 * same message either way). Suspended accounts can reset a password, but they still cannot sign in.
 */
export async function requestPasswordReset(email: string): Promise<{ token?: string }> {
  await delay(null)
  const user = useDataStore.getState().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  if (!user) return {}
  const token = `reset-${Math.random().toString(36).slice(2, 10)}`
  const c = useCredentials.getState()
  c.patch({ resetTokens: { ...c.resetTokens, [token]: user.id } })
  return { token }
}

export async function setPassword(token: string, password: string): Promise<void> {
  await delay(null)
  const c = useCredentials.getState()
  const userId = c.resetTokens[token]
  if (token.startsWith('reset-') && !userId) throw new ApiError('This reset link has expired or was already used. Request a new one.', 'invalid_token')
  if (!userId) return // invitation links: the prototype keeps the shared demo password
  const { [token]: _used, ...rest } = c.resetTokens
  void _used
  c.patch({ passwords: { ...c.passwords, [userId]: password }, resetTokens: rest })
}
