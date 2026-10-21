import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, Download, KeyRound, Presentation, TicketPlus, UserPlus } from 'lucide-react'
import { Drawer } from '@/components/Dialog'
import { Badge, JournalBadge } from '@/components/Badges'
import { DescriptionList } from '@/components/Form'
import { ReasonDialog } from '@/components/ReasonDialog'
import { Timeline } from '@/components/Timeline'
import { FileRow } from '@/components/Viewers'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { usePermission } from '@/permissions/hooks'
import { useSession } from '@/mock/store'
import { formatDateTime } from '@/shared/formatters'
import { BOARD_GROUPS, FORM_STATUS_LABEL, FORM_TYPE_LABEL, type BoardGroup, type FormStatus, type FormSubmission } from '@/mock/data/website'
import {
  addBoardMemberFromSubmission, addNote, convertToTicket, createReviewPanelAccount, markConferenceHandled, setSubmissionStatus,
} from '@/mock/api/forms'
import { FormStatusBadge } from './parts'

const ACTIONS: { status: FormStatus; label: string; danger?: boolean }[] = [
  { status: 'under_review', label: 'Mark under review' },
  { status: 'approved', label: 'Approve' },
  { status: 'on_hold', label: 'Put on hold' },
  { status: 'rejected', label: 'Reject', danger: true },
]

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex gap-2">
      <input readOnly aria-label="Invitation link" value={value} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn-secondary shrink-0" onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { toast.error('Copy failed. Select the link and copy it manually.') }
      }}>{copied ? <><Check size={14} aria-hidden /> Copied</> : <><Copy size={14} aria-hidden /> Copy</>}</button>
    </div>
  )
}

function NextStep({ s, canWork, why, onChanged }: { s: FormSubmission; canWork: boolean; why?: string; onChanged: () => void }) {
  const navigate = useNavigate()
  const panelOn = useSession((x) => x.flags.reviewPanel)
  const wanted = s.fields.find((f) => f.label === 'Position applied for')?.value
  const [group, setGroup] = useState<BoardGroup>(wanted === 'Associate Editor' ? 'Associate Editors' : 'Editorial Board')
  const [busy, setBusy] = useState(false)
  const [invite, setInvite] = useState<string>()

  if (s.status !== 'approved') return null

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn(); onChanged() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  if (s.outcome) {
    const link = s.outcome.kind === 'account' ? (invite ?? s.outcome.link) : undefined
    return (
      <section aria-label="Next step completed" className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-green-800"><Check size={16} aria-hidden /> {s.outcome.label}</p>
        <p className="mt-0.5 text-xs text-green-700">Completed <RelativeTime value={s.outcome.at} /></p>
        {link && <div className="mt-3"><p className="mb-1 text-xs text-green-800">Invitation link (valid for 7 days). Send it to the reviewer so they can set a password.</p><CopyField value={link} /></div>}
        {s.outcome.kind !== 'account' && s.outcome.link && <button type="button" className="mt-2 text-sm font-medium text-accent hover:underline" onClick={() => navigate(s.outcome!.link!)}>Open {s.outcome.link}</button>}
      </section>
    )
  }

  const common = 'Approved. Complete the next step to finish this request.'
  return (
    <section aria-label="Next step" className="rounded-lg border border-accent/30 bg-accent-soft/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Next step</p>
      {s.type === 'reviewer' && (
        <>
          <p className="mt-1 text-sm">{common} This creates an invited Review Panel Member account for {s.journal}.</p>
          <div className="mt-3">
            <GuardedButton allowed={canWork && panelOn} why={panelOn ? why : 'Review Panel is switched off'} className="btn-primary" disabled={busy}
              onClick={() => run(async () => {
                const r = await createReviewPanelAccount(s.id)
                setInvite(r.inviteLink)
                toast.success(`Account created for ${r.user.name}. Share the invitation link.`)
              })}><KeyRound size={15} strokeWidth={1.5} aria-hidden /> Create Review Panel Member account</GuardedButton>
          </div>
        </>
      )}
      {s.type === 'board' && (
        <>
          <p className="mt-1 text-sm">{common} The applicant is added to the {s.journal} editorial board and shown on the website.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="board-group">Role group</label>
            <select id="board-group" className="input !w-auto" value={group} onChange={(e) => setGroup(e.target.value as BoardGroup)}>
              {BOARD_GROUPS.filter((g) => g !== 'Editor-in-Chief' && g !== 'Managing Editor').map((g) => <option key={g}>{g}</option>)}
            </select>
            <GuardedButton allowed={canWork} why={why} className="btn-primary" disabled={busy}
              onClick={() => run(async () => { await addBoardMemberFromSubmission(s.id, group); toast.success(`${s.name} added to the ${s.journal} board as ${group}.`) })}><UserPlus size={15} strokeWidth={1.5} aria-hidden /> Add board member</GuardedButton>
          </div>
        </>
      )}
      {s.type === 'conference' && (
        <>
          <p className="mt-1 text-sm">{common} Create the conference record in Conferences using the details below.</p>
          <div className="mt-3">
            <GuardedButton allowed={canWork} why={why} className="btn-primary" disabled={busy}
              onClick={() => run(async () => { await markConferenceHandled(s.id); toast.success('Opening Conferences…'); navigate('/conferences') })}><Presentation size={15} strokeWidth={1.5} aria-hidden /> Create conference</GuardedButton>
          </div>
        </>
      )}
      {s.type === 'enquiry' && (
        <>
          <p className="mt-1 text-sm">{common} Convert it to a helpdesk ticket so support can reply.</p>
          <div className="mt-3">
            <GuardedButton allowed={canWork} why={why} className="btn-primary" disabled={busy}
              onClick={() => run(async () => { const t = await convertToTicket(s.id); toast.success(`Ticket ${t.id} created in Helpdesk.`) })}><TicketPlus size={15} strokeWidth={1.5} aria-hidden /> Convert to ticket</GuardedButton>
          </div>
        </>
      )}
    </section>
  )
}

function Detail({ s, onChanged }: { s: FormSubmission; onChanged: () => void }) {
  const { can, why } = usePermission('forms')
  const canWork = can('work')
  const [reasonFor, setReasonFor] = useState<'rejected' | 'on_hold' | null>(null)
  const [note, setNote] = useState('')

  const change = async (status: FormStatus, reason?: string) => {
    try { await setSubmissionStatus(s.id, status, reason); toast.success(`Marked as ${FORM_STATUS_LABEL[status].toLowerCase()}.`); onChanged() } catch (e) { toast.error((e as Error).message) }
  }
  const lockedByOutcome = !!s.outcome

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <JournalBadge code={s.journal} /> <Badge>{FORM_TYPE_LABEL[s.type]}</Badge> <FormStatusBadge status={s.status} />
        <span className="ml-auto text-xs text-muted">{s.id} · received {formatDateTime(s.receivedAt)}</span>
      </div>
      <div>
        <h3 className="text-base font-semibold">{s.subject}</h3>
        <div className="mt-3"><DescriptionList items={[
          { label: 'Name', value: s.name },
          { label: 'Email', value: <a className="text-accent hover:underline" href={`mailto:${s.email}`}>{s.email}</a> },
          { label: 'Affiliation', value: s.affiliation },
          { label: 'Country', value: s.country },
        ]} /></div>
      </div>

      <section aria-label="Submitted details">
        <h4 className="mb-2 text-sm font-semibold">Submitted details</h4>
        <dl className="divide-y divide-line rounded-lg border border-line">
          {s.fields.map((f) => <div key={f.label} className="px-3 py-2.5"><dt className="text-xs text-muted">{f.label}</dt><dd className="mt-0.5 whitespace-pre-wrap text-sm">{f.value}</dd></div>)}
        </dl>
      </section>

      {s.resume && (
        <section aria-label="Resume">
          <h4 className="mb-2 text-sm font-semibold">Resume</h4>
          <FileRow name={s.resume.name} meta={s.resume.size} action={<button type="button" className="btn-secondary h-8" onClick={() => toast.info(`Downloading ${s.resume!.name} (prototype: no file is stored).`)}><Download size={14} strokeWidth={1.5} aria-hidden /> Download</button>} />
        </section>
      )}

      <section aria-label="Decision">
        <h4 className="mb-2 text-sm font-semibold">Decision</h4>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.filter((a) => a.status !== s.status).map((a) => (
            <GuardedButton key={a.status} allowed={canWork && !lockedByOutcome} why={lockedByOutcome ? 'The next step is already complete, so the status is locked.' : why()}
              className={a.danger ? 'btn-secondary !text-red-700' : a.status === 'approved' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => (a.status === 'rejected' || a.status === 'on_hold' ? setReasonFor(a.status) : change(a.status))}>{a.label}</GuardedButton>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Rejecting or putting on hold needs a reason, which is saved with the submission.</p>
      </section>

      <NextStep s={s} canWork={canWork} why={why()} onChanged={onChanged} />

      <section aria-label="Internal notes">
        <h4 className="mb-2 text-sm font-semibold">Internal notes</h4>
        <p className="mb-2 text-xs text-muted">Only staff see these. They are never shown to the applicant.</p>
        <ul className="mb-3 space-y-2">
          {s.notes.length === 0 && <li className="text-sm text-muted">No notes yet.</li>}
          {s.notes.map((n) => <li key={n.id} className="rounded-md bg-subtle px-3 py-2 text-sm"><p>{n.text}</p><p className="mt-0.5 text-xs text-muted">{n.author} · <RelativeTime value={n.at} /></p></li>)}
        </ul>
        <label htmlFor="form-note" className="sr-only">Add an internal note</label>
        <textarea id="form-note" rows={2} className="input !h-auto py-2" placeholder="Add a note for the team…" value={note} disabled={!canWork} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-2 flex justify-end">
          <GuardedButton allowed={canWork} why={why()} className="btn-secondary" disabled={note.trim().length === 0}
            onClick={async () => { await addNote(s.id, note); setNote(''); toast.success('Note added.'); onChanged() }}>Add note</GuardedButton>
        </div>
      </section>

      <section aria-label="History">
        <h4 className="mb-3 text-sm font-semibold">History</h4>
        <Timeline items={[...s.history].reverse().map((h) => ({ id: h.id, at: h.at, actor: h.actor, text: h.actor === 'Website form' ? 'received the submission' : `set the status to ${FORM_STATUS_LABEL[h.status]}`, note: h.reason }))} />
      </section>

      <ReasonDialog open={!!reasonFor} onClose={() => setReasonFor(null)} danger={reasonFor === 'rejected'} confirmLabel={reasonFor === 'rejected' ? 'Reject' : 'Put on hold'}
        title={reasonFor === 'rejected' ? `Reject ${s.name}'s submission` : `Put ${s.name}'s submission on hold`}
        description="The reason is saved with the submission and in the audit log."
        onSubmit={(r) => { if (reasonFor) void change(reasonFor, r) }} />
    </div>
  )
}

export function FormDetailDrawer({ submission, onClose, onChanged }: { submission?: FormSubmission; onClose: () => void; onChanged: () => void }) {
  return (
    <Drawer open={!!submission} onClose={onClose} title={submission ? `${FORM_TYPE_LABEL[submission.type]}: ${submission.name}` : 'Submission'} width={580}>
      {submission && <Detail s={submission} onChanged={onChanged} />}
    </Drawer>
  )
}
