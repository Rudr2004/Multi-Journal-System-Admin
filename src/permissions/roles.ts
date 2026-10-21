import type { Role } from '@/shared/types'

/** Role names follow the client's role sheet. */
export const ROLE_META: Record<Role, { label: string; short: string; description: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', short: 'Super Admin', description: 'All journals, users, settings, website and audit.' },
  EDITOR: { label: 'Editor', short: 'Editor', description: 'Manuscripts, decisions, payments, publishing, website content.' },
  ASSOCIATE_EDITOR: { label: 'Associate Editor', short: 'Assoc. Editor', description: 'Production, backdated, conference and correction work.' },
  REVIEWER: { label: 'Reviewer', short: 'Reviewer', description: 'In-house reviews on assigned papers; blog posts.' },
  REVIEW_PANEL_MEMBER: { label: 'Review Panel Member', short: 'Panel Member', description: 'External reviews on assigned papers only.' },
  SUPPORT_EXECUTIVE: { label: 'Support Executive', short: 'Support', description: 'Communication inbox, tickets and correction requests.' },
}

export const ROLE_ORDER: Role[] = ['SUPER_ADMIN', 'EDITOR', 'ASSOCIATE_EDITOR', 'REVIEWER', 'REVIEW_PANEL_MEMBER', 'SUPPORT_EXECUTIVE']
