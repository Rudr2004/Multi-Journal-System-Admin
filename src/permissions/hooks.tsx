import { useEffect, useMemo, type ReactNode } from 'react'
import { useDataStore, useSession } from '@/mock/store'
import type { JournalCode, JournalScope, Role, StaffUser } from '@/shared/types'
import { JOURNAL_CODES } from '@/mock/data/core'
import type { Me } from '@/lib/api/types'
import type { FeatureFlags } from './features'
import { ROLE_FLAG } from './features'
import { LEVEL_LABEL, LEVEL_RANK, levelForRoles, type Area, type Level } from './matrix'
import { permissionsOf, rolesInJournal } from './me'
import { ROLE_META } from './roles'

function roleEnabled(role: Role | undefined, flags: FeatureFlags): Role | undefined {
  if (!role) return undefined
  const flag = ROLE_FLAG[role]
  return flag && !flags[flag] ? undefined : role
}

export function assignedJournals(user: StaffUser | undefined, flags: FeatureFlags): JournalCode[] {
  if (!user || user.status !== 'ACTIVE') return []
  return JOURNAL_CODES.filter((c) => roleEnabled(user.assignments[c], flags))
}

export function isSuperAdmin(user: StaffUser | undefined) {
  return !!user && Object.values(user.assignments).includes('SUPER_ADMIN')
}

/** Roles the person holds in the selected journal (several are possible), highest first. */
export function rolesFor(me: Me | null, scope: JournalScope, flags: FeatureFlags): Role[] {
  if (!me || me.status !== 'ACTIVE') return []
  if (scope === 'ALL') return me.isSuperAdmin ? ['SUPER_ADMIN'] : []
  return rolesInJournal(me, scope).filter((r) => roleEnabled(r, flags))
}

export function useCurrentUser(): StaffUser | undefined {
  const userId = useSession((s) => s.userId)
  return useDataStore((s) => s.users.find((u) => u.id === userId))
}

/** Journals the current user may switch between ('ALL' is offered separately to Super Admins). */
export function useJournals(): JournalCode[] {
  const user = useCurrentUser()
  const flags = useSession((s) => s.flags)
  return useMemo(() => assignedJournals(user, flags), [user, flags])
}

/** Keeps the selected journal valid when the user, their assignments or flags change. */
export function useEnsureValidJournal() {
  const user = useCurrentUser()
  const journals = useJournals()
  const scope = useSession((s) => s.journal)
  const setJournal = useSession((s) => s.setJournal)
  useEffect(() => {
    if (!user) return
    const ok = scope === 'ALL' ? isSuperAdmin(user) : journals.includes(scope)
    if (!ok) setJournal(isSuperAdmin(user) ? 'ALL' : (journals[0] ?? 'ALL'))
  }, [user, journals, scope, setJournal])
}

/** Roles of the current user in the selected journal. */
export function useRoles(): Role[] {
  const me = useSession((s) => s.me)
  const scope = useSession((s) => s.journal)
  const flags = useSession((s) => s.flags)
  return useMemo(() => rolesFor(me, scope, flags), [me, scope, flags])
}

/** The highest-ranking role in the selected journal: drives the dashboard and labels. Access checks use `usePermission`. */
export function useRole(): Role | undefined {
  return useRoles()[0]
}

/** Does the person hold this permission string (for example `staff.manage`) in any journal? */
export function useHasPermission(permission: string): boolean {
  const me = useSession((s) => s.me)
  return useMemo(() => permissionsOf(me).has(permission), [me, permission])
}

export interface Permission {
  role: Role | undefined
  level: Level
  /** true when the user holds at least `min` for this area */
  can: (min?: Level) => boolean
  /** Tooltip text explaining why an action is disabled; undefined when allowed. */
  why: (min?: Level) => string | undefined
}

export function usePermission(area: Area): Permission {
  const roles = useRoles()
  const canManageStaff = useHasPermission('staff.manage')
  const role = roles[0]
  // User management follows the server's permission string, not the role name.
  const level: Level = area === 'users' ? (canManageStaff ? 'manage' : 'none') : levelForRoles(roles, area)
  return useMemo(() => {
    const can = (min: Level = 'view') => LEVEL_RANK[level] >= LEVEL_RANK[min]
    return {
      role,
      level,
      can,
      why: (min: Level = 'work') =>
        can(min)
          ? undefined
          : `Your role${role ? ` (${ROLE_META[role].label})` : ''} has "${LEVEL_LABEL[level]}" access here. "${LEVEL_LABEL[min]}" is required.`,
    }
  }, [role, level])
}

export const useCan = (area: Area, min: Level = 'view') => usePermission(area).can(min)

/** Hides children when the user lacks the level. Use `fallback` for a disabled alternative. */
export function Can({ area, min = 'view', children, fallback = null }: { area: Area; min?: Level; children: ReactNode; fallback?: ReactNode }) {
  return useCan(area, min) ? <>{children}</> : <>{fallback}</>
}

/**
 * Can the user perform an action needing `min` on an item?
 * "Work on" level only counts for items assigned to the user; approve/manage apply to every item.
 */
export function useCanAct(area: Area, min: Level, assignedTo?: string | string[]): boolean {
  const { level } = usePermission(area)
  const user = useCurrentUser()
  if (LEVEL_RANK[level] < LEVEL_RANK[min]) return false
  if (level === 'work') {
    const ids = Array.isArray(assignedTo) ? assignedTo : assignedTo ? [assignedTo] : []
    return !!user && ids.includes(user.id)
  }
  return true
}
