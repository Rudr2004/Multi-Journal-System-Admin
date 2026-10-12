import type { Role } from '@/shared/types'

export const ROLE_META: Record<Role, { label: string; short: string; description: string }> = {
  super_admin: { label: 'Super Admin', short: 'Super Admin', description: 'All journals, users, settings and audit.' },
  editor: { label: 'Journal Editor', short: 'Editor', description: 'Screening, decisions, payments, publishing.' },
  associate_editor: { label: 'Associate Editor', short: 'Assoc. Editor', description: 'Production and post-publication edits.' },
  reviewer: { label: 'Reviewer', short: 'Reviewer', description: 'In-house reviews on assigned papers.' },
  panel_member: { label: 'Review Panel Member', short: 'Panel Member', description: 'External reviews outside in-house expertise.' },
  support: { label: 'Support Staff', short: 'Support', description: 'WhatsApp, helpdesk and enquiries.' },
}

export const ROLE_ORDER: Role[] = ['super_admin', 'editor', 'associate_editor', 'reviewer', 'panel_member', 'support']
