import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, FileText, Users, ClipboardCheck, ClipboardList, Factory, History, FilePenLine, BookOpen,
  Presentation, CreditCard, Gift, BellRing, MessagesSquare, LifeBuoy, Globe, UserSquare2, Megaphone, Trophy,
  Inbox, BarChart3, Search, UserCog, Settings, ScrollText, Gauge, Newspaper, Mail, Library, FileCheck2,
  Link2, Award, Receipt, Send, Bot, BadgeCheck, MessageCircle,
} from 'lucide-react'
import type { Role } from '@/shared/types'
import type { Area } from '@/permissions/matrix'
import { levelFor } from '@/permissions/matrix'
import type { FlagBadge } from '@/permissions/flags'

export interface NavItem {
  path: string
  /** The client's exact module name for this role. */
  label: string
  description: string
  area: Area
  icon: LucideIcon
  /** Kept for the placeholder screen; every screen is built. */
  phase: number
  /** Marked "Draft — details to be finalised" as agreed with the client. */
  draft?: boolean
  /** Small badge in the page header, e.g. an item the client still has to confirm. */
  badge?: FlagBadge
}
export interface NavGroup {
  /** Empty label = the group has no heading (the main block). */
  label: string
  items: NavItem[]
}

const i = (
  path: string, label: string, area: Area, icon: LucideIcon, description: string, extra: Partial<NavItem> = {},
): NavItem => ({ path, label, area, icon, description, phase: 0, ...extra })

/* ---------- Module definitions (one place for each screen's path, area and description) ---------- */
const M = {
  dashboard: i('/', 'Dashboard', 'dashboard', LayoutDashboard, 'What needs your attention today.'),
  users: i('/users', 'User Management', 'users', UserCog, 'Invite staff, assign a role per journal and manage access.'),
  issues: i('/issues', 'Journal & Issue Management', 'issues', BookOpen, 'Volumes, issues, DOI deposits and certificates.'),
  issuesEditor: i('/issues', 'Journal & Issue Management', 'issues', BookOpen, 'Volumes, monthly issues, call for papers and publishing an issue.'),
  conferencesAdmin: i('/conferences', 'Conference Management', 'conferences', Presentation, 'Conferences and their proceedings issues.'),
  conferencesEditor: i('/conferences', 'Conference Proceedings', 'conferences', Presentation, 'Proceedings issues and conference papers.'),
  announcements: i('/announcements', 'Announcements', 'announcements', Megaphone, 'Scrolling notifications and tab notifications for the website.', { badge: 'To confirm' }),
  boardAdmin: i('/editorial-board', 'Editorial Board Management', 'board', UserSquare2, 'Board members by role group.'),
  boardEditor: i('/editorial-board', 'Editorial Board', 'board', UserSquare2, 'Board members by role group.'),
  metrics: i('/journal-metrics', 'Journal Metrics', 'journalMetrics', Gauge, 'Ratings, statistics and indexing logos shown on the website.', { badge: 'To confirm' }),
  pages: i('/pages', 'Page Management', 'cms', Globe, 'Static pages, SEO and home page sections.'),
  notifications: i('/notifications', 'Notification Management', 'notifications', BellRing, 'Author messages, schedule and staff alerts.', { badge: 'To confirm' }),
  referrals: i('/referrals', 'Referral Management', 'referrals', Gift, 'Referral credits and manual payouts.'),
  newsletter: i('/newsletter', 'Newsletter Subscribers', 'newsletter', Mail, 'Subscribers and newsletter campaigns.'),
  journalSettings: i('/journal-settings', 'Journal Settings', 'journalSettings', Settings, 'Website values, fees, subjects and feature switches.'),
  payments: i('/payments', 'Payments & Invoices', 'payments', CreditCard, 'Online and offline payments, GST invoices, credit notes and refunds.'),
  commLog: i('/communication-log', 'Communication Log', 'commLog', MessagesSquare, 'Every email, SMS and WhatsApp message with delivery status.'),
  forms: i('/forms-inbox', 'Forms Inbox', 'forms', Inbox, 'Applications and enquiries from the website.'),
  analytics: i('/analytics', 'Analytics', 'analytics', BarChart3, 'Submissions, decisions, revenue and delivery metrics.'),
  audit: i('/audit-log', 'Audit Log', 'audit', ScrollText, 'Who did what, when and where.'),
  manuscripts: i('/submissions', 'Manuscript Submissions', 'submissions', FileText, 'Screening, reviewer assignment, decisions, payment verification, final approval and publishing.'),
  assigned: i('/production', 'Assigned Manuscripts', 'production', Factory, 'Papers assigned to you for production: metadata, SEO, final paper and certificates.'),
  backdated: i('/backdated', 'Backdated Publications', 'backdated', History, 'Publish an older article into a past issue.'),
  postCorrectionsManagement: i('/post-publication', 'Post Corrections Management', 'postPub', FilePenLine, 'Review correction requests, set fees and approve new versions.'),
  postCorrections: i('/post-publication', 'Post Corrections', 'postPub', FilePenLine, 'Corrections, erratum, retractions and withdrawals.'),
  scholar: i('/scholar-indexing', 'Google Scholar Indexing', 'scholar', Search, 'Indexed status per article and per issue.'),
  awards: i('/awards', 'Award Management', 'awards', Trophy, 'Award cycles, shortlists and approvals.'),
  awardsAdmin: i('/awards', 'Award Approval', 'awards', Trophy, 'Approve or reject award winners nominated by Editors before they are issued or published.'),
  blog: i('/blog', 'Blog & Resources', 'blog', Newspaper, 'Blog posts and downloadable resources.', { badge: 'To confirm' }),
  reviewSubmissions: i('/my-reviews', 'Review Submissions', 'myReviews', ClipboardCheck, 'Papers assigned to you for review.', { badge: 'To confirm' }),
  reviewAssignmentsReviewer: i('/review-assignments', 'Review Assignments', 'reviewAssign', ClipboardList, 'Papers the Editor assigned to external Review Panel Members in your area.', { badge: 'Under discussion' }),
  reviewAssignmentsPanel: i('/my-reviews', 'Review Assignments', 'myReviews', ClipboardList, 'Papers assigned to you for review.', { badge: 'Under discussion' }),
  inbox: i('/inbox', 'Communication Inbox (Chat / Mail / WA)', 'inbox', MessageCircle, 'WhatsApp, email and website chat in one inbox.', { badge: 'To confirm' }),
  tickets: i('/helpdesk', 'Ticket Management', 'helpdesk', LifeBuoy, 'Support tickets and general enquiries.'),
}

/** Items that exist as tabs inside a menu module (reached through the section tab bar, not the sidebar). */
const TABS = {
  reviewMgmt: i('/review-management', 'Review management', 'reviewMgmt', Users, 'Assign reviewers, track due dates and send reminders.'),
  finalApproval: i('/final-approval', 'Final approval', 'finalApproval', BadgeCheck, 'Check the article page, pick an issue and publish.'),
  invoices: i('/invoices', 'Invoices & credit notes', 'invoices', Receipt, 'GST invoices and credit notes.'),
  doi: i('/doi', 'DOI & Crossref', 'doi', Link2, 'DOI deposits and their status.'),
  certificates: i('/certificates', 'Certificates', 'certificates', Award, 'Author certificates with QR verification.'),
  dispatch: i('/dispatch', '08:45 dispatch queue', 'dispatch', Send, 'Decision emails queued for the next dispatch batch.'),
  chatbot: i('/chatbot', 'Chatbot flows', 'chatbot', Bot, 'Menu-based chatbot tree and FAQs.'),
  templates: i('/templates', 'Templates & schedule', 'templates', Library, 'Message templates, time slots and reminder sequences.'),
  verify: i('/payments', 'Payment verification', 'payments', FileCheck2, 'Verify offline payments and issue invoices.'),
}

const group = (label: string, ...items: NavItem[]): NavGroup => ({ label, items })

/** The client's sidebar for each role, in the client's order. Nothing outside this list appears in a role's menu. */
export const ROLE_MENUS: Record<Role, NavGroup[]> = {
  super_admin: [
    group('', M.dashboard, M.users, M.issues, M.conferencesAdmin, M.announcements, M.boardAdmin, M.metrics, M.awardsAdmin, M.pages, M.notifications, M.referrals, M.newsletter),
    group('Settings', M.journalSettings, M.payments, M.commLog, M.forms, M.analytics, M.audit),
  ],
  editor: [
    group('', M.dashboard, M.manuscripts, M.backdated, M.conferencesEditor, M.postCorrectionsManagement, M.scholar, M.awards),
    group('Website', M.announcements, M.boardEditor, M.pages, M.blog, M.forms),
  ],
  associate_editor: [group('', M.dashboard, M.assigned, M.backdated, M.conferencesEditor, M.postCorrections)],
  reviewer: [group('', M.dashboard, M.reviewSubmissions, M.reviewAssignmentsReviewer, M.blog)],
  panel_member: [group('', M.dashboard, M.reviewAssignmentsPanel)],
  support: [group('', M.dashboard, M.inbox, M.tickets, M.postCorrections)],
}

/* ---------- Section tab bars (secondary navigation inside a module) ---------- */
export interface Section {
  id: string
  /** Name of the module the tabs belong to. */
  label: string
  roles: Role[]
  tabs: NavItem[]
}

export const SECTIONS: Section[] = [
  { id: 'manuscripts-editor', label: 'Manuscript Submissions', roles: ['editor'], tabs: [{ ...M.manuscripts, label: 'Manuscripts' }, TABS.reviewMgmt, TABS.verify, TABS.finalApproval] },
  { id: 'finance-admin', label: 'Payments & Invoices', roles: ['super_admin'], tabs: [{ ...M.payments, label: 'Payments' }, TABS.invoices] },
  { id: 'publishing-admin', label: 'Journal & Issue Management', roles: ['super_admin'], tabs: [{ ...M.issues, label: 'Volumes & issues' }, TABS.doi, TABS.certificates] },
  { id: 'notifications-admin', label: 'Notification Management', roles: ['super_admin'], tabs: [{ ...M.notifications, label: 'Notification Management' }, TABS.dispatch] },
]

/** Every routed module (menu items and tab-only screens), de-duplicated by path. */
export const ALL_NAV_ITEMS: NavItem[] = (() => {
  const seen = new Map<string, NavItem>()
  const add = (n: NavItem) => { if (!seen.has(n.path)) seen.set(n.path, n) }
  Object.values(ROLE_MENUS).forEach((gs) => gs.forEach((g) => g.items.forEach(add)))
  Object.values(TABS).forEach(add)
  SECTIONS.forEach((s) => s.tabs.forEach(add))
  add(TABS.templates)
  return [...seen.values()]
})()

/** Menu groups for a role, with anything the permission matrix blocks removed (safety net). */
export function menuFor(role: Role | undefined): NavGroup[] {
  if (!role) return []
  return ROLE_MENUS[role]
    .map((g) => ({ ...g, items: g.items.filter((n) => levelFor(role, n.area) !== 'none') }))
    .filter((g) => g.items.length)
}

export function sectionFor(role: Role | undefined, pathname: string): Section | undefined {
  if (!role) return undefined
  return SECTIONS.find((s) => s.roles.includes(role) && s.tabs.some((t) => t.path === pathname && levelFor(role, t.area) !== 'none'))
}

/** Which menu entry (and group) a URL belongs to for this role — used for titles and breadcrumbs. */
export function resolveNav(role: Role | undefined, pathname: string): { group?: NavGroup; item?: NavItem; exact?: boolean } {
  const groups = menuFor(role)
  const flat = groups.flatMap((g) => g.items.map((item) => ({ g, item })))
  const exact = flat.find((x) => x.item.path === pathname)
  if (exact) return { group: exact.g, item: exact.item, exact: true }
  const sec = role && SECTIONS.find((s) => s.roles.includes(role) && s.tabs.some((t) => pathname === t.path || (t.path !== '/' && pathname.startsWith(t.path + '/'))))
  if (sec) {
    const primary = flat.find((x) => sec.tabs.some((t) => t.path === x.item.path))
    if (primary) return { group: primary.g, item: primary.item, exact: false }
  }
  const prefix = flat.filter((x) => x.item.path !== '/' && pathname.startsWith(x.item.path + '/')).sort((a, b) => b.item.path.length - a.item.path.length)[0]
  return prefix ? { group: prefix.g, item: prefix.item, exact: false } : {}
}
