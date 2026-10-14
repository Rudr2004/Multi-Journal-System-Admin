import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, KeyRound, Mail, Pencil, Play, UserX } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { useAsync } from '@/lib/useAsync'
import { useCurrentUser, usePermission } from '@/permissions/hooks'
import { Badge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { DescriptionList } from '@/components/Form'
import { ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { Timeline } from '@/components/Timeline'
import { toast } from '@/components/Toasts'
import { formatDateTime } from '@/shared/formatters'
import { changeUserStatus, getUser, hasExpertiseRole, resendInvitation, resetUserAccess, updateAssignments, updateExpertise, type StatusAction } from '@/mock/api/users'
import { categoryLabel } from '@/mock/api/audit'
import { ExpertiseChips, ExpertisePicker, RoleChips, RoleMatrix, CopyField, UserStatusBadge, type Assignments } from './userUi'

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.')

export function UserDetailPage() {
  const { userId = '' } = useParams()
  const perm = usePermission('users')
  const me = useCurrentUser()
  const { data, loading, error, reload } = useAsync(() => getUser(userId), [userId])
  const [editing, setEditing] = useState(false)
  const [editingExp, setEditingExp] = useState(false)
  const [confirm, setConfirm] = useState<StatusAction | 'reset' | null>(null)
  const [link, setLink] = useState<{ title: string; text: string; url: string } | null>(null)

  const back = <Link to="/users" className="btn-secondary"><ArrowLeft size={15} strokeWidth={1.5} aria-hidden /> All users</Link>
  if (error) {
    return (
      <>
        <PageHeader title="User Management" crumbs={[{ label: userId }]} actions={back} />
        <div className="card"><ErrorState message={error.message} onRetry={reload} /></div>
      </>
    )
  }
  const u = data?.user
  const isSelf = !!u && u.id === me?.id
  const manage = perm.can('manage')
  const selfWhy = isSelf ? 'You cannot change the status of your own account.' : undefined
  const pending = !!u?.invite && !u.invite.acceptedAt

  const runStatus = async (action: StatusAction) => {
    if (!u) return
    try {
      await changeUserStatus(u.id, action)
      toast.success(action === 'suspend' ? `${u.name} is suspended and signed out.` : action === 'reactivate' ? `${u.name} can sign in again.` : `${u.name} was deactivated.`)
      reload()
    } catch (e) { toast.error(messageOf(e)) }
  }
  const runReset = async () => {
    if (!u) return
    try {
      const { link: url } = await resetUserAccess(u.id)
      setLink({ title: 'Access reset', text: `${u.name} was signed out everywhere and must set a new password and re-enrol 2-step. A reset link was emailed to ${u.email}.`, url })
      reload()
    } catch (e) { toast.error(messageOf(e)) }
  }
  const resend = async () => {
    if (!u) return
    try {
      const { link: url } = await resendInvitation(u.id)
      setLink({ title: 'Invitation resent', text: `A reminder was queued to ${u.email}.`, url })
    } catch (e) { toast.error(messageOf(e)) }
  }

  return (
    <>
      <PageHeader title={u?.name ?? 'User'} description={u ? `${u.title} · ${u.email}` : undefined} crumbs={[{ label: u?.name ?? userId }]} actions={back} />
      {loading || !u ? (
        <div className="grid gap-4 lg:grid-cols-3" aria-busy="true"><Skeleton className="h-56 lg:col-span-2" /><Skeleton className="h-56" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <SectionCard title="Journals & roles" action={
              <GuardedButton allowed={manage} why={perm.why('manage')} onClick={() => setEditing(true)}><Pencil size={14} strokeWidth={1.5} aria-hidden /> Edit assignments</GuardedButton>
            }>
              <RoleChips assignments={u.assignments} />
              <p className="mt-3 text-xs text-muted">The person only sees the journals listed here, and only the modules their role allows in each one.</p>
            </SectionCard>

            {hasExpertiseRole(u.assignments) && (
              <SectionCard title="Reviewer expertise areas" action={
                <GuardedButton allowed={manage} why={perm.why('manage')} onClick={() => setEditingExp(true)}><Pencil size={14} strokeWidth={1.5} aria-hidden /> Edit expertise</GuardedButton>
              }>
                <ExpertiseChips tags={u.expertise} />
                <p className="mt-3 text-xs text-muted">Editors see these when matching a paper’s subjects to a Reviewer or Review Panel Member.</p>
              </SectionCard>
            )}

            <SectionCard title="Activity">
              <Timeline
                empty="No recorded activity for this user yet."
                items={(data?.activity ?? []).map((a) => ({
                  id: a.id, at: a.at, actor: a.actor,
                  text: `· ${a.action}: ${a.target}${a.journal !== 'ALL' ? ` (${a.journal})` : ''} — ${categoryLabel(a.action)}`,
                }))}
              />
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard title="Account">
              <DescriptionList cols={1} items={[
                { label: 'Status', value: <UserStatusBadge user={u} /> },
                { label: 'Two-step sign-in', value: u.twoStep ? <Badge tone="success">On</Badge> : <Badge>Off</Badge> },
                { label: 'Last active', value: u.lastActive ? <span title={formatDateTime(u.lastActive)}><RelativeTime value={u.lastActive} /></span> : 'Never signed in' },
                ...(u.invite ? [{ label: 'Invited', value: <span>{formatDateTime(u.invite.invitedAt)} by {u.invite.invitedBy}{u.invite.acceptedAt ? ' · accepted' : ' · not accepted yet'}</span> }] : []),
              ]} />
              {pending && (
                <div className="mt-4 space-y-2 border-t border-line pt-4">
                  <CopyField label="Invitation link" value={u.invite!.link} />
                  <GuardedButton allowed={manage} why={perm.why('manage')} onClick={resend}><Mail size={14} strokeWidth={1.5} aria-hidden /> Resend invitation</GuardedButton>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Access">
              <div className="flex flex-col items-stretch gap-2">
                {u.status === 'active' || u.status === 'invited' ? (
                  <GuardedButton allowed={manage && !isSelf} why={selfWhy ?? perm.why('manage')} onClick={() => setConfirm('suspend')}><Ban size={14} strokeWidth={1.5} aria-hidden /> Suspend</GuardedButton>
                ) : (
                  <GuardedButton allowed={manage} why={perm.why('manage')} className="btn-primary" onClick={() => setConfirm('reactivate')}><Play size={14} strokeWidth={1.5} aria-hidden /> Reactivate</GuardedButton>
                )}
                <GuardedButton allowed={manage} why={perm.why('manage')} onClick={() => setConfirm('reset')}><KeyRound size={14} strokeWidth={1.5} aria-hidden /> Reset access</GuardedButton>
                {u.status !== 'deactivated' && (
                  <GuardedButton allowed={manage && !isSelf} why={selfWhy ?? perm.why('manage')} className="btn-danger" onClick={() => setConfirm('deactivate')}><UserX size={14} strokeWidth={1.5} aria-hidden /> Deactivate</GuardedButton>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {u && editing && <EditAssignments key={u.id} initial={u.assignments} name={u.name} onClose={() => setEditing(false)} onSave={async (a) => {
        try { await updateAssignments(u.id, a); toast.success(`Roles updated for ${u.name}.`); setEditing(false); reload() } catch (e) { toast.error(messageOf(e)) }
      }} />}

      {u && editingExp && <EditExpertise key={u.id} initial={u.expertise} name={u.name} onClose={() => setEditingExp(false)} onSave={async (t) => {
        try { await updateExpertise(u.id, t); toast.success(`Expertise updated for ${u.name}.`); setEditingExp(false); reload() } catch (e) { toast.error(messageOf(e)) }
      }} />}

      <ConfirmDialog open={confirm === 'suspend'} onClose={() => setConfirm(null)} onConfirm={() => runStatus('suspend')} title={`Suspend ${u?.name}?`} confirmLabel="Suspend" danger
        consequences={['Block sign-in immediately and end any open session.', 'Keep their roles, so reactivating restores the same access.', 'Leave papers and reviews assigned to them in place — reassign them if needed.', 'Be recorded in the audit log.']} />
      <ConfirmDialog open={confirm === 'reactivate'} onClose={() => setConfirm(null)} onConfirm={() => runStatus('reactivate')} title={`Reactivate ${u?.name}?`} confirmLabel="Reactivate"
        consequences={['Allow sign-in again with their previous roles.', 'Be recorded in the audit log.']} />
      <ConfirmDialog open={confirm === 'deactivate'} onClose={() => setConfirm(null)} onConfirm={() => runStatus('deactivate')} title={`Deactivate ${u?.name}?`} confirmLabel="Deactivate" danger
        consequences={['Permanently remove sign-in access (a Super Admin can reactivate later).', 'Keep their name on past decisions, reviews and audit entries.', 'Stop new work being assigned to them.', 'Be recorded in the audit log.']} />
      <ConfirmDialog open={confirm === 'reset'} onClose={() => setConfirm(null)} onConfirm={runReset} title={`Reset access for ${u?.name}?`} confirmLabel="Reset access"
        consequences={['Sign them out of every device.', 'Turn off their current two-step sign-in; they re-enrol on next sign-in.', 'Email a new set-password link.', 'Be recorded in the audit log.']} />

      <Dialog open={!!link} onClose={() => setLink(null)} title={link?.title ?? ''} footer={<button className="btn-primary" onClick={() => setLink(null)}>Done</button>}>
        <p className="mb-3 text-sm text-muted">{link?.text}</p>
        {link && <CopyField label="Link" value={link.url} />}
      </Dialog>
    </>
  )
}

function EditAssignments({ initial, name, onClose, onSave }: { initial: Assignments; name: string; onClose: () => void; onSave: (a: Assignments) => Promise<void> }) {
  const [value, setValue] = useState<Assignments>(initial)
  const [saving, setSaving] = useState(false)
  const changed = JSON.stringify(Object.entries(value).sort()) !== JSON.stringify(Object.entries(initial).sort())
  return (
    <Dialog open onClose={onClose} title={`Edit roles — ${name}`} description="One role per journal. Changes apply the next time they load a page." width={760}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!changed || saving} onClick={async () => { setSaving(true); await onSave(value); setSaving(false) }}>{saving ? 'Saving…' : 'Save roles'}</button>
      </>}>
      <RoleMatrix value={value} onChange={setValue} />
      <p className="mt-2 text-xs text-muted">Choose “No access” to remove someone from a journal. At least one journal must remain; the last Super Admin cannot be demoted.</p>
    </Dialog>
  )
}

function EditExpertise({ initial, name, onClose, onSave }: { initial: string[]; name: string; onClose: () => void; onSave: (t: string[]) => Promise<void> }) {
  const [value, setValue] = useState<string[]>(initial)
  const [saving, setSaving] = useState(false)
  const changed = JSON.stringify([...value].sort()) !== JSON.stringify([...initial].sort())
  return (
    <Dialog open onClose={onClose} title={`Expertise areas — ${name}`} description="Choose the subjects this person can review."
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!changed || saving} onClick={async () => { setSaving(true); await onSave(value); setSaving(false) }}>{saving ? 'Saving…' : 'Save expertise'}</button>
      </>}>
      <ExpertisePicker value={value} onChange={setValue} />
    </Dialog>
  )
}
