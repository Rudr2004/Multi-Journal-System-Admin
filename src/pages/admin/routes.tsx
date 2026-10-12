import type { PageDef } from '@/app/pageDef'
import { AuditLogPage } from './AuditLogPage'
import { JournalSettingsPage } from './JournalSettingsPage'
import { UserDetailPage } from './UserDetailPage'
import { UsersPage } from './UsersPage'

/** Screens for the admin area (Super Admin only). */
export const adminPages: PageDef[] = [
  { path: '/users', area: 'users', element: <UsersPage /> },
  { path: '/users/:userId', area: 'users', element: <UserDetailPage /> },
  { path: '/journal-settings', area: 'journalSettings', element: <JournalSettingsPage /> },
  { path: '/audit-log', area: 'audit', element: <AuditLogPage /> },
]
