import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, KeyRound, LogOut, Mail, Pencil, Play, Plus, ShieldCheck, ShieldOff, Smartphone, Trash2 } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { useAsync } from '@/lib/useAsync'
import { usePermission } from '@/permissions/hooks'
import { Badge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { ConfirmDialog } from '@/components/Dialog'
import { DescriptionList } from '@/components/Form'
import { ReasonDialog } from '@/components/ReasonDialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { errorMessage } from '@/lib/api/errors'
import { reloadMe } from '@/lib/api/session'
import {
  REASON_MAX, REASON_MIN, disableStaff, enableStaff, forcePasswordReset, getStaff, grantRole, listStaffSessions, resendInvite, resetStaffMfa, revokeRole, revokeStaffSessions, setSuperAdmin,
} from '@/lib/api/staff'
import type { GrantableRole } from '@/lib/api/types'
import { formatDate, formatDateTime } from '@/shared/formatters'
import { useSession } from '@/mock/store'
import { EditStaffDialog, GrantRoleDialog } from './StaffDialogs'
import { JournalTag, StaffStatusBadge, describeStaffError, roleLabel } from './staffUi'

type Dialog =
  | { kind: 'edit' | 'grant' | 'superAdmin' | 'disable' | 'enable' | 'resend' | 'revokeSessions' | 'forceReset' | 'mfaReset' }
  | { kind: 'revoke'; grantId: string; role: string; journalCode: string }

const reasonProps = { minLength: REASON_MIN, maxLength: REASON_MAX, placeholder: 'Why? It is recorded in the audit log.' } as const

/** One person: roles per journal, sessions, and every Super Admin action on the account. */
export function UserDetailPage() {
  const { userId = '' } = useParams()
  const perm = usePermission('users')
  const myId = useSession((s) => s.userId)
  const person = useAsync(() => getStaff(userId), [userId])
  const sessions = useAsync(() => listStaffSessions(userId), [userId])
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const close = () => setDialog(null)

  const back = <Link to="/users" className="btn-secondary"><ArrowLeft size={15} strokeWidth={1.5} aria-hidden /> All users</Link>
  const p = person.data
  if (!p) {
    return (
      <>
        <PageHeader title="User Management" crumbs={[{ label: 'Staff member' }]} actions={back} />
        {person.error
          ? <div className="card"><ErrorState message={describeStaffError(person.error).message} onRetry={person.reload} /></div>
          : <div className="grid gap-4 lg:grid-cols-3" aria-busy="true"><Skeleton className="h-56 lg:col-span-2" /><Skeleton className="h-56" /></div>}
      </>
    )
  }

  const reloadAll = () => { person.reload(); sessions.reload() }
  const manage = perm.can('manage')
  const isSelf = p.id === myId
  const selfWhy = 'You cannot do this to your own account. Ask another Super Admin.'
  const why = (extra?: string) => extra ?? perm.why('manage')

  /** Runs a change. A rejection carries a readable sentence for the dialog; outdated data is refreshed. `touchesRoles` re-reads the signed-in person when it is them. */
  const act = async (run: () => Promise<unknown>, success: string, touchesRoles = false) => {
    try {
      await run()
    } catch (e) {
      const d = describeStaffError(e)
      if (d.reload) reloadAll()
      throw new Error(d.message, { cause: e })
    }
    toast.success(success)
    reloadAll()
    if (touchesRoles && isSelf) void reloadMe().catch((e: unknown) => toast.error(errorMessage(e)))
  }
  // Dialogs that take no reason close first, so their failures surface as toasts.
  const fire = (run: () => Promise<unknown>, success: string) => { void act(run, success).catch((e: Error) => toast.error(e.message)) }

  const activeSince = (iso: string) => <span title={formatDateTime(iso)}>{formatDate(iso)}</span>
  const locked = p.lockedUntil && new Date(p.lockedUntil) > new Date() ? p.lockedUntil : null

  return (
    <>
      <PageHeader title={p.fullName} description={p.email} crumbs={[{ label: p.fullName }]} actions={back} />
      <div className="grid items-start gap-4 lg:grid-cols-3" aria-busy={person.loading}>
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Journals & roles" action={
            <GuardedButton allowed={manage} why={why()} onClick={() => setDialog({ kind: 'grant' })}><Plus size={14} strokeWidth={1.5} aria-hidden /> Grant role</GuardedButton>
          }>
            {p.isSuperAdmin && (
              <p className="mb-3 flex flex-wrap items-center gap-2 text-sm"><Badge tone="accent">Super Admin</Badge><span className="text-muted">Full access to every journal and to staff management.</span></p>
            )}
            {p.journals.length === 0 ? (
              <EmptyState title="No journal roles" hint={p.isSuperAdmin ? 'This person works as a Super Admin only.' : 'They cannot work in any journal until a role is granted.'} />
            ) : (
              <ul className="divide-y divide-line">
                {p.journals.map((j) => (
                  <li key={j.journalCode} className="py-3 first:pt-0 last:pb-0">
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium"><JournalTag code={j.journalCode} /><span className="text-muted">{j.journalName}</span></p>
                    <ul className="space-y-1.5">
                      {j.roles.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span><span className="font-medium">{roleLabel(r.role)}</span> <span className="text-muted">· since {activeSince(r.grantedAt)}{r.grantReason ? ` · “${r.grantReason}”` : ''}</span></span>
                          <GuardedButton allowed={manage} why={why()} className="btn-ghost !h-8 text-red-700" aria-label={`Revoke ${roleLabel(r.role)} in ${j.journalCode}`}
                            onClick={() => setDialog({ kind: 'revoke', grantId: r.id, role: roleLabel(r.role), journalCode: j.journalCode })}>
                            <Trash2 size={14} strokeWidth={1.5} aria-hidden /> Revoke
                          </GuardedButton>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Active sessions">
            {sessions.error ? <ErrorState message="Sessions could not be loaded." onRetry={sessions.reload} />
              : !sessions.data ? <Skeleton className="h-16 w-full" />
              : sessions.data.length === 0 ? <EmptyState icon={Smartphone} title="No active sessions" hint="They are signed out everywhere." />
              : (
                <ul className="divide-y divide-line">
                  {sessions.data.map((s) => (
                    <li key={s.id} className="py-2.5 first:pt-0 last:pb-0">
                      <p className="truncate text-sm font-medium" title={s.device}>{s.device || 'Unknown device'}</p>
                      <p className="text-xs text-muted">Signed in {formatDateTime(s.createdAt)} · last used <RelativeTime value={s.lastUsedAt} /> · idle limit {formatDateTime(s.idleExpiresAt)} · ends {formatDateTime(s.absoluteExpiresAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Account">
            <DescriptionList cols={1} items={[
              { label: 'Status', value: <StaffStatusBadge status={p.status} /> },
              { label: 'Two-step sign-in', value: p.twoStepEnabled ? <Badge tone="success"><ShieldCheck size={12} aria-hidden /> On</Badge> : <Badge><ShieldOff size={12} aria-hidden /> Off</Badge> },
              { label: 'Phone', value: p.phone ?? 'Not set' },
              { label: 'Last sign-in', value: p.lastLoginAt ? <RelativeTime value={p.lastLoginAt} /> : 'Never signed in' },
              { label: 'Created', value: formatDateTime(p.createdAt) },
              { label: 'Active sessions', value: String(p.activeSessions) },
              ...(p.mustChangePassword ? [{ label: 'Password', value: <Badge tone="warning">Must be changed at next sign-in</Badge> }] : []),
              ...(locked ? [{ label: 'Locked until', value: <Badge tone="warning">{formatDateTime(locked)}</Badge> }] : []),
              ...(p.status === 'DISABLED' ? [{ label: 'Disabled', value: <span>{p.disabledAt ? formatDateTime(p.disabledAt) : ''}{p.disabledReason ? ` · “${p.disabledReason}”` : ''}</span> }] : []),
            ]} />
          </SectionCard>

          <SectionCard title="Actions">
            <div className="flex flex-col items-stretch gap-2">
              <GuardedButton allowed={manage} why={why()} onClick={() => setDialog({ kind: 'edit' })}><Pencil size={14} strokeWidth={1.5} aria-hidden /> Edit name and phone</GuardedButton>
              {p.status === 'INVITED' && <GuardedButton allowed={manage} why={why()} onClick={() => setDialog({ kind: 'resend' })}><Mail size={14} strokeWidth={1.5} aria-hidden /> Resend invitation</GuardedButton>}
              <GuardedButton allowed={manage && !(isSelf && p.isSuperAdmin)} why={why(isSelf ? selfWhy : undefined)} onClick={() => setDialog({ kind: 'superAdmin' })}>
                <ShieldCheck size={14} strokeWidth={1.5} aria-hidden /> {p.isSuperAdmin ? 'Remove Super Admin' : 'Make Super Admin'}
              </GuardedButton>
              <GuardedButton allowed={manage && p.status === 'ACTIVE' && !isSelf} why={why(isSelf ? selfWhy : p.status !== 'ACTIVE' ? 'Only an active person can be sent a password reset.' : undefined)} onClick={() => setDialog({ kind: 'forceReset' })}>
                <KeyRound size={14} strokeWidth={1.5} aria-hidden /> Force password reset
              </GuardedButton>
              <GuardedButton allowed={manage && p.twoStepEnabled} why={why(!p.twoStepEnabled ? 'Two-step sign-in is not on for this person.' : undefined)} onClick={() => setDialog({ kind: 'mfaReset' })}>
                <ShieldOff size={14} strokeWidth={1.5} aria-hidden /> Reset two-step sign-in
              </GuardedButton>
              <GuardedButton allowed={manage} why={why()} onClick={() => setDialog({ kind: 'revokeSessions' })}><LogOut size={14} strokeWidth={1.5} aria-hidden /> Sign out all devices</GuardedButton>
              {p.status === 'DISABLED' ? (
                <GuardedButton allowed={manage} why={why()} className="btn-primary" onClick={() => setDialog({ kind: 'enable' })}><Play size={14} strokeWidth={1.5} aria-hidden /> Enable account</GuardedButton>
              ) : (
                <GuardedButton allowed={manage && !isSelf} why={why(isSelf ? selfWhy : undefined)} className="btn-danger" onClick={() => setDialog({ kind: 'disable' })}><Ban size={14} strokeWidth={1.5} aria-hidden /> Disable account</GuardedButton>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <EditStaffDialog person={p} open={dialog?.kind === 'edit'} onClose={close} onSaved={() => { toast.success('Details saved.'); reloadAll() }} onReload={reloadAll} />
      <GrantRoleDialog person={p} open={dialog?.kind === 'grant'} onClose={close}
        onGrant={({ journalCode, role, reason }: { journalCode: string; role: GrantableRole; reason: string }) => act(() => grantRole(p.id, { journalCode, role, reason }), `${roleLabel(role)} granted in ${journalCode}.`, true)} />

      <ReasonDialog open={dialog?.kind === 'revoke'} onClose={close} danger confirmLabel="Revoke role" {...reasonProps}
        title={dialog?.kind === 'revoke' ? `Revoke ${dialog.role} in ${dialog.journalCode}?` : 'Revoke role'}
        consequences={['They lose what this role allows in that journal. Other roles are unchanged.', 'Their open sessions pick up the change on the next request.']}
        onSubmit={(reason) => dialog?.kind === 'revoke' ? act(() => revokeRole(p.id, dialog.grantId, reason), 'Role revoked.', true) : undefined} />

      <ReasonDialog open={dialog?.kind === 'superAdmin'} onClose={close} danger={p.isSuperAdmin} {...reasonProps}
        title={p.isSuperAdmin ? `Remove Super Admin from ${p.fullName}?` : `Make ${p.fullName} a Super Admin?`}
        confirmLabel={p.isSuperAdmin ? 'Remove Super Admin' : 'Make Super Admin'}
        consequences={p.isSuperAdmin
          ? ['They lose access to staff management and every Super Admin module.', 'At least one active Super Admin must remain.']
          : ['They get access to every journal, to staff management and to the audit log.', 'Two-step sign-in becomes mandatory for them when the server requires it.']}
        onSubmit={(reason) => act(() => setSuperAdmin(p.id, !p.isSuperAdmin, reason), p.isSuperAdmin ? 'Super Admin removed.' : 'Super Admin granted.', true)} />

      <ReasonDialog open={dialog?.kind === 'disable'} onClose={close} danger confirmLabel="Disable account" {...reasonProps} title={`Disable ${p.fullName}?`}
        consequences={['Block sign-in immediately and end all their sessions.', 'Keep their roles and history; enabling the account restores the same access.', 'Be recorded in the audit log. Nothing is deleted.']}
        onSubmit={(reason) => act(() => disableStaff(p.id, reason), `${p.fullName} is disabled and signed out.`)} />

      <ReasonDialog open={dialog?.kind === 'enable'} onClose={close} confirmLabel="Enable account" {...reasonProps} title={`Enable ${p.fullName}?`}
        consequences={['Allow sign-in again with their previous roles (they stay invited if they never accepted).']}
        onSubmit={(reason) => act(() => enableStaff(p.id, reason), `${p.fullName} can sign in again.`)} />

      <ReasonDialog open={dialog?.kind === 'revokeSessions'} onClose={close} danger confirmLabel="Sign out all devices" {...reasonProps} title={`Sign ${p.fullName} out everywhere?`}
        consequences={['End every session of this person on every device.', 'Their password and roles are unchanged; they can sign in again.']}
        onSubmit={(reason) => act(async () => { const r = await revokeStaffSessions(p.id, reason); toast.info(`${r.revokedSessions} session${r.revokedSessions === 1 ? '' : 's'} ended.`) }, 'Sessions ended.')} />

      <ReasonDialog open={dialog?.kind === 'forceReset'} onClose={close} danger confirmLabel="Force password reset" {...reasonProps} title={`Force a password reset for ${p.fullName}?`}
        consequences={['Their current password stops working and all sessions end.', `A reset link is emailed to ${p.email}.`]}
        onSubmit={(reason) => act(() => forcePasswordReset(p.id, reason), 'Reset link emailed.')} />

      <ReasonDialog open={dialog?.kind === 'mfaReset'} onClose={close} danger confirmLabel="Reset two-step sign-in" {...reasonProps} title={`Reset two-step sign-in for ${p.fullName}?`}
        consequences={['Remove their authenticator and recovery codes, and end all their sessions.', 'They sign in with their password; a Super Admin must set two-step up again at that sign-in.']}
        onSubmit={(reason) => act(() => resetStaffMfa(p.id, reason), 'Two-step sign-in reset.')} />

      <ConfirmDialog open={dialog?.kind === 'resend'} onClose={close} title={`Resend the invitation to ${p.email}?`} confirmLabel="Resend invitation"
        consequences={['Email a new set-password link.', 'The previous link stops working.']}
        onConfirm={() => fire(() => resendInvite(p.id), 'A new invitation was emailed.')} />
    </>
  )
}
