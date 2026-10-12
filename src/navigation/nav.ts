import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, FileText, Users, ClipboardCheck, Factory, BadgeCheck, History, FilePenLine, BookOpen,
  Presentation, Link2, Award, CreditCard, Receipt, Gift, Send, MessagesSquare, Mail, MessageCircle, LifeBuoy,
  Bot, Globe, UserSquare2, Megaphone, Trophy, Inbox, BarChart3, Search, UserCog, Settings, ScrollText,
} from 'lucide-react'
import type { Area } from '@/permissions/matrix'

export interface NavItem {
  path: string
  label: string
  description: string
  area: Area
  icon: LucideIcon
  /** Build phase in which the real screen lands; earlier phases show a placeholder. */
  phase: number
  /** Marked "Draft — details to be finalised" as agreed with the client. */
  draft?: boolean
}
export interface NavGroup {
  label: string
  items: NavItem[]
}

const i = (
  path: string,
  label: string,
  area: Area,
  icon: LucideIcon,
  phase: number,
  description: string,
  draft?: boolean,
): NavItem => ({ path, label, area, icon, phase, description, draft })

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [i('/', 'Dashboard', 'dashboard', LayoutDashboard, 1, 'What needs your attention today.')],
  },
  {
    label: 'Editorial',
    items: [
      i('/submissions', 'Submissions', 'submissions', FileText, 2, 'Every paper in the selected journal, from submission to publication.'),
      i('/review-management', 'Review management', 'reviewMgmt', Users, 2, 'Assign reviewers, track due dates and send reminders.'),
      i('/my-reviews', 'My reviews', 'myReviews', ClipboardCheck, 2, 'Papers assigned to you for review.'),
      i('/production', 'Production queue', 'production', Factory, 3, 'Accepted and paid papers being prepared for publication.'),
      i('/final-approval', 'Final approval', 'finalApproval', BadgeCheck, 3, 'Check the article page, pick an issue and publish.'),
      i('/backdated', 'Backdated publication', 'backdated', History, 3, 'Publish an older article into a past issue.'),
      i('/post-publication', 'Post-publication changes', 'postPub', FilePenLine, 3, 'Corrections, erratum, retractions and withdrawals.'),
    ],
  },
  {
    label: 'Publishing',
    items: [
      i('/issues', 'Volumes & issues', 'issues', BookOpen, 4, 'Plan, fill and publish volumes and issues.'),
      i('/conferences', 'Conferences', 'conferences', Presentation, 4, 'Conference listings and proceedings issues.'),
      i('/doi', 'DOI & Crossref', 'doi', Link2, 4, 'DOI deposits and their status.'),
      i('/certificates', 'Certificates', 'certificates', Award, 4, 'Author certificates with QR verification.'),
    ],
  },
  {
    label: 'Finance',
    items: [
      i('/payments', 'Payments', 'payments', CreditCard, 4, 'Online and offline payments, proofs and refunds.'),
      i('/invoices', 'Invoices & credit notes', 'invoices', Receipt, 4, 'GST invoices and credit notes.'),
      i('/referrals', 'Referrals', 'referrals', Gift, 4, 'Referral credits and manual payouts.'),
    ],
  },
  {
    label: 'Communication',
    items: [
      i('/dispatch', '08:45 dispatch queue', 'dispatch', Send, 5, 'Decision emails queued for the next dispatch batch.'),
      i('/communication-log', 'Communication log', 'commLog', MessagesSquare, 5, 'Every email, SMS and WhatsApp message with delivery status.'),
      i('/templates', 'Templates & schedule', 'templates', Mail, 5, 'Message templates, time slots and reminder sequences.'),
      i('/whatsapp', 'WhatsApp inbox', 'whatsapp', MessageCircle, 5, 'Conversations with authors.', true),
      i('/helpdesk', 'Helpdesk tickets', 'helpdesk', LifeBuoy, 5, 'Support tickets and general enquiries.', true),
      i('/chatbot', 'Chatbot flows', 'chatbot', Bot, 5, 'Menu-based chatbot tree and FAQs.'),
    ],
  },
  {
    label: 'Website',
    items: [
      i('/pages', 'Pages & blog', 'cms', Globe, 6, 'Website pages, SEO fields and blog posts.'),
      i('/editorial-board', 'Editorial board', 'board', UserSquare2, 6, 'Board members by role group.'),
      i('/announcements', 'Announcements', 'announcements', Megaphone, 6, 'News, calls for papers and deadlines.'),
      i('/awards', 'Awards', 'awards', Trophy, 6, 'Award cycles, shortlists and approvals.'),
      i('/forms-inbox', 'Forms inbox', 'forms', Inbox, 6, 'Applications and enquiries from the website.'),
    ],
  },
  {
    label: 'Insights',
    items: [
      i('/analytics', 'Analytics', 'analytics', BarChart3, 7, 'Submissions, decisions, revenue and delivery metrics.'),
      i('/scholar-indexing', 'Google Scholar indexing', 'scholar', Search, 7, 'Indexed status per article.'),
    ],
  },
  {
    label: 'Administration',
    items: [
      i('/users', 'Users & roles', 'users', UserCog, 7, 'Invite staff and assign a role per journal.'),
      i('/journal-settings', 'Journals & settings', 'journalSettings', Settings, 7, 'Per-journal configuration.'),
      i('/audit-log', 'Audit log', 'audit', ScrollText, 7, 'Who did what, when and where.'),
    ],
  },
]

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)
