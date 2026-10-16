import type { PaperStatus, Role } from '@/shared/types'

/**
 * Where a paper opens for a person: straight into the screen and tab for the stage it is waiting in.
 * These are normal links, so the Editor can also right-click and open them in a new tab.
 */
export function paperStagePath(role: Role | undefined, p: { id: string; status: PaperStatus }): string {
  const id = encodeURIComponent(p.id)
  if (role === 'associate_editor') return `/production/${id}`
  if (role === 'reviewer' || role === 'panel_member') return `/my-reviews/${id}`
  const tab = (t: string) => `/submissions/${id}?tab=${t}`
  if (role === 'support') return `/submissions/${id}`
  switch (p.status) {
    case 'under_review':
      return tab('review')
    case 'decision_pending':
    case 'changes_requested':
      return tab('review')
    case 'accepted':
    case 'payment_pending':
      return tab('payments')
    case 'paid':
    case 'in_production':
    case 'returned_to_production':
      return tab('production')
    case 'ready_for_approval':
      // The Editor verifies and approves, rejects or returns it in the Production tab.
      return tab('production')
    default:
      return `/submissions/${id}`
  }
}
