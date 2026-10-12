import { useMemo, useState } from 'react'
import { Inbox } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { Badge, JournalBadge } from '@/components/Badges'
import { RelativeTime } from '@/components/Time'
import { useAsync } from '@/lib/useAsync'
import { useIsAllJournals } from '@/lib/scope'
import { FORM_STATUS_LABEL, FORM_TYPE_LABEL, type FormStatus, type FormSubmission, type FormType } from '@/mock/data/website'
import { listSubmissions } from '@/mock/api/forms'
import { useJournalKey } from '../shared'
import { FormDetailDrawer } from './FormDetailDrawer'
import { FormStatusBadge } from './parts'

export default function FormsInboxPage() {
  const { journals, key } = useJournalKey()
  const all = useIsAllJournals()
  const { data, loading, error, reload } = useAsync(() => listSubmissions(journals), [key])
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [journal, setJournal] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const rows = useMemo(() => (data ?? []).filter((s) => (!type || s.type === type) && (!status || s.status === status) && (!journal || s.journal === journal)), [data, type, status, journal])
  const open = data?.find((s) => s.id === openId)
  const fresh = (data ?? []).filter((s) => s.status === 'new').length

  const columns: Column<FormSubmission>[] = [
    { id: 'id', header: 'Ref', sort: (s) => s.id, cell: (s) => <span className="whitespace-nowrap font-medium">{s.id}</span> },
    { id: 'name', header: 'Applicant', locked: true, sort: (s) => s.name.toLowerCase(), cell: (s) => <div><p className="font-medium">{s.name}</p><p className="text-xs text-muted">{s.email}</p></div> },
    { id: 'type', header: 'Form', sort: (s) => s.type, cell: (s) => <Badge tone="neutral">{FORM_TYPE_LABEL[s.type]}</Badge> },
    ...(all || journals.length > 1 ? [{ id: 'journal', header: 'Journal', sort: (s: FormSubmission) => s.journal, cell: (s: FormSubmission) => <JournalBadge code={s.journal} /> }] : []),
    { id: 'subject', header: 'Subject', cell: (s) => <p className="line-clamp-2 max-w-[340px] text-sm" title={s.subject}>{s.subject}</p>, mobileHide: true },
    { id: 'received', header: 'Received', sort: (s) => s.receivedAt, cell: (s) => <RelativeTime value={s.receivedAt} /> },
    { id: 'status', header: 'Status', sort: (s) => s.status, cell: (s) => <FormStatusBadge status={s.status} /> },
  ]

  return (
    <>
      <PageHeader title="Forms inbox" description={`Applications and enquiries from the websites. ${fresh} ${fresh === 1 ? 'submission is' : 'submissions are'} new.`} />
      <DataTable<FormSubmission>
        id="forms-inbox" data={rows} columns={columns} rowKey={(s) => s.id} loading={loading && !data} error={!!error} onRetry={reload}
        onRowClick={(s) => setOpenId(s.id)}
        search={{ placeholder: 'Search by name, email or subject…', text: (s) => `${s.id} ${s.name} ${s.email} ${s.subject} ${s.affiliation}` }}
        filters={<>
          <SelectFilter label="Form" value={type} onChange={setType} options={(Object.keys(FORM_TYPE_LABEL) as FormType[]).map((t) => ({ value: t, label: FORM_TYPE_LABEL[t] }))} />
          <SelectFilter label="Status" value={status} onChange={setStatus} options={(Object.keys(FORM_STATUS_LABEL) as FormStatus[]).map((s) => ({ value: s, label: FORM_STATUS_LABEL[s] }))} />
          {journals.length > 1 && <SelectFilter label="Journal" value={journal} onChange={setJournal} options={journals.map((j) => ({ value: j, label: j }))} />}
        </>}
        rowClassName={(s) => (s.status === 'new' ? 'font-medium' : undefined)}
        empty={{ icon: Inbox, title: 'No submissions match', hint: 'New applications and enquiries from the website appear here.' }}
      />
      <FormDetailDrawer submission={open} onClose={() => setOpenId(null)} onChanged={reload} />
    </>
  )
}
