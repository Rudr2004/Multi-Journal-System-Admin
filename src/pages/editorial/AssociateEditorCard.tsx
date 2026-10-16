import { useState } from 'react'
import { Plus, Shuffle, UserCheck } from 'lucide-react'
import type { Paper } from '@/shared/types'
import { SectionCard } from '@/components/Card'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { GuardedButton } from '@/components/Tooltip'
import { UserAvatar } from '@/components/UserAvatar'
import { useCanAct, usePermission } from '@/permissions/hooks'
import { autoAssignPaper, listAssignableEditors, reassignPaper } from '@/mock/api/assignments'
import { useDataStore } from '@/mock/store'
import { AddNoteDialog, NotesList, useEditorNotes } from './EditorNotes'

/** Who is working on the paper in production, with Auto-assign, Reassign and notes for the Associate Editor. */
export function AssociateEditorCard({ paper }: { paper: Paper }) {
  const users = useDataStore((s) => s.users)
  const auto = useDataStore((s) => s.autoAssignAe[paper.journal])
  const { why } = usePermission('submissions')
  const canAct = useCanAct('submissions', 'approve')
  const notes = useEditorNotes(paper.id)
  const [reassign, setReassign] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const ae = users.find((u) => u.id === paper.assigneeId)

  const runAuto = async () => {
    setBusy(true)
    try { const name = await autoAssignPaper(paper.id); toast.success(`Auto-assigned to ${name}.`) } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not assign.') } finally { setBusy(false) }
  }
  return (
    <SectionCard title="Associate Editor and instructions"
      action={<div className="flex flex-wrap gap-2">
        <GuardedButton allowed={canAct} why={why('approve')} className="btn-secondary !h-8" disabled={busy} onClick={runAuto}><Shuffle size={14} aria-hidden /> Auto-assign</GuardedButton>
        <GuardedButton allowed={canAct} why={why('approve')} className="btn-secondary !h-8" onClick={() => setReassign(true)}><UserCheck size={14} aria-hidden /> Reassign</GuardedButton>
      </div>}>
      <div className="flex items-center gap-3">
        {ae ? <UserAvatar name={ae.name} photo={ae.photo} size={44} /> : <span aria-hidden className="h-11 w-11 rounded-full bg-subtle" />}
        <div className="min-w-0">
          <p className="text-sm font-medium">{ae?.name ?? 'Not assigned yet'}</p>
          <p className="text-xs text-muted">{ae ? `${ae.email}${ae.phone ? ` · ${ae.phone}` : ''}` : 'Use Auto-assign, or Reassign to pick someone.'}</p>
        </div>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${auto === false ? 'bg-slate-100 text-slate-600' : 'bg-green-50 text-green-700'}`}>Auto-assign {auto === false ? 'off' : 'on'} for {paper.journal}</span>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Notes for the Associate Editor</p>
          <GuardedButton allowed={canAct} why={why('approve')} className="btn-secondary !h-8" onClick={() => setAdding(true)}><Plus size={14} aria-hidden /> Add note</GuardedButton>
        </div>
        <NotesList notes={notes} empty="No notes yet. Add editing instructions the Associate Editor will see under this Paper ID." />
      </div>

      <ReassignDialog open={reassign} paper={paper} onClose={() => setReassign(false)} />
      <AddNoteDialog paperId={adding ? paper.id : null} title={paper.title} onClose={() => setAdding(false)} />
    </SectionCard>
  )
}

function ReassignDialog({ open, paper, onClose }: { open: boolean; paper: Paper; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} width={520} title="Reassign Associate Editor" description={`${paper.id} · transfer production to another Associate Editor`}
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" form="reassign-ae-form">Reassign</button></>}>
      {open && <ReassignForm paper={paper} onClose={onClose} />}
    </Dialog>
  )
}

function ReassignForm({ paper, onClose }: { paper: Paper; onClose: () => void }) {
  const choices = listAssignableEditors(paper.journal)
  const [to, setTo] = useState(choices.find((c) => c.user.id !== paper.assigneeId)?.user.id ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (choices.length === 0) return <p className="text-sm text-muted">No active Associate Editor holds {paper.journal}. Add one in User Management first.</p>
  return (
    <form id="reassign-ae-form" className="space-y-4" onSubmit={async (e) => {
      e.preventDefault()
      if (!to) return
      setBusy(true)
      try { await reassignPaper(paper.id, to, note); toast.success('Paper reassigned.'); onClose() } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not reassign.') } finally { setBusy(false) }
    }}>
      <fieldset disabled={busy}>
        <legend className="label">Transfer to</legend>
        <ul className="space-y-2">
          {choices.map(({ user, workload }) => (
            <li key={user.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
                <input type="radio" name="ae" className="accent-indigo-600" checked={to === user.id} disabled={user.id === paper.assigneeId} onChange={() => setTo(user.id)} />
                <UserAvatar name={user.name} photo={user.photo} size={32} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{user.name}{user.id === paper.assigneeId && <span className="ml-2 text-xs font-normal text-muted">current</span>}</span><span className="block text-xs text-muted">{workload} manuscript{workload === 1 ? '' : 's'} in production</span></span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <FormField label="Note for the new Associate Editor (optional)" hint="Shown under this Paper ID on their dashboard.">
        {(a) => <textarea {...a} rows={3} className="input !h-auto py-2" value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />}
      </FormField>
    </form>
  )
}
