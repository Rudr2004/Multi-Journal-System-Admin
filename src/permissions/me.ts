import type { Me } from '@/lib/api/types'
import { JOURNAL_CODES } from '@/mock/data/core'
import type { JournalCode, Role, StaffUser } from '@/shared/types'
import { ROLE_ORDER } from './roles'

/**
 * Adapter between the platform API's `GET /auth/me` shape and what the screens consume.
 * Several roles per journal are kept in `Me`; the mock-backed screens still read one role per journal from `StaffUser`
 * (the highest-ranking one), while access checks use `rolesInJournal` / `hasPermission` below.
 */

export const isJournalCode = (code: string): code is JournalCode => (JOURNAL_CODES as string[]).includes(code)

const byRank = (a: Role, b: Role) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)

/** Roles held in a journal, highest first. A Super Admin holds SUPER_ADMIN in every journal on top of any journal role. */
export function rolesInJournal(me: Me, code: JournalCode): Role[] {
  const own = me.journals.find((j) => j.code === code)?.roles ?? []
  const roles = me.isSuperAdmin ? ['SUPER_ADMIN' as const, ...own.filter((r) => r !== 'SUPER_ADMIN')] : own
  return [...roles].sort(byRank)
}

/** Journals (of the ones this app knows) the person can work in. */
export function journalsOf(me: Me): JournalCode[] {
  return me.journals.map((j) => j.code).filter(isJournalCode).filter((c) => rolesInJournal(me, c).length > 0)
}

/** Every permission string the person holds in any journal. UI that needs a platform-wide right checks this set. */
export function permissionsOf(me: Me | null): ReadonlySet<string> {
  return new Set(me?.journals.flatMap((j) => j.permissions) ?? [])
}

export function staffUserFromMe(me: Me): StaffUser {
  const assignments: StaffUser['assignments'] = {}
  for (const code of journalsOf(me)) assignments[code] = rolesInJournal(me, code)[0]
  return {
    id: me.id,
    name: me.fullName,
    email: me.email,
    title: '',
    status: me.status,
    twoStep: me.twoStepEnabled,
    phone: me.phone ?? undefined,
    assignments,
  }
}
