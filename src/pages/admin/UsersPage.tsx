import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, ShieldCheck, ShieldOff, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { useAsync } from '@/lib/useAsync'
import { useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { useSession } from '@/mock/store'
import { ROLE_META, ROLE_ORDER } from '@/permissions/roles'
import { FLAG_META, ROLE_FLAG } from '@/permissions/flags'
import { Badge } from '@/components/Badges'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { ErrorState } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { initials } from '@/lib/utils'
import { JOURNAL_CODES } from '@/mock/data/core'
import { hasExpertiseRole, listUsers, type UserRow } from '@/mock/api/users'
import { recordAudit } from '@/mock/actions'
import { downloadCsv } from '@/pages/insights/csv'
import { InviteDialog } from './InviteDialog'
import { ExpertiseChips, RoleChips, UserStatusBadge, userStatusLabel } from './userUi'

export function UsersPage() {
  const perm = usePermission('users')
  const navigate = useNavigate()
  const scope = useScopeJournals()
  const flags = useSession((s) => s.flags)
  const { data, loading, error, reload } = useAsync(() => listUsers(), [])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [f, setF] = useState({ journal: '', role: '', status: '' })
  const { journal: journalF, role: roleF, status: statusF } = f
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  const rows = useMemo(
    () =>
      (data ?? []).filter((u) => {
        const codes = JOURNAL_CODES.filter((c) => u.assignments[c])
        const inScope = scope.length === JOURNAL_CODES.length || codes.length === 0 || codes.some((c) => scope.includes(c))
        if (!inScope) return false
        if (journalF && !u.assignments[journalF as keyof typeof u.assignments]) return false
        if (roleF && !(journalF ? u.assignments[journalF as keyof typeof u.assignments] === roleF : Object.values(u.assignments).includes(roleF as never))) return false
        if (statusF && userStatusLabel(u).label !== statusF) return false
        return true
      }),
    [data, scope, journalF, roleF, statusF],
  )

  const columns: Column<UserRow>[] = [
    {
      id: 'name', header: 'Name', locked: true, sort: (u) => u.name,
      cell: (u) => (
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{initials(u.name)}</span>
          <div className="min-w-0">
            <Link to={`/users/${u.id}`} className="font-medium text-accent hover:underline">{u.name}</Link>
            <p className="truncate text-sm text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    { id: 'roles', header: 'Journals & roles', cell: (u) => <RoleChips assignments={u.assignments} /> },
    { id: 'expertise', header: 'Expertise areas', cell: (u) => (hasExpertiseRole(u.assignments) ? <ExpertiseChips tags={u.expertise} max={3} /> : <span className="text-muted">—</span>) },
    { id: 'status', header: 'Status', sort: (u) => userStatusLabel(u).label, cell: (u) => <UserStatusBadge user={u} /> },
    { id: 'active', header: 'Last active', sort: (u) => u.lastActive, cell: (u) => (u.lastActive ? <RelativeTime value={u.lastActive} /> : <span className="text-muted">Never</span>) },
    {
      id: 'twostep', header: '2-step', sort: (u) => (u.twoStep ? 1 : 0),
      cell: (u) => u.twoStep
        ? <Badge tone="success"><ShieldCheck size={12} aria-hidden /> On</Badge>
        : <Badge tone="neutral"><ShieldOff size={12} aria-hidden /> Off</Badge>,
    },
  ]

  const exportCsv = () => {
    recordAudit({ journal: 'ALL', action: 'Exported users (CSV)', target: 'User Management', newValue: `${rows.length} rows` })
    downloadCsv('users.csv', [
      ['Name', 'Email', 'Title', 'Status', '2-step', 'Assignments', 'Expertise areas'],
      ...rows.map((u) => [u.name, u.email, u.title, userStatusLabel(u).label, u.twoStep ? 'On' : 'Off', JOURNAL_CODES.filter((c) => u.assignments[c]).map((c) => `${c}: ${ROLE_META[u.assignments[c]!].label}`).join('; '), u.expertise.join('; ')]),
    ])
  }

  return (
    <>
      <PageHeader
        title="User Management"
        description="Staff accounts and the role each person holds in every journal."
        actions={
          <GuardedButton allowed={perm.can('manage')} why={perm.why('manage')} className="btn-primary" onClick={() => setInviteOpen(true)}>
            <UserPlus size={15} strokeWidth={1.5} aria-hidden /> Invite user
          </GuardedButton>
        }
      />
      {error ? (
        <div className="card"><ErrorState message="Users could not be loaded." onRetry={reload} /></div>
      ) : (
        <DataTable<UserRow>
          id="users" data={rows} columns={columns} rowKey={(u) => u.id} loading={loading} pageSize={10}
          onRowClick={(u) => navigate(`/users/${u.id}`)}
          search={{ placeholder: 'Search name, email or expertise', text: (u) => `${u.name} ${u.email} ${u.title} ${u.expertise.join(' ')}` }}
          views={{ filters: f, applyFilters: (x) => setF(x as typeof f) }}
          filters={
            <>
              <SelectFilter label="Journal" value={journalF} onChange={set('journal')} options={JOURNAL_CODES.map((c) => ({ value: c, label: c }))} />
              <SelectFilter label="Role" value={roleF} onChange={set('role')} options={ROLE_ORDER.filter((r) => !ROLE_FLAG[r] || flags[ROLE_FLAG[r]!]).map((r) => ({ value: r, label: ROLE_FLAG[r] ? `${ROLE_META[r].label} (${FLAG_META[ROLE_FLAG[r]!].badge})` : ROLE_META[r].label }))} />
              <SelectFilter label="Status" value={statusF} onChange={set('status')} options={['Active', 'Invitation pending', 'Suspended', 'Deactivated'].map((s) => ({ value: s, label: s }))} />
            </>
          }
          toolbarRight={<button className="btn-secondary" onClick={exportCsv}><Download size={15} strokeWidth={1.5} aria-hidden /> Export</button>}
          empty={{ icon: Users, title: 'No users match these filters', hint: 'Clear a filter, or invite the first person for this journal.', action: perm.can('manage') ? <button className="btn-primary" onClick={() => setInviteOpen(true)}>Invite user</button> : undefined }}
        />
      )}
      <InviteDialog open={inviteOpen} onClose={() => { setInviteOpen(false); reload() }} />
    </>
  )
}
