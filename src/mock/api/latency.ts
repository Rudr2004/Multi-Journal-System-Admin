import { useDataStore, useSession } from '../store'

export class ApiError extends Error {
  constructor(message: string, public code = 'error') {
    super(message)
  }
}

/** A signed-in person whose account was suspended or deactivated must not reach any dashboard API. */
const accountBlocked = () => {
  const id = useSession.getState().userId
  if (!id) return false
  const u = useDataStore.getState().users.find((x) => x.id === id)
  return !!u && (u.status === 'suspended' || u.status === 'deactivated')
}

/** Simulates network latency (300–800 ms). Real API client replaces this via VITE_API_BASE_URL. */
export const delay = <T,>(value: T, min = 300, max = 800): Promise<T> =>
  new Promise((resolve, reject) =>
    setTimeout(() => {
      if (accountBlocked()) reject(new ApiError('Your account is suspended. Contact a Super Admin.', 'account_suspended'))
      else resolve(value)
    }, min + Math.random() * (max - min)),
  )
