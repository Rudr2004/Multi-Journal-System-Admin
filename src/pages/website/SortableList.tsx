import type { ReactNode } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

function Row({ id, label, disabled, children }: { id: string; label: string; disabled?: boolean; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const handle = (
    <button type="button" {...attributes} {...listeners} disabled={disabled} aria-label={`Drag to reorder ${label}. Press space, then arrow keys.`}
      className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint hover:text-ink active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40">
      <GripVertical size={16} strokeWidth={1.5} aria-hidden />
    </button>
  )
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && 'relative z-10 opacity-60')}>{children(handle)}</li>
}

/** Vertical drag-and-drop list (pointer and keyboard). The parent owns the array and applies `onMove(from, to)`. */
export function SortableList<T>({ items, getId, getLabel, onMove, disabled, renderItem, className }: {
  items: T[]
  getId: (item: T) => string
  getLabel: (item: T) => string
  onMove: (from: number, to: number) => void
  disabled?: boolean
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode
  className?: string
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const ids = items.map(getId)
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = ids.indexOf(String(e.active.id))
    const to = ids.indexOf(String(e.over.id))
    if (from >= 0 && to >= 0) onMove(from, to)
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul className={cn('space-y-2', className)}>
          {items.map((item, i) => (
            <Row key={getId(item)} id={getId(item)} label={getLabel(item)} disabled={disabled}>{(handle) => renderItem(item, i, handle)}</Row>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice()
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x)
  return next
}
