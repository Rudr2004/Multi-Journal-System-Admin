import type { JournalCode } from '@/shared/types'
import { newId, recordAudit } from '../actions'
import { BOARD_GROUPS, type BoardGroup, type BoardMember } from '../data/website'
import { useWebsiteStore } from '../stores/website'
import { ApiError, delay } from './latency'

const wait = () => delay(null, 250, 600)
const state = () => useWebsiteStore.getState()

export type BoardDraft = Omit<BoardMember, 'id' | 'order' | 'active'> & { id?: string }

/** Members of one journal in display order (group order, then position within the group). */
export const sortBoard = (members: BoardMember[]) =>
  [...members].sort((a, b) => BOARD_GROUPS.indexOf(a.group) - BOARD_GROUPS.indexOf(b.group) || a.order - b.order)

export async function listBoard(journal: JournalCode): Promise<BoardMember[]> {
  await wait()
  return sortBoard(state().board.filter((m) => m.journal === journal))
}

/** Used by the Forms inbox when an application is approved (no latency). */
export function addBoardMember(d: BoardDraft): BoardMember {
  const siblings = state().board.filter((m) => m.journal === d.journal && m.group === d.group)
  const member: BoardMember = { ...d, id: newId('bm'), order: siblings.length, active: true }
  state().set({ board: [...state().board, member] })
  recordAudit({ journal: member.journal, action: 'Added editorial board member', target: `${member.name} (${member.group})` })
  return member
}

export async function saveMember(d: BoardDraft): Promise<BoardMember> {
  await wait()
  if (!d.id) return addBoardMember(d)
  const before = state().board.find((m) => m.id === d.id)
  if (!before) throw new ApiError('This member no longer exists.', 'not_found')
  const moved = before.group !== d.group
  const order = moved ? state().board.filter((m) => m.journal === before.journal && m.group === d.group).length : before.order
  const next: BoardMember = { ...before, ...d, id: before.id, order, active: before.active }
  state().set({ board: state().board.map((m) => (m.id === before.id ? next : m)) })
  recordAudit({ journal: before.journal, action: 'Edited editorial board member', target: next.name, oldValue: moved ? before.group : undefined, newValue: moved ? next.group : undefined })
  return next
}

/** Persist drag-and-drop order. `layout` maps each group to its member ids, top to bottom. */
export async function reorderBoard(journal: JournalCode, layout: Record<BoardGroup, string[]>): Promise<void> {
  await delay(null, 100, 250)
  const pos = new Map<string, { group: BoardGroup; order: number }>()
  for (const g of BOARD_GROUPS) layout[g].forEach((id, order) => pos.set(id, { group: g, order }))
  state().set({ board: state().board.map((m) => (m.journal === journal && pos.has(m.id) ? { ...m, ...pos.get(m.id)! } : m)) })
  recordAudit({ journal, action: 'Reordered editorial board', target: journal })
}

export async function setMemberActive(id: string, active: boolean): Promise<void> {
  await wait()
  const m = state().board.find((x) => x.id === id)
  if (!m) throw new ApiError('This member no longer exists.', 'not_found')
  state().set({ board: state().board.map((x) => (x.id === id ? { ...x, active } : x)) })
  recordAudit({ journal: m.journal, action: active ? 'Reactivated board member' : 'Deactivated board member (hidden from website)', target: m.name, oldValue: m.active ? 'active' : 'inactive', newValue: active ? 'active' : 'inactive' })
}
