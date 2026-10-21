import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShieldCheck, ShieldOff, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { useAsync } from '@/lib/useAsync'
import { usePermission } from '@/permissions/hooks'
import { Badge } from '@/components/Badges'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { listStaff } from '@/lib/api/staff'
import { GRANTABLE_ROLES, type GrantableRole, type StaffItem } from '@/lib/api/types'
import { initials } from '@/lib/utils'
import { ROLE_META } from '@/permissions/roles'
import type { UserStatus } from '@/shared/types'
import { InviteDialog } from './InviteDialog'
import { STATUS_OPTIONS, StaffRoleChips, StaffStatusBadge, useJournalOptions } from './staffUi'

interface Filters { journalCode: string; role: string; status: string }

/** Staff list (Super Admin). Search, filters and paging run on the server. */
export function UsersPage() {
  const perm = usePermission('users')
  const navigate = useNavigate()
  const journals = useJournalOptions()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [f, setF] = useState<Filters>({ journalCode: '', role: '', status: '' })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  // Remounting the table also empties its search box when the filters are cleared.
  const [tableKey, setTableKey] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [q])

  const { data, loading, error, reload } = useAsync(
    () => listStaff({ page, limit, journalCode: f.journalCode || undefined, role: (f.role || undefined) as GrantableRole | undefined, status: (f.status || undefined) as UserStatus | undefined, q: debouncedQ || undefined }),
    [page, limit, f.journalCode, f.role, f.status, debouncedQ],
  )
  const setFilter = (k: keyof Filters) => (v: string) => { setF((s) => ({ ...s, [k]: v })); setPage(1) }
  const filtered = !!(f.journalCode || f.role || f.status || debouncedQ)

  const columns: Column<StaffItem>[] = [
    {
      id: 'name', header: 'Name', locked: true,
      cell: (u) => (
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{initials(u.fullName)}</span>
          <div className="min-w-0">
            <Link to={`/users/${u.id}`} className="font-medium text-accent hover:underline">{u.fullName}</Link>
            <p className="truncate text-sm text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    { id: 'roles', header: 'Journals & roles', cell: (u) => <StaffRoleChips person={u} /> },
    { id: 'status', header: 'Status', cell: (u) => <StaffStatusBadge status={u.status} /> },
    { id: 'login', header: 'Last sign-in', cell: (u) => (u.lastLoginAt ? <RelativeTime value={u.lastLoginAt} /> : <span className="text-muted">Never</span>) },
    {
      id: 'twostep', header: '2-step',
      cell: (u) => u.twoStepEnabled
        ? <Badge tone="success"><ShieldCheck size={12} aria-hidden /> On</Badge>
        : <Badge tone="neutral"><ShieldOff size={12} aria-hidden /> Off</Badge>,
    },
  ]

  const invite = (
    <GuardedButton allowed={perm.can('manage')} why={perm.why('manage')} className="btn-primary" onClick={() => setInviteOpen(true)}>
      <UserPlus size={15} strokeWidth={1.5} aria-hidden /> Invite user
    </GuardedButton>
  )

  return (
    <>
      <PageHeader title="User Management" description="Staff accounts, the roles each person holds in every journal, and their sign-in security." actions={invite} />
      <DataTable<StaffItem>
        key={tableKey} id="users" data={data?.items ?? []} columns={columns} rowKey={(u) => u.id} loading={loading} error={!!error} onRetry={reload}
        onRowClick={(u) => navigate(`/users/${u.id}`)}
        search={{ placeholder: 'Search name or email', text: () => '' }}
        remote={{ page, limit, total: data?.total ?? 0, onPageChange: setPage, onLimitChange: (n) => { setLimit(n); setPage(1) }, onQueryChange: setQ }}
        filters={
          <>
            <SelectFilter label="Journal" value={f.journalCode} onChange={setFilter('journalCode')} options={journals.map((j) => ({ value: j.value, label: j.label }))} />
            <SelectFilter label="Role" value={f.role} onChange={setFilter('role')} options={GRANTABLE_ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }))} />
            <SelectFilter label="Status" value={f.status} onChange={setFilter('status')} options={STATUS_OPTIONS} />
          </>
        }
        empty={{
          icon: Users,
          title: filtered ? 'No staff match these filters' : 'No staff yet',
          hint: filtered ? 'Clear a filter or change the search. A role filter combined with a journal means that role in that journal.' : 'Invite the first person.',
          action: filtered
            ? <button className="btn-secondary" onClick={() => { setF({ journalCode: '', role: '', status: '' }); setQ(''); setDebouncedQ(''); setPage(1); setTableKey((k) => k + 1) }}>Clear filters</button>
            : perm.can('manage') ? <button className="btn-primary" onClick={() => setInviteOpen(true)}>Invite user</button> : undefined,
        }}
      />
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error.message}</p>}
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={(id) => navigate(`/users/${id}`)} />
    </>
  )
}
