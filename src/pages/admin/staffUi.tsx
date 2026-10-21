import { useMemo } from 'react'
import { Badge, JournalBadge } from '@/components/Badges'
import { isApiError } from '@/lib/api/errors'
import { GRANTABLE_ROLES, type GrantableRole, type JournalRoles, type StaffItem } from '@/lib/api/types'
import { useSession } from '@/mock/store'
import { isJournalCode } from '@/permissions/me'
import { ROLE_META } from '@/permissions/roles'
import type { Role, UserStatus } from '@/shared/types'
import type { Tone } from '@/shared/statuses'

const STATUS: Record<UserStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INVITED: { label: 'Invited', tone: 'info' },
  DISABLED: { label: 'Disabled', tone: 'danger' },
}

export const STATUS_OPTIONS = (Object.keys(STATUS) as UserStatus[]).map((value) => ({ value, label: STATUS[value].label }))

export function StaffStatusBadge({ status }: { status: UserStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
}

export const roleLabel = (role: Role) => ROLE_META[role]?.label ?? role

/** The journal code as a coloured badge when the app knows it, a plain one otherwise. */
export function JournalTag({ code }: { code: string }) {
  return isJournalCode(code) ? <JournalBadge code={code} /> : <Badge>{code}</Badge>
}

/** One line per journal: its code and every role the person holds there. A Super Admin gets its own chip. */
export function StaffRoleChips({ person }: { person: Pick<StaffItem, 'isSuperAdmin' | 'journals'> }) {
  const journals: JournalRoles[] = person.journals.filter((j) => j.roles.length > 0)
  if (!person.isSuperAdmin && journals.length === 0) return <span className="text-sm text-muted">No access</span>
  return (
    <ul className="flex flex-col gap-1">
      {person.isSuperAdmin && <li><Badge tone="accent">Super Admin · all journals</Badge></li>}
      {journals.map((j) => (
        <li key={j.journalCode} className="flex flex-wrap items-center gap-1.5 text-xs">
          <JournalTag code={j.journalCode} />
          <span className="text-muted">{j.roles.map((r) => ROLE_META[r.role]?.short ?? r.role).join(', ')}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * One sentence per error code of the staff API (docs/ADMIN-INTEGRATION.md). `reload` says the screen showed outdated data
 * (the person's state or roles changed meanwhile), so the caller refreshes it.
 */
export function describeStaffError(e: unknown): { message: string; reload: boolean } {
  if (!isApiError(e)) return { message: e instanceof Error ? e.message : 'Something went wrong. Try again.', reload: false }
  switch (e.code) {
    case 'CANNOT_ACT_ON_SELF':
      return { message: 'You cannot do this to your own account. Ask another Super Admin.', reload: false }
    case 'LAST_SUPER_ADMIN':
      return { message: 'At least one active Super Admin must remain. Make someone else a Super Admin first.', reload: false }
    case 'ROLE_ALREADY_GRANTED':
      return { message: 'This person already has that role in that journal.', reload: true }
    case 'ROLE_NOT_ACTIVE':
      return { message: 'That role was already revoked. The list has been refreshed.', reload: true }
    case 'STAFF_STATE_INVALID': {
      const status = e.detail<string>('status')
      return { message: `That does not fit the person’s current state${status ? ` (${status.toLowerCase()})` : ''}. The page has been refreshed.`, reload: true }
    }
    case 'FEATURE_DISABLED': {
      const feature = e.detail<string>('feature')
      return { message: `Review Panel Members are switched off on this server${feature ? ` (${feature})` : ''}.`, reload: false }
    }
    case 'STAFF_NOT_FOUND':
      return { message: 'This person no longer exists.', reload: false }
    case 'JOURNAL_NOT_FOUND':
      return { message: 'That journal does not exist.', reload: false }
    case 'PRECONDITION_FAILED':
    case 'PRECONDITION_REQUIRED':
      return { message: 'Someone else changed this record. Reload it and try again.', reload: true }
    case 'FORBIDDEN':
      return { message: 'Only a Super Admin can manage staff.', reload: false }
    case 'VALIDATION_ERROR': {
      const first = Object.values(e.fieldErrors)[0]
      return { message: first ?? e.message, reload: false }
    }
    case 'NETWORK_ERROR':
      return { message: 'The server could not be reached. Check your connection and try again.', reload: false }
    default:
      return { message: e.message, reload: false }
  }
}

/** Journals a Super Admin can pick from: the server lists every journal for them in `GET /auth/me`. */
export function useJournalOptions(): { value: string; label: string; name: string }[] {
  const me = useSession((s) => s.me)
  return useMemo(() => (me?.journals ?? []).map((j) => ({ value: j.code, label: j.code, name: j.name })), [me])
}

/** Roles that can be granted, with the Review Panel role marked when the server has it switched off. */
export function useGrantableRoles(): { value: GrantableRole; label: string; disabled: boolean }[] {
  const reviewPanel = useSession((s) => s.me?.flags.reviewPanel ?? false)
  return GRANTABLE_ROLES.map((value) => {
    const off = value === 'REVIEW_PANEL_MEMBER' && !reviewPanel
    return { value, label: off ? `${ROLE_META[value].label} (switched off)` : ROLE_META[value].label, disabled: off }
  })
}
