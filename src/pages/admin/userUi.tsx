import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Badge, JournalBadge } from '@/components/Badges'
import { toast } from '@/components/Toasts'
import { useSession } from '@/mock/store'
import { JOURNAL_CODES } from '@/mock/data/core'
import { ROLE_FLAG } from '@/permissions/features'
import { ROLE_META, ROLE_ORDER } from '@/permissions/roles'
import type { JournalCode, Role, UserStatus } from '@/shared/types'
import type { Tone } from '@/shared/statuses'
import type { UserRow } from '@/mock/api/users'

export type Assignments = Partial<Record<JournalCode, Role>>

/** Journal code + role chips for a user. */
export function RoleChips({ assignments }: { assignments: Assignments }) {
  const entries = JOURNAL_CODES.filter((c) => assignments[c])
  if (entries.length === 0) return <span className="text-sm text-muted">No access</span>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {entries.map((c) => (
        <li key={c} className="inline-flex items-center gap-1 text-xs">
          <JournalBadge code={c} />
          <span className="text-muted">{ROLE_META[assignments[c]!].short}</span>
        </li>
      ))}
    </ul>
  )
}

const STATUS: Record<UserStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  invited: { label: 'Invited', tone: 'info' },
  suspended: { label: 'Suspended', tone: 'warning' },
  deactivated: { label: 'Deactivated', tone: 'neutral' },
}

export function userStatusLabel(u: UserRow): { label: string; tone: Tone } {
  if (u.status === 'active' && u.invite && !u.invite.acceptedAt) return { label: 'Invitation pending', tone: 'info' }
  return STATUS[u.status]
}

export function UserStatusBadge({ user }: { user: UserRow }) {
  const s = userStatusLabel(user)
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // clipboard may be blocked (insecure context); fall back to selecting the text
      const el = document.getElementById('copy-field-input') as HTMLInputElement | null
      el?.select()
      document.execCommand?.('copy')
    }
    setCopied(true)
    toast.success('Link copied to clipboard.')
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div>
      <label htmlFor="copy-field-input" className="label">{label}</label>
      <div className="flex gap-2">
        <input id="copy-field-input" readOnly value={value} className="input font-mono !text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn-secondary shrink-0" onClick={copy}>
          {copied ? <Check size={15} strokeWidth={1.5} aria-hidden /> : <Copy size={15} strokeWidth={1.5} aria-hidden />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/**
 * Role per journal: rows are journals, columns are roles plus "No access".
 * Review Panel Member is only selectable when its feature flag is on.
 */
export function RoleMatrix({ value, onChange, disabled }: { value: Assignments; onChange: (next: Assignments) => void; disabled?: boolean }) {
  const flags = useSession((s) => s.flags)
  const set = (code: JournalCode, role: Role | undefined) => {
    const next = { ...value }
    if (role) next[code] = role
    else delete next[code]
    onChange(next)
  }
  const roleOff = (r: Role) => !!ROLE_FLAG[r] && !flags[ROLE_FLAG[r]!]
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Role per journal</caption>
        <thead className="bg-subtle text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Journal</th>
            <th scope="col" className="px-2 py-2 text-center font-medium">No access</th>
            {ROLE_ORDER.map((r) => (
              <th key={r} scope="col" className="px-2 py-2 text-center font-medium" title={roleOff(r) ? `${ROLE_META[r].label} is switched off in Prototype controls (feature flag).` : ROLE_META[r].description}>
                {ROLE_META[r].short}
                {roleOff(r) && <span className="block text-[10px] font-normal text-amber-700">flag off</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {JOURNAL_CODES.map((code) => (
            <tr key={code}>
              <th scope="row" className="px-3 py-2 text-left font-normal"><JournalBadge code={code} /></th>
              <td className="px-2 py-2 text-center">
                <input type="radio" name={`role-${code}`} aria-label={`${code}: No access`} checked={!value[code]} disabled={disabled} onChange={() => set(code, undefined)} className="h-4 w-4 accent-[rgb(79,70,229)]" />
              </td>
              {ROLE_ORDER.map((r) => {
                const off = roleOff(r) && value[code] !== r
                return (
                  <td key={r} className="px-2 py-2 text-center">
                    <input type="radio" name={`role-${code}`} aria-label={`${code}: ${ROLE_META[r].label}`} checked={value[code] === r} disabled={disabled || off}
                      title={off ? 'Review Panel Member is switched off (feature flag).' : undefined} onChange={() => set(code, r)} className="h-4 w-4 accent-[rgb(79,70,229)]" />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
