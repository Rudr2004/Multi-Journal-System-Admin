/**
 * Demo sign-in for `VITE_DEV_MODE=local`: the prototype's demo accounts sign in without a backend, so every mock screen can be explored.
 * Never used in `prod` (see ./mode). The chosen account is remembered for the browser tab so a page reload keeps the session.
 */
import type { Me } from '@/lib/api/types'
import type { StaffUser } from '@/shared/types'
import { applyMe } from './store'
import { SEED_USERS } from './data/core'

const KEY = 'journal-admin-demo-user'
export const DEMO_PASSWORD = 'demo'

export const demoUsers = (): StaffUser[] => SEED_USERS.filter((u) => u.status === 'ACTIVE')

function toMe(u: StaffUser): Me {
  const isSuperAdmin = Object.values(u.assignments).includes('SUPER_ADMIN')
  return {
    id: u.id, email: u.email, fullName: u.name, phone: u.phone ?? null, status: u.status, isSuperAdmin,
    mustChangePassword: false, twoStepEnabled: false,
    journals: Object.entries(u.assignments).map(([code, role]) => ({ code, name: code, roles: role === 'SUPER_ADMIN' ? [] : [role!], permissions: [] })),
    flags: { reviewPanel: true },
  }
}

export function startDemoSession(userId: string): boolean {
  const u = SEED_USERS.find((x) => x.id === userId)
  if (!u) return false
  try { sessionStorage.setItem(KEY, userId) } catch { /* storage unavailable: the session lasts until reload */ }
  applyMe(toMe(u))
  return true
}

/** True when a demo session was restored for this tab. */
export function restoreDemoSession(): boolean {
  try {
    const id = sessionStorage.getItem(KEY)
    return id ? startDemoSession(id) : false
  } catch { return false }
}

export const endDemoSession = () => { try { sessionStorage.removeItem(KEY) } catch { /* ignore */ } }
