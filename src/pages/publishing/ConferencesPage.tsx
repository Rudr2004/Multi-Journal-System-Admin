import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Presentation } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { Dialog } from '@/components/Dialog'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals, useScopeJournals } from '@/lib/scope'
import { usePermission } from '@/permissions/hooks'
import { createConference, listConferences, type ConferenceRow } from '@/mock/api/conferences'
import { conferenceStatus } from '@/mock/data/publishing'
import { formatDate, formatMoney } from '@/shared/formatters'
import { ConferenceProductionList } from './ConferenceProduction'
import { ConferenceFields, conferenceSchema, toFormValues, toInput } from './conferenceForm'

const dateRange = (c: ConferenceRow) => (c.startDate === c.endDate ? formatDate(c.startDate) : `${formatDate(c.startDate)} – ${formatDate(c.endDate)}`)

/** Editor and Super Admin manage conferences; the Associate Editor only completes production of conference papers. */
export function ConferencesPage() {
  const perm = usePermission('conferences')
  return perm.can('manage') ? <ConferencesManager /> : <ConferenceProductionList />
}

function ConferencesManager() {
  const journals = useScopeJournals()
  const all = useIsAllJournals()
  const perm = usePermission('conferences')
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState('')
  const r = useAsync(() => listConferences(journals), [journals.join()])

  const rows = useMemo(() => (r.data ?? []).filter((c) => !status || conferenceStatus(c, c.issue).label === status), [r.data, status])
  const statuses = useMemo(() => [...new Set((r.data ?? []).map((c) => conferenceStatus(c, c.issue).label))], [r.data])

  const columns: Column<ConferenceRow>[] = [
    { id: 'name', header: 'Conference', locked: true, sort: (c) => c.shortName, cell: (c) => (
      <div className="min-w-0">
        <Link to={`/conferences/${c.id}`} className="whitespace-nowrap font-medium text-accent hover:underline">{c.shortName}</Link>
        <p className="line-clamp-2 max-w-[360px] text-sm text-muted" title={c.name}>{c.name}</p>
      </div>
    ) },
    ...(all ? [{ id: 'journal', header: 'Journal', sort: (c: ConferenceRow) => c.journal, cell: (c: ConferenceRow) => <JournalBadge code={c.journal} /> }] : []),
    { id: 'dates', header: 'Dates', sort: (c) => c.startDate, cell: (c) => <span className="whitespace-nowrap">{dateRange(c)}</span> },
    { id: 'venue', header: 'Venue', cell: (c) => <div><p>{c.venue}</p><p className="text-xs text-muted">{c.city}</p></div> },
    { id: 'deadline', header: 'Submission deadline', sort: (c) => c.submissionDeadline, cell: (c) => <span className="whitespace-nowrap">{formatDate(c.submissionDeadline)}</span> },
    { id: 'linked', header: 'Submissions', align: 'right', sort: (c) => c.linkedCount, cell: (c) => <span className="tabular-nums">{c.linkedCount}</span> },
    { id: 'apc', header: 'APC', cell: (c) => (c.apc ? <span className="whitespace-nowrap">{formatMoney(c.apc.amount, c.apc.currency)}</span> : <span className="text-muted">None</span>) },
    { id: 'status', header: 'Status', cell: (c) => { const s = conferenceStatus(c, c.issue); return <Badge tone={s.tone}>{s.label}</Badge> } },
    { id: 'actions', header: 'Actions', locked: true, align: 'right', cell: (c) => (
      <Link to={`/conferences/${c.id}`} className="btn-secondary !h-8 whitespace-nowrap" aria-label={`Edit ${c.shortName}`}><Pencil size={14} strokeWidth={1.5} aria-hidden /> Edit</Link>
    ) },
  ]

  return (
    <>
      <PageHeader title="Conferences" description="Conference listings, linked submissions and proceedings issues."
        actions={<GuardedButton className="btn-primary" allowed={perm.can('manage')} why={perm.why('manage')} onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New conference</GuardedButton>} />
      <DataTable id="conferences" data={rows} columns={columns} rowKey={(c) => c.id} loading={r.loading && !r.data} error={!!r.error} onRetry={r.reload}
        onRowClick={(c) => navigate(`/conferences/${c.id}`)}
        search={{ placeholder: 'Search conferences', text: (c) => `${c.shortName} ${c.name} ${c.city} ${c.organiser}` }}
        filters={<SelectFilter label="Status" value={status} onChange={setStatus} options={statuses.map((s) => ({ value: s, label: s }))} />}
        empty={{ icon: Presentation, title: 'No conferences yet', hint: 'Add a conference to collect linked submissions and publish its proceedings.', action: perm.can('manage') ? <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New conference</button> : undefined }} />
      <NewConferenceDialog open={creating} onClose={() => setCreating(false)} journals={journals} />
    </>
  )
}

function NewConferenceDialog({ open, onClose, journals }: { open: boolean; onClose: () => void; journals: ReturnType<typeof useScopeJournals> }) {
  return (
    <Dialog open={open} onClose={onClose} width={720} title="New conference" description="Add the essentials now; key members, files, photos and linked submissions can be added on the conference page."
      footer={<><button className="btn-secondary" type="button" onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" form="new-conf-form">Create conference</button></>}>
      <NewConferenceForm journals={journals} onDone={onClose} />
    </Dialog>
  )
}

function NewConferenceForm({ journals, onDone }: { journals: ReturnType<typeof useScopeJournals>; onDone: () => void }) {
  const navigate = useNavigate()
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({ resolver: zodResolver(conferenceSchema), defaultValues: toFormValues(undefined, journals[0]) })
  const submit = handleSubmit(async (v) => {
    try {
      const c = await createConference(toInput(v))
      toast.success(`${c.shortName} created`)
      onDone()
      navigate(`/conferences/${c.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, () => toast.error('Please fix the highlighted fields.'))
  return (
    <form id="new-conf-form" onSubmit={submit} noValidate>
      <ConferenceFields register={register} errors={errors} watch={watch} journals={journals} setApc={(on) => setValue('apcEnabled', on, { shouldDirty: true })} />
    </form>
  )
}
