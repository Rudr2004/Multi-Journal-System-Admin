import { platformApi } from './http'
import type { LoginOutcome, Me, MfaEnabled, MfaSetup, SessionGrant } from './types'

/** Raw `/auth` endpoints. Session handling (token, stores) lives in `./session`. */

type LoginAnswer = Partial<SessionGrant> & { mfaRequired?: true; mfaSetupRequired?: true; mfaToken?: string }

function outcomeOf(a: LoginAnswer): LoginOutcome {
  if (a.mfaRequired && a.mfaToken) return { kind: 'mfa', mfaToken: a.mfaToken }
  if (a.mfaSetupRequired && a.mfaToken) return { kind: 'mfaSetup', mfaToken: a.mfaToken }
  return { kind: 'session', session: a as SessionGrant }
}

export async function login(input: { email: string; password: string; captchaToken?: string }): Promise<LoginOutcome> {
  return outcomeOf(await platformApi.post<LoginAnswer>('/auth/login', input, { auth: false }))
}

/** Second step of a two-step login: a 6-digit code or a recovery code. */
export async function verifyMfa(input: { mfaToken: string; code?: string; recoveryCode?: string }): Promise<SessionGrant> {
  return platformApi.post<SessionGrant>('/auth/mfa/verify', input, { auth: false })
}

export const fetchMe = () => platformApi.get<Me>('/auth/me')

export const logoutRequest = () => platformApi.post<void>('/auth/logout', undefined, { auth: false })
export const logoutAllRequest = () => platformApi.post<void>('/auth/logout-all', undefined, { auth: false })

export const requestPasswordReset = (email: string) => platformApi.post<{ accepted: true }>('/auth/password/forgot', { email }, { auth: false })
export const resetPassword = (input: { token: string; newPassword: string }) => platformApi.post<void>('/auth/password/reset', input, { auth: false })
export const acceptInvite = (input: { token: string; password: string; fullName?: string }) => platformApi.post<{ accepted: true }>('/auth/invite/accept', input, { auth: false })
export const changePassword = (input: { currentPassword: string; newPassword: string }) => platformApi.post<void>('/auth/password/change', input)

/** With `mfaToken` (a Super Admin who must set up at sign-in) no bearer exists yet; otherwise the signed-in person sets up. */
export const startMfaSetup = (mfaToken?: string) =>
  platformApi.post<MfaSetup>('/auth/mfa/setup', mfaToken ? { mfaToken } : {}, { auth: !mfaToken })

export async function enableMfa(input: { code: string; mfaToken?: string }): Promise<MfaEnabled> {
  const a = await platformApi.post<{ recoveryCodes: string[] } & Partial<SessionGrant>>('/auth/mfa/enable', input, { auth: !input.mfaToken })
  return { recoveryCodes: a.recoveryCodes, session: a.accessToken && a.user && a.expiresIn ? { accessToken: a.accessToken, expiresIn: a.expiresIn, user: a.user } : undefined }
}

export const disableMfa = (input: { password: string; code: string }) => platformApi.post<void>('/auth/mfa/disable', input)
