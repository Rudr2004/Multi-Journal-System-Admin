import type { JournalCode } from '@/shared/types'

/**
 * Unread conversation counts for the channels that have no store yet (Email and website chat), per journal.
 * WhatsApp is derived from the real chat list. Plausible seeded numbers, used by the Support dashboard only.
 */
export const INBOX_UNREAD_SEED: Record<'email' | 'chat', Record<JournalCode, number>> = {
  email: { IJMAT: 7, JIMRT: 4, IJCSD: 3, IJECM: 2, IJFRD: 3 },
  chat: { IJMAT: 2, JIMRT: 3, IJCSD: 1, IJECM: 0, IJFRD: 1 },
}

export const TICKET_PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const
