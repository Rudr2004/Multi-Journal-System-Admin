import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileText, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { JournalBadge, StatusBadge } from '@/components/Badges'
import { Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { RelativeTime } from '@/components/Time'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useIsAllJournals } from '@/lib/scope'
import { useAsync } from '@/lib/useAsync'
import { usePermission } from '@/permissions/hooks'
import { formatDate } from '@/shared/formatters'
import { PIPELINE_STAGES, STATUS_META } from '@/shared/statuses'
import type { Paper, PaperStatus, PaymentStatus } from '@/shared/types'
import { assignAssignee, exportSubmissions, listAssignees, listSubmissions, type SubmissionRow } from '@/mock/api/papers'
import { CONFERENCES } from '@/mock/data/editorial'
import { useDataStore } from '@/mock/store'
import { AssignReviewerDialog } from './AssignReviewerDialog'
import { PAYMENT_LABEL, PaperIdLink, PaymentStatusBadge, TitleText, useAccess } from './shared'

interface Filters {
  stage: string
  status: string
  payment: string
  type: string
  conference: string
  assignee: string
  from: string
  to: string
}
const EMPTY: Filters = { stage: '', status: '', payment: '', type: '', conference: '', assignee: '', from: '', to: '' }

export function SubmissionsPage() {
  const navigate = useNavigate()
  const ctx = useAccess('submissions')
  const { can, why } = usePermission('submissions')
  const allJournals = useIsAllJournals()
  const users = useDataStore((s) => s.users)
  const q = useAsync(() => listSubmissions(ctx), [ctx])
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [reviewerFor, setReviewerFor] = useState<Paper[]>([])
  const [assigneeFor, setAssigneeFor] = useState<Paper[]>([])
  const clearRef = useRef<() => void>(() => undefined)
  const [exporting, setExporting] = useState(false)

  const rows = useMemo(() => q.data ?? [], [q.data])
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const active = Object.values(filters).some(Boolean)

  const filtered = useMemo(() => {
    const stage = PIPELINE_STAGES.find((s) => s.key === filters.stage)
    return rows.filter((r) => {
      if (stage && !stage.statuses.includes(r.status)) return false
      if (filters.status && r.status !== filters.status) return false
      if (filters.payment && r.paymentStatus !== filters.payment) return false
      if (filters.type && r.articleType !== filters.type) return false
      if (filters.conference && r.conference !== filters.conference) return false
      if (filters.assignee && (filters.assignee === '_none' ? !!r.assigneeId : r.assigneeId !== filters.assignee)) return false
      const day = r.submittedAt.slice(0, 10)
      if (filters.from && day < filters.from) return false
      if (filters.to && day > filters.to) return false
      return true
    })
  }, [rows, filters])

  const types = useMemo(() => [...new Set(rows.map((r) => r.articleType))].sort(), [rows])
  const assignees = useMemo(() => [...new Set(rows.map((r) => r.assigneeId).filter((x): x is string => !!x))], [rows])

  const columns = useMemo<Column<SubmissionRow>[]>(() => {
    const cols: Column<SubmissionRow>[] = [
      { id: 'id', header: 'Paper ID', locked: true, sort: (r) => r.id, cell: (r) => <PaperIdLink id={r.id} /> },
      { id: 'title', header: 'Title', sort: (r) => r.title, className: 'min-w-[260px]', cell: (r) => <TitleText title={r.title} /> },
    ]
    if (allJournals) cols.push({ id: 'journal', header: 'Journal', sort: (r) => r.journal, cell: (r) => <JournalBadge code={r.journal} /> })
    cols.push(
      { id: 'author', header: 'Author', sort: (r) => r.author, cell: (r) => <div className="min-w-[150px]"><p className="whitespace-nowrap">{r.author}</p><p className="text-xs text-muted">{r.authorEmail}</p></div> },
      { id: 'status', header: 'Status', sort: (r) => STATUS_META[r.status].order, cell: (r) => <StatusBadge status={r.status} /> },
      { id: 'payment', header: 'Payment', sort: (r) => r.paymentStatus, cell: (r) => <PaymentStatusBadge status={r.paymentStatus} /> },
      { id: 'type', header: 'Type', sort: (r) => r.articleType, cell: (r) => <span className="whitespace-nowrap text-muted">{r.articleType}</span> },
      { id: 'reviewer', header: 'Reviewer', sort: (r) => nameOf.get(r.reviewerId ?? '') ?? '', cell: (r) => r.reviewerId ? <span className="whitespace-nowrap">{nameOf.get(r.reviewerId)}</span> : <span className="text-faint">—</span> },
      { id: 'assignee', header: 'Assignee', sort: (r) => nameOf.get(r.assigneeId ?? '') ?? '', cell: (r) => r.assigneeId ? <span className="whitespace-nowrap">{nameOf.get(r.assigneeId)}</span> : <span className="text-faint">Unassigned</span> },
      { id: 'conference', header: 'Conference', defaultHidden: true, sort: (r) => r.conference, cell: (r) => <span className="whitespace-nowrap text-muted">{r.conference}</span> },
      { id: 'submitted', header: 'Submitted', sort: (r) => r.submittedAt, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.submittedAt)}</span> },
      { id: 'updated', header: 'Last update', defaultHidden: true, sort: (r) => r.updatedAt, cell: (r) => <span className="whitespace-nowrap text-muted"><RelativeTime value={r.updatedAt} /></span> },
    )
    return cols
  }, [allJournals, nameOf])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const csv = await exportSubmissions(filtered)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `submissions-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${filtered.length} submissions to CSV`)
    } catch {
      toast.error('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const bulkAllowed = can('approve')

  return (
    <>
      <PageHeader
        title="Submissions"
        description={ctx.level === 'work' ? 'Showing only the papers assigned to you.' : 'Every paper in the selected journal, from submission to publication.'}
        actions={<button className="btn-primary" onClick={exportCsv} disabled={exporting || q.loading}><Download size={15} strokeWidth={1.5} aria-hidden /> {exporting ? 'Exporting…' : 'Export CSV'}</button>}
      />
      <DataTable<SubmissionRow>
        id="submissions"
        data={filtered}
        columns={columns}
        rowKey={(r) => r.id}
        loading={q.loading && !q.data}
        error={!!q.error}
        onRetry={q.reload}
        onRowClick={(r) => navigate(`/submissions/${r.id}`)}
        search={{ placeholder: 'Search Paper ID, title, author or email', text: (r) => `${r.id} ${r.title} ${r.author} ${r.authorEmail}` }}
        selectable
        pageSize={10}
        views={{ filters, applyFilters: (f) => setFilters({ ...EMPTY, ...(f as Partial<Filters>) }) }}
        empty={{
          icon: FileText,
          title: active || rows.length ? 'No submissions match your filters' : ctx.level === 'work' ? 'No papers are assigned to you' : 'No submissions yet',
          hint: active ? 'Clear a filter or widen the date range.' : ctx.level === 'work' ? 'An Editor can assign papers to you from this screen.' : 'New submissions from authors appear here automatically.',
          action: active ? <button className="btn-secondary" onClick={() => setFilters(EMPTY)}>Clear filters</button> : undefined,
        }}
        filters={
          <>
            <SelectFilter label="Stage" value={filters.stage} onChange={(v) => set('stage', v)} options={PIPELINE_STAGES.map((s) => ({ value: s.key, label: s.label }))} />
            <SelectFilter label="Status" value={filters.status} onChange={(v) => set('status', v)} options={(Object.keys(STATUS_META) as PaperStatus[]).map((s) => ({ value: s, label: STATUS_META[s].label }))} />
            <SelectFilter label="Payment" value={filters.payment} onChange={(v) => set('payment', v)} options={(Object.keys(PAYMENT_LABEL) as PaymentStatus[]).map((s) => ({ value: s, label: PAYMENT_LABEL[s].label }))} />
            <SelectFilter label="Type" value={filters.type} onChange={(v) => set('type', v)} options={types.map((t) => ({ value: t, label: t }))} />
            <SelectFilter label="Conference" value={filters.conference} onChange={(v) => set('conference', v)} options={CONFERENCES.map((c) => ({ value: c, label: c }))} />
            <SelectFilter label="Assignee" value={filters.assignee} onChange={(v) => set('assignee', v)} options={[{ value: '_none', label: 'Unassigned' }, ...assignees.map((id) => ({ value: id, label: nameOf.get(id) ?? id }))]} />
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <input type="date" aria-label="Submitted from" className="input !w-auto" value={filters.from} max={filters.to || undefined} onChange={(e) => set('from', e.target.value)} />
              <span aria-hidden>–</span>
              <input type="date" aria-label="Submitted to" className="input !w-auto" value={filters.to} min={filters.from || undefined} onChange={(e) => set('to', e.target.value)} />
            </div>
            {active && <button className="btn-ghost" onClick={() => setFilters(EMPTY)}>Clear filters</button>}
          </>
        }
        bulkActions={(selected, clear) => (
          <>
            <GuardedButton allowed={bulkAllowed} why={why('approve')} className="btn-secondary !h-8" onClick={() => { clearRef.current = clear; setReviewerFor(selected) }}>
              <Users size={14} strokeWidth={1.5} aria-hidden /> Assign reviewer
            </GuardedButton>
            <GuardedButton allowed={bulkAllowed} why={why('approve')} className="btn-secondary !h-8" onClick={() => { clearRef.current = clear; setAssigneeFor(selected) }}>
              <UserPlus size={14} strokeWidth={1.5} aria-hidden /> Assign assignee
            </GuardedButton>
          </>
        )}
      />
      <AssignReviewerDialog open={reviewerFor.length > 0} onClose={() => setReviewerFor([])} papers={reviewerFor}
        onDone={() => { clearRef.current(); q.reload() }} />
      <AssigneeDialog open={assigneeFor.length > 0} papers={assigneeFor} onClose={() => setAssigneeFor([])} onDone={() => { clearRef.current(); q.reload() }} />
    </>
  )
}

function AssigneeDialog({ open, papers, onClose, onDone }: { open: boolean; papers: Paper[]; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={`Assign assignee${papers.length > 1 ? ` to ${papers.length} papers` : ''}`}
      description="The assignee is the Associate Editor responsible for the paper."
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" form="assignee-form" className="btn-primary">Assign</button>
      </>}>
      {open && <AssigneeBody papers={papers} onClose={onClose} onDone={onDone} />}
    </Dialog>
  )
}

function AssigneeBody({ papers, onClose, onDone }: { papers: Paper[]; onClose: () => void; onDone: () => void }) {
  const journals = useMemo(() => [...new Set(papers.map((p) => p.journal))], [papers])
  const q = useAsync(() => listAssignees(journals), [journals])
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  return (
    <form id="assignee-form" noValidate onSubmit={async (e) => {
      e.preventDefault(); setTouched(true)
      if (!value) return
      try {
        const u = await assignAssignee(papers.map((p) => p.id), value)
        toast.success(`${u.name} is now responsible for the selected papers`)
        onDone(); onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not assign.')
      }
    }}>
      <FormField label="Associate Editor" required error={touched && !value ? 'Choose an assignee.' : undefined}>
        {(a) => (
          <select {...a} className="input" value={value} onChange={(e) => setValue(e.target.value)} disabled={q.loading}>
            <option value="">{q.loading ? 'Loading…' : 'Select an Associate Editor'}</option>
            {(q.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name} · {journals.filter((j) => u.assignments[j] === 'associate_editor').join(', ') || 'other journals'}</option>)}
          </select>
        )}
      </FormField>
      {!q.loading && (q.data ?? []).length === 0 && <p className="mt-2 text-sm text-muted">No Associate Editors are set up for the journals of the selected papers.</p>}
    </form>
  )
}
