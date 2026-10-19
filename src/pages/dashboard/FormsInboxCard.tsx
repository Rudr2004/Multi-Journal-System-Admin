import { Link } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import type { JournalCode } from '@/shared/types'
import { listSubmissions as listForms } from '@/mock/api/forms'
import { FORM_STATUS_LABEL, FORM_TYPE_LABEL } from '@/mock/data/website'
import { useAsync } from '@/lib/useAsync'
import { SectionCard } from '@/components/Card'
import { Badge } from '@/components/Badges'
import { EmptyState } from '@/components/States'
import { RelativeTime } from '@/components/Time'
import { LINK, TableSkeleton } from './parts'

/** Dashboard card: how many website forms are new, under review or on hold, and the latest ones waiting for a reply. */
export function FormsInboxCard({ journals }: { journals: JournalCode[] }) {
  const forms = useAsync(() => listForms(journals), [journals.join()])
  const formList = forms.data ?? []
  const formCount = (st: string) => formList.filter((f) => f.status === st).length
  return (
    <SectionCard title="Forms Inbox" action={<Link to="/forms-inbox" className={LINK}>Open Forms Inbox</Link>} flush>
      {forms.loading ? <TableSkeleton rows={3} /> : formList.length === 0 ? <EmptyState icon={Inbox} title="No applications or enquiries" hint="Reviewer, board, conference and general forms from the website arrive here." /> : (
        <div className="grid gap-4 p-4 lg:grid-cols-[auto_1fr]">
          <dl className="grid grid-cols-3 gap-3 lg:grid-cols-1">
            {(['new', 'under_review', 'on_hold'] as const).map((st) => (
              <div key={st} className="rounded-lg bg-subtle px-4 py-2.5"><dt className="text-xs text-muted">{FORM_STATUS_LABEL[st]}</dt><dd className="text-xl font-semibold tabular-nums">{formCount(st)}</dd></div>
            ))}
          </dl>
          <ul className="divide-y divide-line">
            {formList.filter((f) => f.status === 'new' || f.status === 'under_review').slice(0, 5).map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 py-2 text-sm first:pt-0">
                <div className="min-w-0"><Link to="/forms-inbox" className="font-medium text-accent hover:underline">{f.name}</Link><p className="truncate text-xs text-muted">{FORM_TYPE_LABEL[f.type]} · {f.subject}</p></div>
                <div className="flex shrink-0 flex-col items-end gap-1"><Badge tone={f.status === 'new' ? 'warning' : 'info'}>{FORM_STATUS_LABEL[f.status]}</Badge><span className="text-xs text-muted"><RelativeTime value={f.receivedAt} /></span></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}
