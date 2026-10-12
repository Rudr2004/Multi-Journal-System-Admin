import type { Role } from '@/shared/types'

/**
 * Permission levels per area, ranked low → high.
 *  none    – hidden in navigation, route returns 403
 *  view    – read-only; action buttons disabled with a tooltip
 *  work    – may act only on items assigned to the user
 *  approve – may decide / verify / publish
 *  manage  – full control, including configuration
 */
export type Level = 'none' | 'view' | 'work' | 'approve' | 'manage'
export const LEVEL_RANK: Record<Level, number> = { none: 0, view: 1, work: 2, approve: 3, manage: 4 }
export const LEVEL_LABEL: Record<Level, string> = {
  none: 'No access',
  view: 'View',
  work: 'Work on (assigned)',
  approve: 'Approve',
  manage: 'Manage',
}

export type Area =
  | 'dashboard' | 'submissions' | 'reviewMgmt' | 'myReviews' | 'production' | 'finalApproval'
  | 'backdated' | 'postPub' | 'issues' | 'conferences' | 'doi' | 'certificates'
  | 'payments' | 'invoices' | 'referrals'
  | 'dispatch' | 'commLog' | 'templates' | 'whatsapp' | 'helpdesk' | 'chatbot'
  | 'cms' | 'board' | 'announcements' | 'awards' | 'awardApproval' | 'forms'
  | 'analytics' | 'scholar'
  | 'users' | 'journalSettings' | 'audit'

const N: Level = 'none'
const V: Level = 'view'
const W: Level = 'work'
const A: Level = 'approve'
const M: Level = 'manage'

// Columns: Super Admin, Editor, Associate Editor, Reviewer, Panel Member, Support
// NOTE: derived from the role descriptions in the brief; reconcile with the architecture PDF §9 when shared.
type Row = [Level, Level, Level, Level, Level, Level]
const TABLE: Record<Area, Row> = {
  dashboard: [M, M, W, W, W, W],
  submissions: [M, A, W, N, N, V],
  reviewMgmt: [M, M, N, N, N, N],
  myReviews: [N, N, N, W, W, N],
  production: [M, V, W, N, N, N],
  finalApproval: [A, A, N, N, N, N],
  backdated: [M, M, N, N, N, N],
  postPub: [M, A, W, N, N, W],
  issues: [M, M, V, N, N, N],
  conferences: [M, M, V, N, N, N],
  doi: [M, M, V, N, N, N],
  certificates: [M, M, W, N, N, N],
  payments: [M, A, N, N, N, V],
  invoices: [M, V, N, N, N, V],
  referrals: [M, V, N, N, N, N],
  dispatch: [M, M, V, N, N, V],
  commLog: [M, M, V, N, N, W],
  templates: [M, V, N, N, N, N],
  whatsapp: [M, V, N, N, N, M],
  helpdesk: [M, V, N, N, N, M],
  chatbot: [M, N, N, N, N, V],
  cms: [M, M, N, N, N, N],
  board: [M, M, N, N, N, N],
  announcements: [M, M, N, N, N, N],
  awards: [M, M, N, N, N, N],
  awardApproval: [A, N, N, N, N, N],
  forms: [M, M, N, N, N, N],
  analytics: [M, V, N, N, N, N],
  scholar: [M, V, N, N, N, N],
  users: [M, N, N, N, N, N],
  journalSettings: [M, N, N, N, N, N],
  audit: [M, N, N, N, N, N],
}

const COLS: Role[] = ['super_admin', 'editor', 'associate_editor', 'reviewer', 'panel_member', 'support']

export const PERMISSION_MATRIX: Record<Area, Record<Role, Level>> = Object.fromEntries(
  (Object.keys(TABLE) as Area[]).map((area) => [
    area,
    Object.fromEntries(COLS.map((r, i) => [r, TABLE[area][i]])),
  ]),
) as Record<Area, Record<Role, Level>>

export function levelFor(role: Role | undefined, area: Area): Level {
  return role ? PERMISSION_MATRIX[area][role] : 'none'
}
