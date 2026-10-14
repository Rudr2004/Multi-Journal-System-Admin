import type { Role } from '@/shared/types'

/** Role names follow the client's role sheet. */
export const ROLE_META: Record<Role, { label: string; short: string; description: string }> = {
  super_admin: { label: 'Super Admin', short: 'Super Admin', description: 'All journals, users, settings, website and audit.' },
  editor: { label: 'Editor', short: 'Editor', description: 'Manuscripts, decisions, payments, publishing, website content.' },
  associate_editor: { label: 'Associate Editor', short: 'Assoc. Editor', description: 'Production, backdated, conference and correction work.' },
  reviewer: { label: 'Reviewer', short: 'Reviewer', description: 'In-house reviews on assigned papers; blog posts.' },
  panel_member: { label: 'Review Panel Member', short: 'Panel Member', description: 'External reviews on assigned papers only.' },
  support: { label: 'Support Executive', short: 'Support', description: 'Communication inbox, tickets and correction requests.' },
}

export const ROLE_ORDER: Role[] = ['super_admin', 'editor', 'associate_editor', 'reviewer', 'panel_member', 'support']
