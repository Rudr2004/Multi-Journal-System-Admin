import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ActivityEntry, Author, AuditEntry, DoiDeposit, Issue, JournalScope, MessageLogEntry, Paper, PaperEvent, Payment, StaffUser, Ticket, WhatsAppChat } from '@/shared/types'
import { DEFAULT_FLAGS, type FeatureFlags } from '@/permissions/features'
import { JOURNAL_CODES, SEED_USERS } from './data/core'
import { buildIssues, buildPayments } from './data/finance'
import { registerReset } from './reset'
import { buildPapers } from './data/papers'
import { buildDeposits } from './data/authors'
import { buildActivity, buildChats, buildMessages, buildTickets } from './data/ops'

/* ---------- Domain data (in-memory, resets on reload or via Prototype controls) ---------- */
interface DataState {
  users: StaffUser[]
  papers: Paper[]
  tickets: Ticket[]
  chats: WhatsAppChat[]
  messages: MessageLogEntry[]
  activity: ActivityEntry[]
  payments: Payment[]
  issues: Issue[]
  events: PaperEvent[]
  audit: AuditEntry[]
  deposits: DoiDeposit[]
  /** Edited author lists (e.g. post-publication name corrections), by Paper ID. */
  authorsOverride: Record<string, Author[]>
  reset: () => void
  patch: (p: Partial<Omit<DataState, 'reset' | 'patch'>>) => void
}

function seed() {
  const papers = buildPapers()
  return {
    users: structuredClone(SEED_USERS),
    papers,
    tickets: buildTickets(),
    chats: buildChats(papers),
    messages: buildMessages(papers),
    activity: buildActivity(papers),
    payments: buildPayments(papers),
    issues: buildIssues(papers, JOURNAL_CODES),
    events: [] as PaperEvent[],
    audit: [] as AuditEntry[],
    deposits: buildDeposits(papers),
    authorsOverride: {} as Record<string, Author[]>,
  }
}

export const useDataStore = create<DataState>((set) => ({
  ...seed(),
  reset: () => set(seed()),
  patch: (p) => set(p),
}))

registerReset(() => useDataStore.getState().reset())

/* ---------- Session + UI preferences (persisted per browser) ---------- */
export type Density = 'comfortable' | 'compact'

interface SessionState {
  userId: string | null
  pending2faUserId: string | null
  journal: JournalScope
  density: Density
  sidebarCollapsed: boolean
  flags: FeatureFlags
  setUser: (id: string | null, journal: JournalScope) => void
  setPending2fa: (id: string | null) => void
  setJournal: (j: JournalScope) => void
  setDensity: (d: Density) => void
  toggleSidebar: () => void
  setFlag: (k: keyof FeatureFlags, v: boolean) => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      pending2faUserId: null,
      journal: 'ALL',
      density: 'comfortable',
      sidebarCollapsed: false,
      flags: DEFAULT_FLAGS,
      setUser: (userId, journal) => set({ userId, journal, pending2faUserId: null }),
      setPending2fa: (pending2faUserId) => set({ pending2faUserId }),
      setJournal: (journal) => set({ journal }),
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setFlag: (k, v) => set((s) => ({ flags: { ...s.flags, [k]: v } })),
    }),
    {
      name: 'journal-admin-session',
      version: 2,
      migrate: (persisted) => ({ ...(persisted as object), flags: DEFAULT_FLAGS }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SessionState>
        return { ...current, ...p, flags: { ...current.flags, ...(p.flags ?? {}) } }
      },
    },
  ),
)
