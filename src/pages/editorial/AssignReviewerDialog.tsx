import { useId, useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import type { Paper, StaffUser } from '@/shared/types'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { Badge } from '@/components/Badges'
import { toast } from '@/components/Toasts'
import { cn } from '@/lib/utils'
import { assignReviewer, setReviewDue } from '@/mock/api/reviews'
import { candidatesFor, type ReviewerKind } from '@/mock/data/editorial'
import { useDataStore, useSession } from '@/mock/store'
import { ReviewerTypeBadge, SubjectTags, inDaysInput, todayInput } from './shared'

interface Option {
  user: StaffUser
  kind: ReviewerKind
  eligible: number
  avgScore: number
  matched: string[]
  expertise: string[]
}

/**
 * Assign (or reassign) a reviewer for one or several papers.
 * In-house reviewers are matched by subject expertise. Review Panel Members are only offered for papers outside
 * in-house expertise, and only while the `reviewPanel` feature flag is on.
 */
export function AssignReviewerDialog({ open, onClose, papers, reassign, onDone }: {
  open: boolean; onClose: () => void; papers: Paper[]; reassign?: boolean; onDone: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} width={620}
      title={reassign ? 'Reassign reviewer' : papers.length > 1 ? `Assign reviewer to ${papers.length} papers` : 'Assign reviewer'}
      description={papers.length === 1 ? `${papers[0].id} · ${papers[0].title}` : 'Reviewers are matched to each paper by subject expertise.'}
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="assign-reviewer-form" className="btn-primary">{reassign ? 'Reassign reviewer' : 'Assign reviewer'}</button>
      </>}>
      <AssignBody papers={papers} reassign={reassign} onClose={onClose} onDone={onDone} />
    </Dialog>
  )
}

function AssignBody({ papers, reassign, onClose, onDone }: { papers: Paper[]; reassign?: boolean; onClose: () => void; onDone: () => void }) {
  const users = useDataStore((s) => s.users)
  const reviewPanelOn = useSession((s) => s.flags.reviewPanel)
  const [selected, setSelected] = useState('')
  const [due, setDue] = useState(inDaysInput(14))
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const groupId = useId()

  const { inHouse, panel, outsideCount, offPanelNote } = useMemo(() => {
    const map = new Map<string, Option>()
    let outside = 0
    for (const p of papers) {
      const c = candidatesFor(p, users, reviewPanelOn)
      if (c.outside) outside++
      for (const x of [...c.inHouse, ...c.panel]) {
        const cur = map.get(x.user.id)
        if (cur) {
          cur.eligible++
          cur.avgScore += x.score
          cur.matched = [...new Set([...cur.matched, ...x.matched])]
        } else map.set(x.user.id, { user: x.user, kind: x.kind, eligible: 1, avgScore: x.score, matched: x.matched, expertise: x.expertise })
      }
    }
    const all = [...map.values()].map((o) => ({ ...o, avgScore: Math.round(o.avgScore / o.eligible) })).sort((a, b) => b.avgScore - a.avgScore)
    return {
      inHouse: all.filter((o) => o.kind === 'in_house'),
      panel: all.filter((o) => o.kind === 'panel'),
      outsideCount: outside,
      offPanelNote: outside > 0 && !reviewPanelOn,
    }
  }, [papers, users, reviewPanelOn])

  const single = papers.length === 1 ? papers[0] : undefined
  const subjects = single ? candidatesFor(single, users, reviewPanelOn).subjects : []
  const noteMissing = !!reassign && note.trim().length < 5
  const dueInvalid = !due || due < todayInput()
  const noneSelected = !selected

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (noneSelected || noteMissing || dueInvalid) return
    setBusy(true)
    try {
      const r = await assignReviewer({ paperIds: papers.map((p) => p.id), reviewerId: selected, due, note: note.trim(), reassign })
      if (r.assigned.length === 0) toast.error(`${r.reviewer.name} cannot review the selected papers (outside their journal or status).`)
      else {
        toast.success(`${r.reviewer.name} ${reassign ? 'reassigned to' : 'assigned to'} ${r.assigned.length === 1 ? r.assigned[0] : `${r.assigned.length} papers`}${r.skipped.length ? ` · ${r.skipped.length} skipped (not eligible)` : ''}`)
        onDone()
        onClose()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not assign the reviewer.')
    } finally {
      setBusy(false)
    }
  }

  const card = (o: Option) => {
    const checked = selected === o.user.id
    return (
      <label key={o.user.id} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors', checked ? 'border-accent bg-accent-soft/50' : 'border-line hover:bg-page')}>
        <input type="radio" name={groupId} className="mt-1 accent-indigo-600" checked={checked} onChange={() => setSelected(o.user.id)} aria-label={`Select ${o.user.name}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{o.user.name}</span>
            <ReviewerTypeBadge kind={o.kind} />
            {papers.length > 1 && o.eligible < papers.length && <Badge tone="warning">Eligible for {o.eligible} of {papers.length}</Badge>}
          </span>
          <span className="mt-1.5 block"><SubjectTags subjects={o.expertise} matched={o.matched} /></span>
        </span>
        <span className="text-right" title="Share of the paper’s subjects covered by this reviewer’s expertise">
          <span className={cn('block text-lg font-semibold tabular-nums', o.avgScore >= 60 ? 'text-green-700' : o.avgScore >= 40 ? 'text-ink' : 'text-amber-700')}>{o.avgScore}%</span>
          <span className="block text-xs text-muted">match</span>
        </span>
      </label>
    )
  }

  return (
    <form id="assign-reviewer-form" onSubmit={submit} noValidate className="space-y-4">
      {single && (
        <div>
          <p className="label">Paper subjects</p>
          <SubjectTags subjects={subjects} />
        </div>
      )}

      <fieldset>
        <legend className="label">Reviewer <span className="text-red-600" aria-hidden>*</span></legend>
        <div className="space-y-2">
          {inHouse.length === 0 && <p className="rounded-lg border border-dashed border-line px-3 py-3 text-sm text-muted">No in-house reviewers are assigned to {papers.length > 1 ? 'these journals' : 'this journal'}.</p>}
          {inHouse.map(card)}
        </div>

        {(panel.length > 0 || outsideCount > 0) && (
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted"><Info size={14} aria-hidden /> Review Panel Members — for papers outside in-house expertise</p>
            <div className="space-y-2">{panel.map(card)}</div>
            {panel.length === 0 && !offPanelNote && <p className="text-sm text-muted">No Review Panel Members are available for the journal{papers.length > 1 ? 's' : ''} involved.</p>}
            {offPanelNote && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">The Review Panel is switched off in feature flags, so external members cannot be offered.</p>}
          </div>
        )}
        {panel.length === 0 && outsideCount === 0 && inHouse.length > 0 && (
          <p className="mt-3 text-xs text-muted">Review Panel Members are only offered when no in-house reviewer covers the paper’s subjects.</p>
        )}
        {touched && noneSelected && <p role="alert" className="mt-2 text-xs text-red-600">Choose a reviewer to continue.</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Review due date" required error={touched && dueInvalid ? 'Choose a date that is today or later.' : undefined}>
          {(a) => <input {...a} type="date" className="input" min={todayInput()} value={due} onChange={(e) => setDue(e.target.value)} />}
        </FormField>
      </div>
      <FormField label={reassign ? 'Reason for reassigning' : 'Note to reviewer (optional)'} required={reassign} error={touched && noteMissing ? 'Add a short reason (at least 5 characters).' : undefined}>
        {(a) => <textarea {...a} rows={3} className="input !h-auto py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder={reassign ? 'For example: reviewer is unavailable until next month.' : 'Anything the reviewer should know, such as a focus area.'} />}
      </FormField>
      {busy && <p role="status" className="text-xs text-muted">Assigning…</p>}
    </form>
  )
}

/** Change a review due date (reason optional, logged in the timeline). */
export function SetDueDialog({ open, onClose, paper, onDone }: { open: boolean; onClose: () => void; paper?: Paper; onDone: () => void }) {
  return (
    <Dialog open={open && !!paper} onClose={onClose} title="Set review due date" description={paper ? `${paper.id} · ${paper.title}` : undefined}
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="set-due-form" className="btn-primary">Save due date</button>
      </>}>
      {paper && <DueBody paper={paper} onClose={onClose} onDone={onDone} />}
    </Dialog>
  )
}

function DueBody({ paper, onClose, onDone }: { paper: Paper; onClose: () => void; onDone: () => void }) {
  const [due, setDue] = useState(paper.reviewDue ? paper.reviewDue.slice(0, 10) : inDaysInput(7))
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const invalid = !due || due < todayInput()
  return (
    <form id="set-due-form" noValidate className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setTouched(true)
      if (invalid) return
      try {
        await setReviewDue(paper.id, due, reason.trim())
        toast.success(`Review due date for ${paper.id} updated`)
        onDone(); onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update the due date.')
      }
    }}>
      <FormField label="New due date" required error={touched && invalid ? 'Choose a date that is today or later.' : undefined}>
        {(a) => <input {...a} type="date" className="input" min={todayInput()} value={due} onChange={(e) => setDue(e.target.value)} />}
      </FormField>
      <FormField label="Reason (optional)">
        {(a) => <textarea {...a} rows={2} className="input !h-auto py-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: reviewer requested an extension." />}
      </FormField>
    </form>
  )
}
