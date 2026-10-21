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
  | 'dashboard' | 'submissions' | 'reviewMgmt' | 'myReviews' | 'reviewAssign' | 'production' | 'finalApproval'
  | 'backdated' | 'postPub' | 'issues' | 'conferences' | 'doi' | 'certificates'
  | 'payments' | 'invoices' | 'referrals'
  | 'dispatch' | 'commLog' | 'templates' | 'notifications' | 'whatsapp' | 'inbox' | 'helpdesk' | 'chatbot'
  | 'cms' | 'blog' | 'board' | 'announcements' | 'awards' | 'awardApproval' | 'forms'
  | 'journalMetrics' | 'newsletter'
  | 'analytics' | 'scholar'
  | 'users' | 'journalSettings' | 'audit'

const N: Level = 'none'
const V: Level = 'view'
const W: Level = 'work'
const A: Level = 'approve'
const M: Level = 'manage'

// Columns: Super Admin, Editor, Associate Editor, Reviewer, Panel Member, Support Executive
// Source: Architecture v1.3 sections 8 (menus), 9 (responsibilities) and 10 (permission matrix). Super Admin is NOT an Editor:
// the Super Admin keeps oversight (read-only paper lookup, award approval) but has no editorial workflow modules. A role gets 'none' for every module
// that is not on its menu in the sheet, so nothing leaks into its navigation or routes.
type Row = [Level, Level, Level, Level, Level, Level]
const TABLE: Record<Area, Row> = {
  dashboard: [M, M, W, W, W, W],
  // Editorial
  submissions: [V, M, W, N, N, V], // Manuscript Submissions (Editor) / Assigned Manuscripts (AE, assigned only)
  reviewMgmt: [N, M, N, N, N, N],
  myReviews: [N, N, N, W, W, N], // Review Submissions (Reviewer) / Review Assignments (Panel Member)
  reviewAssign: [N, N, N, W, N, N], // Reviewer: external review assignments; can reassign to another Review Panel Member
  production: [N, V, W, N, N, N],
  finalApproval: [N, A, N, N, N, N], // publish / Return to Production
  backdated: [N, M, W, N, N, N], // AE = production step only
  postPub: [N, A, W, N, N, W], // Support raises, Editor approves, AE edits
  conferences: [M, M, W, N, N, N], // Conference Management / Conference Proceedings
  scholar: [N, M, N, N, N, N],
  awards: [V, M, N, N, N, N],
  awardApproval: [A, N, N, N, N, N],
  // Publishing (Super Admin: Journal & Issue Management)
  issues: [M, N, N, N, N, N],
  doi: [M, N, N, N, N, N],
  certificates: [M, N, W, N, N, N],
  // Finance
  payments: [M, A, N, N, N, N], // Editor verifies payments inside Manuscript Submissions
  invoices: [M, V, N, N, N, N],
  referrals: [M, N, N, N, N, N],
  // Communication
  notifications: [M, N, N, N, N, N], // Notification Management (author messages, schedule, staff alerts)
  templates: [M, N, N, N, N, N],
  dispatch: [M, N, N, N, N, N],
  commLog: [M, N, N, N, N, N],
  inbox: [N, N, N, N, N, M], // Communication Inbox (Chat / Mail / WA)
  whatsapp: [N, N, N, N, N, M],
  helpdesk: [N, N, N, N, N, M], // Ticket Management
  chatbot: [N, N, N, N, N, N],
  newsletter: [M, N, N, N, N, N],
  // Website
  cms: [M, M, N, N, N, N], // Page Management
  blog: [M, A, N, W, N, N], // Blog & Resources (Reviewer drafts, Editor approves)
  board: [M, M, N, N, N, N],
  announcements: [M, M, N, N, N, N],
  forms: [M, M, N, N, N, N],
  journalMetrics: [M, N, N, N, N, N],
  // Insights & administration
  analytics: [M, N, N, N, N, N],
  users: [M, N, N, N, N, N],
  journalSettings: [M, N, N, N, N, N],
  audit: [M, N, N, N, N, N],
}

const COLS: Role[] = ['SUPER_ADMIN', 'EDITOR', 'ASSOCIATE_EDITOR', 'REVIEWER', 'REVIEW_PANEL_MEMBER', 'SUPPORT_EXECUTIVE']

export const PERMISSION_MATRIX: Record<Area, Record<Role, Level>> = Object.fromEntries(
  (Object.keys(TABLE) as Area[]).map((area) => [
    area,
    Object.fromEntries(COLS.map((r, i) => [r, TABLE[area][i]])),
  ]),
) as Record<Area, Record<Role, Level>>

export function levelFor(role: Role | undefined, area: Area): Level {
  return role ? PERMISSION_MATRIX[area][role] : 'none'
}

/** Several roles in one journal add up: the highest level of any of them applies. */
export function levelForRoles(roles: readonly Role[], area: Area): Level {
  return roles.reduce<Level>((best, r) => (LEVEL_RANK[levelFor(r, area)] > LEVEL_RANK[best] ? levelFor(r, area) : best), 'none')
}
