import type { JournalCode } from '@/shared/types'

/** Journal identity colours — used ONLY for the small dot/badge, never as the dashboard theme. */
export const JOURNAL_COLORS: Record<JournalCode, string> = {
  IJMAT: '#2563EB',
  JIMRT: '#065F46',
  IJCSD: '#4B2E9B',
  IJECM: '#0284C7',
  IJFRD: '#9A3412',
}

/** Chart categorical palette. */
export const CHART_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#64748B']
