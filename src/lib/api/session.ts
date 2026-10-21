import { applyMe, clearMe, useSession } from '@/mock/store'
import { MOCK_DATA } from '@/mock/mode'
import { endDemoSession, restoreDemoSession } from '@/mock/demoLogin'
import { fetchMe, logoutAllRequest, logoutRequest } from './auth'
import { isApiError } from './errors'
import { clearAccessToken, refreshAccessToken, setAccessToken, setRolesChangedHandler, setSessionEndedHandler } from './http'
import type { SessionGrant } from './types'

/** Ties the HTTP client's token to the session store. The token itself never leaves `./http` (memory only). */

setSessionEndedHandler((reason) => {
  // A person who was never signed in has nothing to be told about.
  const wasSignedIn = useSession.getState().authStatus === 'authenticated'
  clearMe(wasSignedIn ? reason : null)
})

// The new token already carries the new roles; the menus and permission checks follow once `me` is read again.
setRolesChangedHandler(() => { void reloadMe().catch(() => undefined) })

/** After login / second step / forced two-step setup. */
export function startSession(grant: SessionGrant) {
  setAccessToken(grant.accessToken, grant.expiresIn)
  applyMe(grant.user)
}

/** Reads `/auth/me` again (after the person changed their own password or two-step setting). */
export async function reloadMe() {
  applyMe(await fetchMe())
}

let restoring: Promise<void> | null = null

/** On page load: the refresh cookie gives a new access token, then the person is read. Runs once per page load. */
export function restoreSession(): Promise<void> {
  restoring ??= (async () => {
    // VITE_DEV_MODE=local: a demo account chosen on the sign-in page stays signed in across reloads (no backend needed).
    if (MOCK_DATA && restoreDemoSession()) return
    try {
      await refreshAccessToken()
      await reloadMe()
    } catch (e) {
      clearAccessToken()
      clearMe(isApiError(e) && e.code === 'NETWORK_ERROR' ? 'unreachable' : null)
    }
  })()
  return restoring
}

async function end(request: () => Promise<void>) {
  endDemoSession()
  try { await request() } catch { /* the cookie may already be gone; the local session ends either way */ }
  clearAccessToken()
  clearMe()
}

/** Ends this browser's session. */
export const signOut = () => end(logoutRequest)

/** Ends every session of the person, on every device. */
export const signOutEverywhere = () => end(logoutAllRequest)
