/** Error codes the platform API documents (docs/ADMIN-INTEGRATION.md). Unknown codes still arrive as plain strings. */
export type ApiErrorCode =
  | 'INVALID_CREDENTIALS' | 'CAPTCHA_REQUIRED' | 'CAPTCHA_INVALID' | 'ACCOUNT_LOCKED' | 'RATE_LIMITED' | 'ACCOUNT_DISABLED'
  | 'AUTH_REQUIRED' | 'TOKEN_STALE' | 'SESSION_REVOKED' | 'REFRESH_INVALID' | 'REFRESH_EXPIRED' | 'REFRESH_REUSED'
  | 'INVALID_TOKEN' | 'VALIDATION_ERROR' | 'CURRENT_PASSWORD_INVALID' | 'CSRF_REJECTED' | 'FORBIDDEN'
  | 'MFA_CODE_INVALID' | 'MFA_TOKEN_INVALID' | 'MFA_ALREADY_ENABLED' | 'MFA_SETUP_NOT_STARTED' | 'MFA_REQUIRED_FOR_ROLE' | 'FEATURE_DISABLED'
  | 'STAFF_EXISTS' | 'CANNOT_ACT_ON_SELF' | 'LAST_SUPER_ADMIN' | 'ROLE_ALREADY_GRANTED' | 'ROLE_NOT_ACTIVE' | 'STAFF_STATE_INVALID'
  | 'STAFF_NOT_FOUND' | 'JOURNAL_NOT_FOUND' | 'PRECONDITION_FAILED' | 'PRECONDITION_REQUIRED'
  | 'NETWORK_ERROR' | 'INVALID_RESPONSE'

/** Codes after which the session cannot continue: the person must sign in again. */
export const SESSION_ENDING_CODES: readonly string[] = ['SESSION_REVOKED', 'REFRESH_INVALID', 'REFRESH_EXPIRED', 'REFRESH_REUSED']

/** `{ error: { code, message, details }, requestId }` as an exception. `status` is 0 when the server could not be reached. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | (string & {}),
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  is(...codes: ApiErrorCode[]): boolean {
    return codes.includes(this.code as ApiErrorCode)
  }

  /** First message per field of a VALIDATION_ERROR (`details.fields.<path>` is a list of messages; a bare string is accepted too). */
  get fieldErrors(): Record<string, string> {
    const raw = this.details.fields
    if (!raw || typeof raw !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [path, value] of Object.entries(raw)) {
      const first = Array.isArray(value) ? value[0] : value
      if (typeof first === 'string') out[path] = first
    }
    return out
  }

  /** Seconds until an ACCOUNT_LOCKED account can try again. */
  get retryAfterSeconds(): number | undefined {
    const n = this.details.retryAfterSeconds
    return typeof n === 'number' ? n : undefined
  }

  detail<T>(key: string): T | undefined {
    return this.details[key] as T | undefined
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

/** A sentence that is safe to show for any thrown value. */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (isApiError(e)) return e.code === 'NETWORK_ERROR' ? 'The server could not be reached. Check your connection and try again.' : e.message
  return e instanceof Error && e.message ? e.message : fallback
}
