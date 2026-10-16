import { useMemo, useState } from 'react'
import { Plus, StickyNote } from 'lucide-react'
import type { Paper, PaperStatus } from '@/shared/types'
import { SectionCard } from '@/components/Card'
import { Switch } from '@/components/Form'
import { EmptyState } from '@/components/States'
import { RelativeTime } from '@/components/Time'
import { toast } from '@/components/Toasts'
import { GuardedButton } from '@/components/Tooltip'
import { useScopeJournals } from '@/lib/scope'
import { useCanAct, usePermission } from '@/permissions/hooks'
import { associateWorkload, journalAssociateEditors } from '@/mock/actions'
import { setAutoAssign } from '@/mock/api/assignments'
import { useDataStore, useSession } from '@/mock/store'
import { useNotesStore } from '@/mock/stores/notes'
import { AddNoteDialog, NotesList } from '@/pages/editorial/EditorNotes'
import { TitleCell } from './parts'

const IN_PRODUCTION: PaperStatus[] = ['paid', 'in_production', 'returned_to_production', 'ready_for_approval']

/** Editor dashboard: write editing instructions for the Associate Editor working on each paper. */
export function AssociateInstructionsCard() {
  const journals = useScopeJournals()
  const papers = useDataStore((s) => s.papers)
  const users = useDataStore((s) => s.users)
  const notes = useNotesStore((s) => s.notes)
  const canAct = useCanAct('submissions', 'approve')
  const { why } = usePermission('submissions')
  const [adding, setAdding] = useState<Paper | null>(null)
  const rows = useMemo(
    () => papers.filter((p) => journals.includes(p.journal) && IN_PRODUCTION.includes(p.status)).sort((a, b) => (notes[b.id]?.[0]?.at ?? '').localeCompare(notes[a.id]?.[0]?.at ?? '') || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8),
    [papers, journals, notes],
  )
  return (
    <SectionCard title="Notes for Associate Editors" flush>
      {rows.length === 0 ? <EmptyState icon={StickyNote} title="No manuscripts in production" hint="When a paper is paid and assigned, you can leave editing instructions for its Associate Editor here." /> : (
        <ul className="divide-y divide-line">
          {rows.map((p) => {
            const list = notes[p.id] ?? []
            const ae = users.find((u) => u.id === p.assigneeId)
            return (
              <li key={p.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0"><TitleCell paper={p} /><p className="mt-0.5 text-xs text-muted">Associate Editor: {ae?.name ?? 'Unassigned'}</p></div>
                <div className="min-w-0 text-sm">
                  {list[0] ? (
                    <>
                      <p className="line-clamp-2 text-amber-950" title={list[0].text}>“{list[0].text}”</p>
                      <p className="mt-0.5 text-xs text-muted">{list.length} note{list.length === 1 ? '' : 's'} · latest <RelativeTime value={list[0].at} /></p>
                    </>
                  ) : <p className="text-muted">No notes yet.</p>}
                </div>
                <GuardedButton allowed={canAct} why={why('approve')} className="btn-secondary !h-8 whitespace-nowrap" onClick={() => setAdding(p)}><Plus size={14} aria-hidden /> Add note</GuardedButton>
              </li>
            )
          })}
        </ul>
      )}
      <AddNoteDialog paperId={adding?.id ?? null} title={adding?.title} onClose={() => setAdding(null)} />
    </SectionCard>
  )
}

/** Editor dashboard: switch automatic Associate Editor assignment on or off per journal. */
export function AutoAssignCard() {
  const journals = useScopeJournals()
  const auto = useDataStore((s) => s.autoAssignAe)
  const papers = useDataStore((s) => s.papers)
  const canAct = useCanAct('submissions', 'approve')
  const { why } = usePermission('submissions')
  const scope = useSession((s) => s.journal)
  const toggle = async (j: (typeof journals)[number], on: boolean) => {
    await setAutoAssign(j, on)
    toast.success(on ? `${j}: paid articles are assigned to an Associate Editor automatically.` : `${j}: automatic assignment is off. Assign each article yourself.`)
  }
  void papers
  return (
    <SectionCard title="Associate Editor assignment">
      <p className="mb-3 text-sm text-muted">When a payment is verified, the article goes to the Associate Editor with the lightest workload. Turn this off to assign each article yourself. You can always reassign from the paper’s Production tab.</p>
      <ul className="space-y-3">
        {journals.map((j) => {
          const list = journalAssociateEditors(j)
          return (
            <li key={j} className="rounded-lg border border-line p-3">
              <Switch checked={auto[j] !== false} disabled={!canAct} onChange={(on) => void toggle(j, on)} label={`Auto-assign Associate Editor${scope === 'ALL' || journals.length > 1 ? ` · ${j}` : ''}`}
                description={!canAct ? why('approve') : list.length ? list.map((u) => `${u.name} (${associateWorkload(u.id)})`).join(', ') : `No Associate Editor holds ${j} yet.`} />
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

/** Associate Editor dashboard: the Editor's instructions, listed under each Paper ID. */
export function EditorNotesForMeCard({ userId }: { userId: string }) {
  const papers = useDataStore((s) => s.papers)
  const notes = useNotesStore((s) => s.notes)
  const mine = useMemo(() => papers.filter((p) => p.assigneeId === userId && (notes[p.id]?.length ?? 0) > 0), [papers, notes, userId])
  return (
    <SectionCard title="Notes from the Editor" flush>
      {mine.length === 0 ? <EmptyState icon={StickyNote} title="No instructions yet" hint="When the Editor leaves editing instructions for one of your manuscripts, they appear here under its Paper ID." /> : (
        <ul className="divide-y divide-line">
          {mine.map((p) => (
            <li key={p.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-start">
              <TitleCell paper={p} />
              <NotesList notes={notes[p.id]} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
