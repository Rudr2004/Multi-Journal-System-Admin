import type { StaffUser } from '@/shared/types'
import { DEMO_PASSWORD } from '../data/core'
import { useDataStore } from '../store'
import { ApiError, delay } from './latency'

export async function login(email: string, password: string): Promise<{ user: StaffUser; needsTwoStep: boolean }> {
  await delay(null)
  const user = useDataStore.getState().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  if (!user || password !== DEMO_PASSWORD) throw new ApiError('Email or password is incorrect.', 'invalid_credentials')
  if (user.status === 'suspended' || user.status === 'deactivated') throw new ApiError('This account is not active. Contact a Super Admin.', 'inactive')
  return { user, needsTwoStep: user.twoStep }
}

/** Prototype accepts any 6-digit code. */
export async function verifyTwoStep(code: string): Promise<void> {
  await delay(null, 300, 500)
  if (!/^\d{6}$/.test(code)) throw new ApiError('Enter the 6-digit code from your authenticator app.', 'invalid_code')
}

export async function requestPasswordReset(email: string): Promise<void> {
  await delay(email)
}

export async function setPassword(token: string, password: string): Promise<void> {
  await delay({ token, password })
}
