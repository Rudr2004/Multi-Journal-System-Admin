import { useId, useMemo, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { Badge } from '@/components/Badges'
import { UserAvatar } from '@/components/UserAvatar'
import { toast } from '@/components/Toasts'
import { formatDate } from '@/shared/formatters'
import { assignExternalReviewer, externalCandidates, type AllSubmissionRow } from '@/mock/api/reviews'
import { SubjectTags, inDaysInput, todayInput } from './shared'

/** Pick an external Review Panel Member whose specialization matches the article, set a due date and confirm. */
export function AssignExternalDialog({ row, onClose, onDone }: { row: AllSubmissionRow | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={!!row} onClose={onClose} width={640} title={row?.panelMemberId ? 'Reassign reviewer' : 'Assign reviewer'}
      description={row ? `${row.paperId} · ${row.title}` : undefined}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" form="assign-external-form" className="btn-primary">Confirm assignment</button></>}>
      {row && <Body key={row.paperId} row={row} onClose={onClose} onDone={onDone} />}
    </Dialog>
  )
}

function Body({ row, onClose, onDone }: { row: AllSubmissionRow; onClose: () => void; onDone: () => void }) {
  const choices = useMemo(() => externalCandidates(row.paperId), [row.paperId])
  const [selected, setSelected] = useState(() => choices.find((c) => c.user.id !== row.panelMemberId && c.matched.length > 0)?.user.id ?? '')
  const [due, setDue] = useState(inDaysInput(14))
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const group = useId()
  const dueError = !due ? 'Choose a due date.' : due < todayInput() ? 'The due date cannot be in the past.' : ''
  const selError = !selected ? 'Select a reviewer.' : ''

  return (
    <form id="assign-external-form" noValidate className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setTouched(true)
      if (dueError || selError) return
      setBusy(true)
      try {
        const m = await assignExternalReviewer({ paperId: row.paperId, reviewerId: selected, due, note })
        toast.success(`${m.name} assigned. Due ${formatDate(due)}. If no review arrives by then, the paper is assigned to a reviewer again automatically.`)
        onDone(); onClose()
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not assign the reviewer.') } finally { setBusy(false) }
    }}>
      <div><p className="label">Article subjects</p><SubjectTags subjects={row.subjects} /></div>
      <fieldset disabled={busy}>
        <legend className="label">Available external reviewers</legend>
        {choices.length === 0 ? <p className="rounded-lg bg-subtle p-3 text-sm text-muted">No active Review Panel Member holds {row.journal}. Add one in User Management.</p> : (
          <ul className="space-y-2" role="radiogroup" aria-label="External reviewers">
            {choices.map((c) => (
              <li key={c.user.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/40">
                  <input type="radio" name={group} className="mt-2 accent-indigo-600" checked={selected === c.user.id} onChange={() => setSelected(c.user.id)} />
                  <UserAvatar name={c.user.name} photo={c.user.photo} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">{c.user.name}
                      {c.user.id === row.panelMemberId && <span className="text-xs font-normal text-muted">current</span>}
                      {c.matched.length > 0 ? <Badge tone="success">{c.matched.length === row.subjects.length ? 'Full match' : 'Subject match'}</Badge> : <Badge tone="neutral">No subject match</Badge>}</span>
                    <span className="mt-1 block"><SubjectTags subjects={c.expertise} matched={c.matched} /></span>
                    <span className="mt-0.5 block text-xs text-muted">{c.workload} review{c.workload === 1 ? '' : 's'} in progress</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {touched && selError && <p role="alert" className="mt-1 text-xs text-red-600">{selError}</p>}
      </fieldset>
      <FormField label="Due date" required error={touched ? dueError : undefined} hint="If the review is not submitted by this date, the paper is assigned to a reviewer again automatically.">
        {(a) => <input {...a} type="date" className="input" min={todayInput()} value={due} disabled={busy} onChange={(e) => setDue(e.target.value)} />}
      </FormField>
      <FormField label="Note for the reviewer (optional)">{(a) => <textarea {...a} rows={2} className="input !h-auto py-2" value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />}</FormField>
    </form>
  )
}
