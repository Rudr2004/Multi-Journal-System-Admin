import { Link } from 'react-router-dom'
import { AlertTriangle, ClipboardCheck, Factory, FilePenLine, History, Newspaper, Presentation, Undo2 } from 'lucide-react'
import { getAssociateOverview } from '@/mock/api/dashboard'
import { useSession } from '@/mock/store'
import { useCurrentUser, useJournals } from '@/permissions/hooks'
import { useAsync } from '@/lib/useAsync'
import { formatDate } from '@/shared/formatters'
import { KpiCard } from '@/components/KpiCard'
import { SectionCard } from '@/components/Card'
import { DueChip } from '@/components/Due'
import { Badge, JournalBadge } from '@/components/Badges'
import { EmptyState, ErrorState } from '@/components/States'
import { RelativeTime } from '@/components/Time'
import { CHANGE_TYPE_META } from '@/mock/data/production'
import { LINK, PaperTable, StageChart, TableSkeleton, TitleCell } from './parts'

export function AssociateDashboard() {
  const user = useCurrentUser()!
  const scope = useSession((s) => s.journal)
  const journals = useJournals()
  const q = useAsync(() => getAssociateOverview(user.id, scope, journals), [user.id, scope, journals.join()])
  const d = q.data
  const all = scope === 'ALL'
  const loading = q.loading

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Key figures">
        <KpiCard label="Assigned to me" value={d?.assigned.length} icon={Factory} loading={loading} to="/production" />
        <KpiCard label="Due or overdue" value={d?.due.length} icon={AlertTriangle} loading={loading} tone={d?.due.length ? 'warning' : 'default'} to="/production" />
        <KpiCard label="Returned by Editor" value={d?.returned.length} icon={Undo2} loading={loading} tone={d?.returned.length ? 'danger' : 'default'} to="/production" />
        <KpiCard label="Correction work" value={d?.corrections.length} icon={FilePenLine} loading={loading} to="/post-publication" />
      </section>

      {q.error ? <ErrorState onRetry={q.reload} /> : (
        <>
          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard title="My manuscripts by stage" className="xl:col-span-2">
              {loading ? <div className="h-[240px] animate-pulse rounded-md bg-slate-100" /> : d!.assigned.length === 0
                ? <EmptyState icon={Factory} title="No manuscripts assigned" hint="Papers appear here automatically once their payment is verified." />
                : <StageChart data={d!.stages.map((s) => ({ label: s.label, count: s.count }))} noun="Manuscripts" />}
            </SectionCard>
            <SectionCard title="Article In Press">
              {loading ? <div className="h-16 animate-pulse rounded bg-slate-100" /> : (
                <div className="flex gap-3">
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Newspaper size={18} strokeWidth={1.6} /></span>
                  <p className="text-sm text-muted">
                    Articles in production are listed publicly on the <span className="font-medium text-ink">Article In Press</span> page.
                    {' '}<span className="font-semibold text-ink">{d!.inPress}</span> {d!.inPress === 1 ? 'article is' : 'articles are'} there now{all ? '' : ` for ${scope}`}, so keep titles and authors accurate.
                  </p>
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Returned to production" flush>
            {loading ? <TableSkeleton rows={2} /> : d!.returned.length === 0
              ? <EmptyState icon={Undo2} title="Nothing returned" hint="When the Editor sends an article back, their note appears here." />
              : (
                <ul className="divide-y divide-line">
                  {d!.returned.map(({ paper, note }) => (
                    <li key={paper.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-start">
                      <TitleCell paper={paper} />
                      <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
                        <p className="font-medium">{note ? `${note.by} wrote` : 'Editor’s note'}</p>
                        <p>{note?.text ?? 'Open the workspace to read the note from the Editor.'}</p>
                        {note && <p className="mt-0.5 text-xs text-red-800"><RelativeTime value={note.at} /></p>}
                      </div>
                      <DueChip value={paper.productionDue} />
                    </li>
                  ))}
                </ul>
              )}
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Due and overdue" action={<Link to="/production" className={LINK}>Open queue</Link>} flush>
              {loading ? <TableSkeleton /> : d!.due.length === 0
                ? <EmptyState icon={ClipboardCheck} title="Nothing is due" hint="Items due today or past their date show up here." />
                : <PaperTable papers={d!.due.slice(0, 6)} showJournal={all} extraLabel="Due" extra={(p) => <DueChip value={p.productionDue} />} />}
            </SectionCard>

            <SectionCard title="Correction work" action={<Link to="/post-publication" className={LINK}>Post Corrections</Link>} flush>
              {loading ? <TableSkeleton /> : d!.corrections.length === 0
                ? <EmptyState icon={FilePenLine} title="No corrections to make" hint="Approved requests assigned to you wait here for a new article version." />
                : (
                  <ul className="divide-y divide-line">
                    {d!.corrections.map((c) => (
                      <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <Link to={`/post-publication/${c.id}`} className="text-sm font-medium text-accent hover:underline">{c.id}</Link>
                          <span className="text-sm text-muted"> · {c.paperId} · {CHANGE_TYPE_META[c.type].label}</span>
                          <p className="line-clamp-2 text-sm text-muted" title={c.reason}>{c.reason}</p>
                        </div>
                        <Badge tone="accent">Approved · new version needed</Badge>
                      </li>
                    ))}
                  </ul>
                )}
            </SectionCard>

            <SectionCard title="Backdated publications" action={<Link to="/backdated" className={LINK}>Open</Link>} flush>
              {loading ? <TableSkeleton rows={2} /> : d!.backdated.length === 0
                ? <EmptyState icon={History} title="No backdated items pending" hint="Articles you place into a past issue wait here for the Editor’s approval." />
                : (
                  <ul className="divide-y divide-line">
                    {d!.backdated.map((b) => (
                      <li key={b.id} className="px-4 py-2.5">
                        <div className="flex items-center gap-2 text-sm"><span className="font-medium">{b.finalId}</span>{all && <JournalBadge code={b.journal} />}<Badge tone="warning">Pending approval</Badge></div>
                        <p className="line-clamp-2 text-sm text-muted" title={b.title}>{b.title}</p>
                        <p className="text-xs text-muted">{b.issueLabel} · {formatDate(b.issueDate)}</p>
                      </li>
                    ))}
                  </ul>
                )}
            </SectionCard>

            <SectionCard title="Conference papers assigned" action={<Link to="/conferences" className={LINK}>Conference Proceedings</Link>} flush>
              {loading ? <TableSkeleton rows={2} /> : d!.conference.length === 0
                ? <EmptyState icon={Presentation} title="No conference papers assigned" hint="Papers linked to a conference show up here with the conference name." />
                : <PaperTable papers={d!.conference.map((c) => c.paper)} showJournal={all} extraLabel="Conference" extra={(p) => d!.conference.find((c) => c.paper.id === p.id)?.conference} />}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
