import { recordAudit } from '../actions'
import { useDataStore, useSession } from '../store'
import { ApiError, delay } from './latency'

/**
 * Profile photo, kept in memory for the browser session: the platform API has no photo field yet (`GET /auth/me` has none).
 * Everything else about the account (details, password, two-step sign-in) is real and lives in `@/lib/api`.
 */
export async function setProfilePhoto(photo: string | null) {
  await delay(null, 200, 450)
  const { users, patch } = useDataStore.getState()
  const id = useSession.getState().userId
  const user = users.find((u) => u.id === id)
  if (!user) throw new ApiError('You are signed out.', 'unauthenticated')
  patch({ users: users.map((u) => (u.id === id ? { ...u, photo: photo ?? undefined } : u)) })
  recordAudit({ journal: 'ALL', action: photo ? 'Profile photo changed' : 'Profile photo removed', target: user.name })
}
