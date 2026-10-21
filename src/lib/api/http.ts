import { ApiError, SESSION_ENDING_CODES } from './errors'

/**
 * Typed HTTP client for the platform API (and, with the same bearer token, the journal APIs).
 *
 * - The access token lives in memory only. The refresh cookie is HttpOnly: requests send `credentials: 'include'` and
 *   `X-Requested-With`, which the API demands on the cookie routes.
 * - One refresh at a time (several parallel 401s share one request; Web Locks serialise tabs), because two refreshes
 *   with the same cookie look like a stolen token and end the session.
 * - AUTH_REQUIRED / TOKEN_STALE: refresh once and retry once. A second 401, SESSION_REVOKED or REFRESH_* ends the session.
 */

const DEFAULT_PLATFORM_URL = 'http://localhost:3000'
const API_PREFIX = '/api/v1'
const REFRESH_MARGIN_SECONDS = 60

/** `VITE_PLATFORM_API_URL` is the server origin (no path); the `/api/v1` prefix is added here. */
export const PLATFORM_API_BASE = `${(import.meta.env.VITE_PLATFORM_API_URL || DEFAULT_PLATFORM_URL).replace(/\/+$/, '')}${API_PREFIX}`

/* ---------- token and session-end hook ---------- */

let accessToken: string | null = null
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let inFlightRefresh: Promise<void> | null = null
let onSessionEnded: ((reason: SessionEndReason) => void) | undefined
let onRolesChanged: (() => void) | undefined

export type SessionEndReason = 'revoked' | 'expired'

export const getAccessToken = () => accessToken

/** Stores the token and schedules a refresh shortly before it expires. */
export function setAccessToken(token: string, expiresInSeconds: number) {
  accessToken = token
  clearTimeout(refreshTimer)
  const wait = Math.max(5, expiresInSeconds - REFRESH_MARGIN_SECONDS) * 1000
  refreshTimer = setTimeout(() => { void refreshAccessToken().catch(() => undefined) }, wait)
}

export function clearAccessToken() {
  accessToken = null
  clearTimeout(refreshTimer)
}

/** Registered once by the session service; called when the person has to sign in again. */
export function setSessionEndedHandler(handler: (reason: SessionEndReason) => void) {
  onSessionEnded = handler
}

/** Registered once by the session service; called after a TOKEN_STALE refresh, when the person's roles changed and `/auth/me` must be read again. */
export function setRolesChangedHandler(handler: () => void) {
  onRolesChanged = handler
}

function endSession(reason: SessionEndReason) {
  clearAccessToken()
  onSessionEnded?.(reason)
}

/* ---------- requests ---------- */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Send the bearer token and recover from 401 (default true). Login, reset and similar public routes pass false. */
  auth?: boolean
}

interface ErrorBody { error?: { code?: unknown; message?: unknown; details?: unknown }; requestId?: unknown }

async function toApiError(res: Response): Promise<ApiError> {
  let body: ErrorBody = {}
  try { body = (await res.json()) as ErrorBody } catch { /* not JSON */ }
  const e = body.error ?? {}
  const details = e.details && typeof e.details === 'object' ? (e.details as Record<string, unknown>) : {}
  return new ApiError(
    res.status,
    typeof e.code === 'string' ? e.code : `HTTP_${res.status}`,
    typeof e.message === 'string' ? e.message : `The server answered ${res.status}.`,
    details,
    typeof body.requestId === 'string' ? body.requestId : undefined,
  )
}

function buildUrl(base: string, path: string, query: RequestOptions['query']): string {
  const url = new URL(`${base}${path}`)
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  return url.toString()
}

async function send(base: string, path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...opts.headers }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`
  try {
    return await fetch(buildUrl(base, path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: 'include',
      signal: opts.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached.')
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  try { return (await res.json()) as T } catch { throw new ApiError(res.status, 'INVALID_RESPONSE', 'The server sent an unreadable answer.') }
}

async function execute<T>(base: string, path: string, opts: RequestOptions, retried: boolean): Promise<T> {
  const res = await send(base, path, opts)
  if (res.ok) return parse<T>(res)
  const error = await toApiError(res)
  if (opts.auth === false || res.status !== 401) throw error

  if (SESSION_ENDING_CODES.includes(error.code)) {
    endSession(error.code === 'REFRESH_EXPIRED' ? 'expired' : 'revoked')
    throw error
  }
  if (error.code === 'AUTH_REQUIRED' || error.code === 'TOKEN_STALE') {
    if (retried) {
      // A second TOKEN_STALE is treated as SESSION_REVOKED: never loop.
      endSession('revoked')
      throw error
    }
    await refreshAccessToken()
    // `/auth/me` is what the handler reads, so it must not trigger itself.
    if (error.code === 'TOKEN_STALE' && path !== '/auth/me') onRolesChanged?.()
    return execute<T>(base, path, opts, true)
  }
  throw error
}

/** Rotates the refresh cookie and stores the new access token. Parallel callers share one request. */
export function refreshAccessToken(): Promise<void> {
  inFlightRefresh ??= runExclusive(async () => {
    const res = await send(PLATFORM_API_BASE, '/auth/refresh', { method: 'POST', auth: false })
    if (!res.ok) {
      const error = await toApiError(res)
      // Only a definitive answer ends the session; a network failure may be temporary.
      if (res.status === 401) endSession(error.code === 'REFRESH_EXPIRED' ? 'expired' : 'revoked')
      throw error
    }
    const data = await parse<{ accessToken: string; expiresIn: number }>(res)
    setAccessToken(data.accessToken, data.expiresIn)
  }).finally(() => { inFlightRefresh = null })
  return inFlightRefresh
}

/** Browser tabs share the cookie, so refreshes are also serialised across tabs when Web Locks exist. */
function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('amjs-admin-refresh', task) : task()
}

export interface ApiClient {
  get<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
  patch<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>
}

/** A client for one API base URL. All clients share the in-memory token, so a journal API can be called with the same bearer. */
export function createApiClient(base: string): ApiClient {
  return {
    get: (path, opts) => execute(base, path, { ...opts, method: 'GET' }, false),
    post: (path, body, opts) => execute(base, path, { ...opts, method: 'POST', body }, false),
    patch: (path, body, opts) => execute(base, path, { ...opts, method: 'PATCH', body }, false),
  }
}

export const platformApi = createApiClient(PLATFORM_API_BASE)
