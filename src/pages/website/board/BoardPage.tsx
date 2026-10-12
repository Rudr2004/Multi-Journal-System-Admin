import { useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, EyeOff, GripVertical, Pencil, Plus, Power, PowerOff, Users } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge } from '@/components/Badges'
import { ConfirmDialog } from '@/components/Dialog'
import { Switch } from '@/components/Form'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { usePermission } from '@/permissions/hooks'
import { formatDate } from '@/shared/formatters'
import type { JournalCode } from '@/shared/types'
import { BOARD_GROUPS, type BoardGroup, type BoardMember } from '@/mock/data/website'
import { listBoard, reorderBoard, setMemberActive } from '@/mock/api/board'
import { Avatar, JournalTabs, useActiveJournal, useJournalKey } from '../shared'
import { BoardPreview } from './BoardPreview'
import { MemberDrawer } from './MemberDrawer'

type Layout = Record<BoardGroup, string[]>
const groupId = (g: BoardGroup) => `group:${g}`
const emptyLayout = (): Layout => Object.fromEntries(BOARD_GROUPS.map((g) => [g, [] as string[]])) as Layout
const fromMembers = (ms: BoardMember[]): Layout => {
  const l = emptyLayout()
  for (const m of ms) l[m.group].push(m.id)
  return l
}

function MemberCard({ m, handle, canEdit, onEdit, onToggle, overlay }: {
  m: BoardMember; handle?: React.ReactNode; canEdit: boolean; onEdit?: () => void; onToggle?: () => void; overlay?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border border-line bg-surface p-3', !m.active && 'bg-page', overlay && 'shadow-overlay')}>
      {handle}
      <Avatar name={m.name} photo={m.photo} size={40} muted={!m.active} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className={cn(!m.active && 'text-muted')}>{m.name}</span>
          {!m.active && <Badge tone="warning">Hidden from website</Badge>}
        </p>
        <p className="truncate text-xs text-muted">{m.designation} · {m.affiliation}, {m.country}</p>
        <p className="text-xs text-faint">Term {formatDate(m.termStart)} to {formatDate(m.termEnd)}</p>
      </div>
      {!overlay && (
        <div className="flex shrink-0 gap-1">
          <GuardedButton allowed={canEdit} why="You need Work access to edit the board." className="btn-ghost h-8 px-2" aria-label={`Edit ${m.name}`} onClick={onEdit}><Pencil size={15} strokeWidth={1.5} /></GuardedButton>
          <GuardedButton allowed={canEdit} why="You need Work access to change visibility." className="btn-ghost h-8 px-2" aria-label={m.active ? `Deactivate ${m.name}` : `Reactivate ${m.name}`} onClick={onToggle}>
            {m.active ? <PowerOff size={15} strokeWidth={1.5} /> : <Power size={15} strokeWidth={1.5} />}
          </GuardedButton>
        </div>
      )}
    </div>
  )
}

function SortableMember(p: { m: BoardMember; canEdit: boolean; onEdit: () => void; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.m.id, disabled: !p.canEdit })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'opacity-40')}>
      <MemberCard {...p}
        handle={<button type="button" {...attributes} {...listeners} disabled={!p.canEdit} aria-label={`Drag to reorder ${p.m.name}. Press space, then arrow keys.`}
          className="-ml-1 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint hover:text-ink active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"><GripVertical size={16} strokeWidth={1.5} aria-hidden /></button>} />
    </li>
  )
}

function GroupSection({ group, ids, byId, canEdit, onAdd, onEdit, onToggle }: {
  group: BoardGroup; ids: string[]; byId: Map<string, BoardMember>; canEdit: boolean
  onAdd: () => void; onEdit: (m: BoardMember) => void; onToggle: (m: BoardMember) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupId(group) })
  return (
    <section aria-labelledby={`g-${group}`} className="card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id={`g-${group}`} className="text-[16px] font-semibold">{group} <span className="ml-1 text-sm font-normal text-muted">{ids.length}</span></h2>
        <GuardedButton allowed={canEdit} why="You need Work access to edit the board." className="btn-ghost h-8" onClick={onAdd}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add</GuardedButton>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={cn('min-h-[64px] space-y-2 p-3 transition-colors', isOver && 'bg-accent-soft/50')}>
          {ids.map((id) => { const m = byId.get(id); return m ? <SortableMember key={id} m={m} canEdit={canEdit} onEdit={() => onEdit(m)} onToggle={() => onToggle(m)} /> : null })}
          {ids.length === 0 && <li className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-muted">No members. Drag someone here or use Add.</li>}
        </ul>
      </SortableContext>
    </section>
  )
}

export default function BoardPage() {
  const { journals } = useJournalKey()
  const [pick, setPick] = useState<JournalCode>()
  const journal = useActiveJournal(pick)
  const { can } = usePermission('board')
  const canEdit = can('work')
  const { data, loading, error, reload } = useAsync(() => (journal ? listBoard(journal) : Promise.resolve([])), [journal])

  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [showHidden, setShowHidden] = useState(true)
  const [draft, setDraft] = useState<Layout | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<{ member?: BoardMember; group?: BoardGroup } | null>(null)
  const [deactivating, setDeactivating] = useState<BoardMember | null>(null)

  const members = useMemo(() => data ?? [], [data])
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const base = useMemo(() => fromMembers(members), [members])
  const layout = draft ?? base
  const shown: Layout = useMemo(
    () => Object.fromEntries(BOARD_GROUPS.map((g) => [g, showHidden ? layout[g] : layout[g].filter((id) => byId.get(id)?.active)])) as Layout,
    [layout, showHidden, byId],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const containerOf = (l: Layout, id: string): BoardGroup | undefined =>
    id.startsWith('group:') ? (id.slice(6) as BoardGroup) : BOARD_GROUPS.find((g) => l[g].includes(id))

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id))

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    const cur = draft ?? base
    const from = containerOf(cur, String(active.id))
    const to = containerOf(cur, String(over.id))
    if (!from || !to || from === to) return
    const overIdx = cur[to].indexOf(String(over.id))
    const insertAt = overIdx >= 0 ? overIdx : cur[to].length
    setDraft({ ...cur, [from]: cur[from].filter((id) => id !== active.id), [to]: [...cur[to].slice(0, insertAt), String(active.id), ...cur[to].slice(insertAt)] })
  }

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    let next = draft ?? base
    if (over) {
      const g = containerOf(next, String(active.id))
      const overG = containerOf(next, String(over.id))
      if (g && g === overG) {
        const oldI = next[g].indexOf(String(active.id))
        const newI = String(over.id).startsWith('group:') ? next[g].length - 1 : next[g].indexOf(String(over.id))
        if (oldI !== newI && newI >= 0) next = { ...next, [g]: arrayMove(next[g], oldI, newI) }
      }
    }
    const changed = BOARD_GROUPS.some((g) => next[g].join() !== base[g].join())
    if (!changed || !journal) { setDraft(null); return }
    setDraft(next)
    const moved = byId.get(String(active.id))
    try {
      await reorderBoard(journal, next)
      toast.success(moved ? `Order saved. ${moved.name} is now in ${containerOf(next, moved.id)}.` : 'Order saved.')
      reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDraft(null)
    }
  }

  const toggle = async (m: BoardMember, active: boolean) => {
    try {
      await setMemberActive(m.id, active)
      toast.success(active ? `${m.name} is visible on the website again.` : `${m.name} is hidden from the website. Their record is kept.`)
      reload()
    } catch (e) { toast.error((e as Error).message) }
  }

  const activeMember = activeId ? byId.get(activeId) : undefined
  const activeCount = members.filter((m) => m.active).length

  return (
    <>
      <PageHeader
        title="Editorial board"
        description="Arrange who appears on the website and in what order. Deactivated members are hidden, never deleted."
        actions={<GuardedButton allowed={canEdit && !!journal} why="You need Work access to edit the board." className="btn-primary" onClick={() => setDrawer({})}><Plus size={15} strokeWidth={1.5} aria-hidden /> Add member</GuardedButton>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {journal && <JournalTabs journals={journals} value={journal} onChange={setPick} />}
        <div role="tablist" aria-label="View mode" className="inline-flex rounded-md bg-subtle p-0.5 text-sm">
          <button role="tab" aria-selected={mode === 'edit'} onClick={() => setMode('edit')} className={cn('rounded px-3 py-1 font-medium', mode === 'edit' ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink')}>Arrange</button>
          <button role="tab" aria-selected={mode === 'preview'} onClick={() => setMode('preview')} className={cn('inline-flex items-center gap-1 rounded px-3 py-1 font-medium', mode === 'preview' ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink')}>
            {mode === 'preview' ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />} Website preview
          </button>
        </div>
        {mode === 'edit' && <div className="ml-auto w-56"><Switch label="Show hidden members" checked={showHidden} onChange={setShowHidden} /></div>}
        <p className={cn('text-xs text-muted', mode === 'preview' && 'ml-auto')} aria-live="polite">{members.length} members · {activeCount} visible on the website</p>
      </div>

      {!journal ? (
        <div className="card"><EmptyState icon={Users} title="No journal selected" hint="Pick a journal in the top bar to manage its editorial board." /></div>
      ) : loading && !data ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading board">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : error ? (
        <div className="card"><ErrorState onRetry={reload} /></div>
      ) : mode === 'preview' ? (
        <BoardPreview journal={journal} members={members} />
      ) : members.length === 0 ? (
        <div className="card"><EmptyState icon={Users} title={`No ${journal} board members yet`} hint="Add the Editor-in-Chief first, then associate editors and board members." action={<button className="btn-primary" onClick={() => setDrawer({})}>Add member</button>} /></div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); setDraft(null) }}
          accessibility={{ announcements: {
            onDragStart: ({ active }) => `Picked up ${byId.get(String(active.id))?.name ?? 'member'}.`,
            onDragOver: ({ active, over }) => (over ? `${byId.get(String(active.id))?.name ?? 'Member'} is over ${over.id.toString().startsWith('group:') ? over.id.toString().slice(6) : (byId.get(String(over.id))?.name ?? 'a position')}.` : undefined),
            onDragEnd: ({ active }) => `Dropped ${byId.get(String(active.id))?.name ?? 'member'}.`,
            onDragCancel: ({ active }) => `Move cancelled for ${byId.get(String(active.id))?.name ?? 'member'}.`,
          } }}>
          <div className="space-y-4">
            {BOARD_GROUPS.map((g) => (
              <GroupSection key={g} group={g} ids={shown[g]} byId={byId} canEdit={canEdit}
                onAdd={() => setDrawer({ group: g })} onEdit={(m) => setDrawer({ member: m })}
                onToggle={(m) => (m.active ? setDeactivating(m) : toggle(m, true))} />
            ))}
          </div>
          <DragOverlay>{activeMember && <MemberCard m={activeMember} canEdit={false} overlay />}</DragOverlay>
        </DndContext>
      )}

      {journal && (
        <MemberDrawer open={!!drawer} onClose={() => setDrawer(null)} journal={journal} member={drawer?.member} defaultGroup={drawer?.group} onSaved={reload} />
      )}
      <ConfirmDialog open={!!deactivating} onClose={() => setDeactivating(null)} title={`Deactivate ${deactivating?.name ?? ''}?`} confirmLabel="Deactivate"
        consequences={['Hide them from the public editorial board page immediately', 'Keep their record, term dates and position so you can reactivate them later', 'Record the change in the audit log']}
        onConfirm={() => deactivating && toggle(deactivating, false)} />
    </>
  )
}
