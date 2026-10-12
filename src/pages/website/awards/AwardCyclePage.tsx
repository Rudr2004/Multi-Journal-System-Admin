import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, BadgeCheck, CheckCircle2, ExternalLink, Pencil, Plus, Send, Trash2, Trophy, UserCheck, X } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { SectionCard } from '@/components/Card'
import { DataTable, type Column } from '@/components/DataTable'
import { Badge } from '@/components/Badges'
import { ConfirmDialog } from '@/components/Dialog'
import { DescriptionList, Switch } from '@/components/Form'
import { ReasonDialog } from '@/components/ReasonDialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { usePermission } from '@/permissions/hooks'
import { formatDate } from '@/shared/formatters'
import { AWARD_TYPE_LABEL, type AwardCycle, type Nomination } from '@/mock/data/website'
import {
  addToShortlist, approveCycle, beginShortlisting, deleteCycle, getCycle, listCandidates, openNominations, publishCycle,
  removeFromShortlist, returnToShortlisting, submitForApproval, updateNomination, type Candidate,
} from '@/mock/api/awards'
import { JournalBadge } from '@/components/Badges'
import { AwardBadge, AwardCertificate } from './AwardCertificate'
import { CycleDialog } from './CycleDialog'
import { CycleStatusBadge, CycleStepper } from './parts'

function FlagBadges({ c }: { c: Candidate }) {
  if (c.flags.length === 0) return <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={14} aria-hidden /> No duplicates</span>
  return (
    <div className="flex max-w-[280px] flex-col items-start gap-1">
      {c.flags.map((f) => (
        <Badge key={f.cycleId} tone={f.kind === 'awarded' ? 'danger' : 'warning'} className="!whitespace-normal text-left">
          <AlertTriangle size={12} aria-hidden className="shrink-0" />
          {f.samePaper ? 'Paper' : 'Author'} {f.kind === 'awarded' ? 'already awarded' : 'already shortlisted'} in {f.cycleName}
        </Badge>
      ))}
    </div>
  )
}

function NominationRow({ cycle, n, canEdit, onChanged }: { cycle: AwardCycle; n: Nomination; canEdit: boolean; onChanged: () => void }) {
  const [note, setNote] = useState(n.note)
  const [noteError, setNoteError] = useState(false)
  const selecting = cycle.status === 'shortlisting'
  const editableList = cycle.status === 'nominations' || cycle.status === 'shortlisting'
  const run = async (fn: () => Promise<void>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); onChanged() } catch (e) { toast.error((e as Error).message) }
  }
  return (
    <li className={`rounded-lg border p-3 ${n.winner ? 'border-amber-300 bg-amber-50/50' : 'border-line'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{n.name}{n.winner && <Badge tone="warning"><Trophy size={12} aria-hidden /> Winner</Badge>}</p>
          <p className="text-xs text-muted">{n.affiliation}</p>
          {n.paperId && <p className="mt-1 text-xs"><span className="whitespace-nowrap font-medium">{n.paperId}</span> <span className="line-clamp-2 text-muted" title={n.paperTitle}>{n.paperTitle}</span></p>}
        </div>
        <div className="flex items-center gap-3">
          {selecting && canEdit && <div className="w-32"><Switch label="Winner" checked={n.winner} onChange={(w) => run(() => updateNomination(cycle.id, n.id, { winner: w }))} /></div>}
          {editableList && canEdit && <button type="button" className="btn-ghost h-8 px-2" aria-label={`Remove ${n.name} from shortlist`} onClick={() => run(() => removeFromShortlist(cycle.id, n.id), `${n.name} removed from the shortlist.`)}><X size={15} strokeWidth={1.5} /></button>}
        </div>
      </div>
      {(n.winner || n.note) && (
        <div className="mt-2">
          <label htmlFor={`note-${n.id}`} className="label">Selection note {n.winner && <span className="text-red-600" aria-hidden>*</span>}</label>
          {selecting && canEdit ? (
            <>
              <textarea id={`note-${n.id}`} rows={2} value={note} className="input !h-auto py-2" aria-invalid={noteError}
                placeholder="Why this nominee won. Shown to the approver and kept in the record." onChange={(e) => setNote(e.target.value)}
                onBlur={() => { setNoteError(n.winner && note.trim().length < 10); if (note !== n.note) void run(() => updateNomination(cycle.id, n.id, { note })) }} />
              {noteError && <p role="alert" className="mt-1 text-xs text-red-600">Add a note of at least 10 characters before submitting.</p>}
            </>
          ) : <p className="text-sm text-muted">{n.note || '—'}</p>}
        </div>
      )}
    </li>
  )
}

function CycleView({ cycle, reload }: { cycle: AwardCycle; reload: () => void }) {
  const navigate = useNavigate()
  const awards = usePermission('awards')
  const approval = usePermission('awardApproval')
  const canManage = awards.can('manage')
  const canApprove = approval.can('approve')
  const approveWhy = 'Approving award results is a Super Admin action.'
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<null | 'submit' | 'approve' | 'publish' | 'delete'>(null)
  const [returning, setReturning] = useState(false)
  const [dup, setDup] = useState<Candidate | null>(null)

  const winners = cycle.nominations.filter((n) => n.winner)
  const sourcing = cycle.status === 'nominations' || cycle.status === 'shortlisting'
  const shortlistKey = cycle.nominations.map((n) => n.key).join('|')
  const { data: candidates, loading: candLoading, error: candError, reload: reloadCandidates } = useAsync(
    () => (sourcing ? listCandidates(cycle.id) : Promise.resolve([] as Candidate[])),
    [cycle.id, sourcing, shortlistKey, cycle.periodStart, cycle.periodEnd],
  )

  const run = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast.success(ok); reload() } catch (e) { toast.error((e as Error).message) }
  }
  const add = (c: Candidate) => run(() => addToShortlist(cycle.id, c), `${c.name} added to the shortlist.`)
  const onShortlisted = new Set(cycle.nominations.map((n) => n.key))

  const candColumns: Column<Candidate>[] = [
    {
      id: 'name', header: 'Candidate', locked: true, sort: (c) => c.name,
      cell: (c) => <div><p className="font-medium">{c.name}</p><p className="text-xs text-muted">{c.affiliation}{c.affiliation && c.country ? ', ' : ''}{c.country}</p></div>,
    },
    {
      id: 'work', header: cycle.type === 'best_paper' ? 'Paper' : 'Published work', sort: (c) => c.title,
      cell: (c) => (
        <div className="max-w-[360px]">
          {c.paperId && <Link to={`/submissions/${c.paperId}`} className="whitespace-nowrap font-medium text-accent hover:underline">{c.paperId}</Link>}
          <p className="line-clamp-2 text-sm text-muted" title={c.title}>{c.title}</p>
          {!c.paperId && <p className="whitespace-nowrap text-xs text-faint">{c.paperIds.join(', ')}</p>}
        </div>
      ),
    },
    { id: 'published', header: 'Published', sort: (c) => c.publishedOn, cell: (c) => <span className="whitespace-nowrap">{formatDate(c.publishedOn)}</span> },
    { id: 'dup', header: 'Duplicate check', sort: (c) => c.flags.length, cell: (c) => <FlagBadges c={c} /> },
    {
      id: 'action', header: '', locked: true,
      cell: (c) => onShortlisted.has(c.key)
        ? <Badge tone="success">On shortlist</Badge>
        : <GuardedButton allowed={canManage} why={awards.why('manage')} className="btn-secondary h-8" onClick={() => (c.flags.some((f) => f.kind === 'awarded') ? setDup(c) : add(c))}><Plus size={14} strokeWidth={1.5} aria-hidden /> Shortlist</GuardedButton>,
    },
  ]

  const nextStep = (() => {
    switch (cycle.status) {
      case 'draft':
        return { text: 'Open nominations to list eligible candidates from published papers in the period.', actions: <GuardedButton allowed={canManage} why={awards.why('manage')} className="btn-primary" onClick={() => run(() => openNominations(cycle.id), 'Nominations are open.')}>Open nominations</GuardedButton> }
      case 'nominations':
        return { text: 'Review the eligible candidates below and shortlist the strongest. When the shortlist is ready, begin shortlisting to choose winners.', actions: <GuardedButton allowed={canManage && cycle.nominations.length > 0} why={canManage ? 'Add at least one candidate to the shortlist first.' : awards.why('manage')} className="btn-primary" onClick={() => run(() => beginShortlisting(cycle.id), 'Shortlisting has begun.')}>Begin shortlisting</GuardedButton> }
      case 'shortlisting':
        return { text: 'Mark the winners, write a short note for each, then submit the results for approval.', actions: <GuardedButton allowed={canManage && winners.length > 0} why={canManage ? 'Select at least one winner first.' : awards.why('manage')} className="btn-primary" onClick={() => setConfirm('submit')}><Send size={15} strokeWidth={1.5} aria-hidden /> Submit for approval</GuardedButton> }
      case 'pending_approval':
        return {
          text: `Submitted ${cycle.submittedAt ? formatDate(cycle.submittedAt) : ''}. A Super Admin must approve the results before certificates can be issued.`,
          actions: <>
            <GuardedButton allowed={canApprove} why={approveWhy} className="btn-secondary" onClick={() => setReturning(true)}>Return to shortlisting</GuardedButton>
            <GuardedButton allowed={canApprove} why={approveWhy} className="btn-primary" onClick={() => setConfirm('approve')}><BadgeCheck size={15} strokeWidth={1.5} aria-hidden /> Approve results</GuardedButton>
          </>,
        }
      case 'approved':
        return { text: `Approved by ${cycle.approvedBy ?? 'a Super Admin'}${cycle.approvedAt ? ` on ${formatDate(cycle.approvedAt)}` : ''}. Check the certificates and badge below, then publish to the Awards page.`, actions: <GuardedButton allowed={canManage} why={awards.why('manage')} className="btn-primary" onClick={() => setConfirm('publish')}>Publish to Awards page</GuardedButton> }
      case 'published':
        return { text: `Published on ${cycle.publishedAt ? formatDate(cycle.publishedAt) : ''}. The winners are live on the ${cycle.journal} Awards page.`, actions: null }
    }
  })()

  return (
    <>
      <PageHeader title={cycle.name} crumbs={[{ label: cycle.name }]} description={`${AWARD_TYPE_LABEL[cycle.type]} · ${formatDate(cycle.periodStart)} to ${formatDate(cycle.periodEnd)}`}
        actions={<>
          <CycleStatusBadge status={cycle.status} />
          {['draft', 'nominations', 'shortlisting'].includes(cycle.status) && <GuardedButton allowed={canManage} why={awards.why('manage')} className="btn-secondary" onClick={() => setEditing(true)}><Pencil size={15} strokeWidth={1.5} aria-hidden /> Edit cycle</GuardedButton>}
          {cycle.status === 'draft' && <GuardedButton allowed={canManage} why={awards.why('manage')} className="btn-ghost hover:!text-red-600" onClick={() => setConfirm('delete')}><Trash2 size={15} strokeWidth={1.5} aria-hidden /> Delete draft</GuardedButton>}
        </>} />

      <div className="mb-5 card p-4"><CycleStepper status={cycle.status} /></div>

      {cycle.returnReason && cycle.status === 'shortlisting' && (
        <div role="alert" className="mb-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
          <p><span className="font-semibold">Returned for changes.</span> {cycle.returnReason}</p>
        </div>
      )}

      <div className="mb-5 card flex flex-wrap items-center justify-between gap-4 border-accent/30 bg-accent-soft/40 p-4">
        <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-wide text-accent">Next step</p><p className="text-sm">{nextStep.text}</p></div>
        <div className="flex flex-wrap gap-2">{nextStep.actions}</div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {sourcing && (
            <section aria-labelledby="cand-h">
              <div className="mb-2 flex items-center justify-between"><h2 id="cand-h" className="text-[16px] font-semibold">Eligible candidates</h2><span className="text-xs text-muted">{cycle.type === 'best_paper' ? 'Published papers' : 'Authors of published papers'} from {formatDate(cycle.periodStart)} to {formatDate(cycle.periodEnd)}</span></div>
              <DataTable<Candidate> id={`award-cand-${cycle.type}`} data={candidates ?? []} columns={candColumns} rowKey={(c) => c.key} loading={candLoading && !candidates} error={!!candError} onRetry={reloadCandidates} pageSize={10}
                search={{ placeholder: 'Search candidates or papers…', text: (c) => `${c.name} ${c.title} ${c.paperIds.join(' ')} ${c.affiliation}` }}
                empty={{ icon: UserCheck, title: 'No eligible candidates in this period', hint: 'Only published papers inside the period are listed. Edit the cycle to widen the dates.' }} />
            </section>
          )}
          {!sourcing && (
            <SectionCard title={winners.length ? `Winners (${winners.length})` : 'Shortlist'}>
              {cycle.nominations.length === 0 ? <EmptyState icon={Trophy} title="Nothing on the shortlist yet" hint="Open nominations to start choosing candidates." />
                : <ul className="space-y-3">{(winners.length ? winners : cycle.nominations).map((n) => <NominationRow key={n.id} cycle={cycle} n={n} canEdit={false} onChanged={reload} />)}</ul>}
            </SectionCard>
          )}

          {(cycle.status === 'approved' || cycle.status === 'published') && winners.length > 0 && (
            <SectionCard title="Certificates and badge">
              <p className="mb-4 text-sm text-muted">Preview of what each winner receives. {cycle.status === 'approved' ? 'Certificates are issued when you publish.' : 'Certificates were issued on publication.'}</p>
              <div className="space-y-6">
                {winners.map((w) => (
                  <div key={w.id} className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_140px]">
                    <AwardCertificate cycle={cycle} winner={w} />
                    <div className="flex flex-col items-center gap-2"><AwardBadge cycle={cycle} /><p className="text-center text-xs text-muted">Badge for {w.name}</p></div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {cycle.status === 'published' && (
            <SectionCard title="On the Awards page">
              <ul className="divide-y divide-line">
                {winners.map((w) => (
                  <li key={w.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <AwardBadge cycle={cycle} size={72} />
                    <div className="min-w-0"><p className="font-semibold">{w.name}</p><p className="text-sm text-muted">{w.affiliation}</p>{w.paperTitle && <p className="line-clamp-2 text-sm" title={w.paperTitle}>{w.paperTitle}</p>}</div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex items-center gap-1 text-xs text-muted"><ExternalLink size={12} aria-hidden /> Live on the {cycle.journal} website under Awards.</p>
            </SectionCard>
          )}
        </div>

        <div className="space-y-5">
          <SectionCard title="Cycle details">
            <DescriptionList cols={1} items={[
              { label: 'Journal', value: <JournalBadge code={cycle.journal} /> },
              { label: 'Award', value: AWARD_TYPE_LABEL[cycle.type] },
              { label: 'Period', value: `${formatDate(cycle.periodStart)} to ${formatDate(cycle.periodEnd)}` },
              { label: 'Created', value: <>{cycle.createdBy}, <RelativeTime value={cycle.createdAt} /></> },
              { label: 'Criteria', value: <span className="text-sm text-muted">{cycle.criteria}</span> },
            ]} />
          </SectionCard>
          {sourcing && (
            <SectionCard title={`Shortlist (${cycle.nominations.length})`}>
              {cycle.nominations.length === 0 ? <p className="text-sm text-muted">Shortlist candidates from the table to start. {cycle.status === 'nominations' && 'Winners are chosen in the Shortlisting stage.'}</p>
                : <ul className="space-y-3">{cycle.nominations.map((n) => <NominationRow key={n.id} cycle={cycle} n={n} canEdit={canManage} onChanged={reload} />)}</ul>}
            </SectionCard>
          )}
        </div>
      </div>

      {editing && <CycleDialog journals={[cycle.journal]} cycle={cycle} onClose={() => setEditing(false)} onDone={reload} />}
      <ConfirmDialog open={confirm === 'submit'} onClose={() => setConfirm(null)} confirmLabel="Submit for approval" title="Submit the results for approval?"
        consequences={[`Send ${winners.length} ${winners.length === 1 ? 'winner' : 'winners'} to a Super Admin for approval`, 'Lock the shortlist and winner notes until it is approved or returned', 'Record the change in the audit log']}
        onConfirm={() => run(() => submitForApproval(cycle.id), 'Submitted for approval.')} />
      <ConfirmDialog open={confirm === 'approve'} onClose={() => setConfirm(null)} confirmLabel="Approve results" title="Approve these award results?"
        consequences={[`Confirm ${winners.map((w) => w.name).join(', ')} as ${winners.length === 1 ? 'the winner' : 'winners'}`, 'Unlock certificate and badge previews', 'Nothing is public until the cycle is published']}
        onConfirm={() => run(() => approveCycle(cycle.id), 'Results approved.')} />
      <ConfirmDialog open={confirm === 'publish'} onClose={() => setConfirm(null)} confirmLabel="Publish" title="Publish to the Awards page?"
        consequences={[`Show ${winners.length === 1 ? 'the winner' : `${winners.length} winners`} and badge publicly on the ${cycle.journal} Awards page`, 'Make the certificates available to the winners', 'This is a public action and cannot be taken back from here']}
        onConfirm={() => run(() => publishCycle(cycle.id), 'Published to the Awards page.')} />
      <ConfirmDialog open={confirm === 'delete'} danger onClose={() => setConfirm(null)} confirmLabel="Delete draft" title="Delete this draft cycle?"
        consequences={['Permanently remove the cycle and its settings', 'This cannot be undone']}
        onConfirm={async () => { try { await deleteCycle(cycle.id); toast.success('Draft cycle deleted.'); navigate('/awards') } catch (e) { toast.error((e as Error).message) } }} />
      <ReasonDialog open={returning} onClose={() => setReturning(false)} title="Return to shortlisting" confirmLabel="Return" label="What needs to change?"
        consequences={['The shortlist is unlocked so the winners can be reconsidered', 'The reason is shown to the team and recorded in the audit log']}
        onSubmit={(reason) => run(() => returnToShortlisting(cycle.id, reason), 'Returned to shortlisting.')} />
      <ConfirmDialog open={!!dup} onClose={() => setDup(null)} confirmLabel="Shortlist anyway" title={`${dup?.name ?? ''} has already won`}
        consequences={dup?.flags.filter((f) => f.kind === 'awarded').map((f) => `${f.samePaper ? 'This paper' : 'This author'} was awarded in ${f.cycleName}`) ?? []}
        onConfirm={() => dup && add(dup)} />
    </>
  )
}

export default function AwardCyclePage() {
  const { cycleId = '' } = useParams()
  const { data, loading, error, reload } = useAsync(() => getCycle(cycleId), [cycleId])
  if (loading && !data) return <div className="space-y-4" aria-busy="true" aria-label="Loading cycle"><Skeleton className="h-10 w-80" /><Skeleton className="h-16" /><Skeleton className="h-72" /></div>
  if (error || !data) return <div className="card"><ErrorState message={error?.message ?? 'We could not load this cycle.'} onRetry={reload} /></div>
  return <CycleView cycle={data} reload={reload} />
}
