import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ActivityEntry, Author, AuditEntry, DoiDeposit, Issue, JournalCode, JournalScope, MessageLogEntry, Paper, PaperEvent, Payment, StaffUser, Ticket, WhatsAppChat } from '@/shared/types'
import type { Me } from '@/lib/api/types'
import { staffUserFromMe } from '@/permissions/me'
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
  /** Per journal: assign paid articles to an Associate Editor automatically. */
  autoAssignAe: Record<JournalCode, boolean>
  reset: () => void
  patch: (p: Partial<Omit<DataState, 'reset' | 'patch'>>) => void
}

/**
 * Changes made to a paper (status, assignee, reviewer…) are remembered in the browser, so a paper keeps the status an
 * authorised person gave it when it is reopened or the page is reloaded. "Reset demo data" clears them.
 */
const OVERRIDES_KEY = 'journal-admin-paper-overrides'
export const loadPaperOverrides = (): Record<string, Partial<Paper>> => {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '{}') as Record<string, Partial<Paper>> } catch { return {} }
}
export const savePaperOverride = (id: string, patch: Partial<Paper>) => {
  try {
    const all = loadPaperOverrides()
    all[id] = { ...all[id], ...patch }
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(all))
  } catch { /* storage may be unavailable; the change still applies for this session */ }
}
const clearPaperOverrides = () => { try { localStorage.removeItem(OVERRIDES_KEY) } catch { /* ignore */ } }

function seed() {
  const overrides = loadPaperOverrides()
  const papers = buildPapers().map((p) => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p))
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
    autoAssignAe: Object.fromEntries(JOURNAL_CODES.map((c) => [c, true])) as Record<JournalCode, boolean>,
  }
}

export const useDataStore = create<DataState>((set) => ({
  ...seed(),
  reset: () => {
    clearPaperOverrides()
    set(seed())
    const { me } = useSession.getState()
    if (me) applyMe(me) // the signed-in person is not part of the seed data
  },
  patch: (p) => set(p),
}))

registerReset(() => useDataStore.getState().reset())

/* ---------- Session + UI preferences ---------- */
export type Density = 'comfortable' | 'compact'

/** Why a session ended without the person asking for it (shown once on the sign-in page). */
export type SessionNotice = 'revoked' | 'expired' | 'unreachable'

/** `loading`: restoring the session from the refresh cookie on page load. */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface SessionState {
  authStatus: AuthStatus
  /** The signed-in person as the platform API describes them. Never persisted: it is restored from the refresh cookie. */
  me: Me | null
  userId: string | null
  notice: SessionNotice | null
  journal: JournalScope
  density: Density
  sidebarCollapsed: boolean
  flags: FeatureFlags
  setJournal: (j: JournalScope) => void
  setDensity: (d: Density) => void
  toggleSidebar: () => void
  setFlag: (k: keyof FeatureFlags, v: boolean) => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      authStatus: 'loading',
      me: null,
      userId: null,
      notice: null,
      journal: 'ALL',
      density: 'comfortable',
      sidebarCollapsed: false,
      flags: DEFAULT_FLAGS,
      setJournal: (journal) => set({ journal }),
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setFlag: (k, v) => set((s) => ({ flags: { ...s.flags, [k]: v } })),
    }),
    {
      name: 'journal-admin-session',
      version: 3,
      // Identity and permissions are never stored in the browser; only display preferences.
      partialize: (s) => ({ journal: s.journal, density: s.density, sidebarCollapsed: s.sidebarCollapsed }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<SessionState>
        return { journal: p.journal, density: p.density, sidebarCollapsed: p.sidebarCollapsed }
      },
    },
  ),
)

/** Makes `me` the current person: stored for access checks, and added to the mock user list the other screens read names from. */
export function applyMe(me: Me) {
  const user = staffUserFromMe(me)
  const { users, patch } = useDataStore.getState()
  patch({ users: users.some((u) => u.id === user.id) ? users.map((u) => (u.id === user.id ? { ...u, ...user } : u)) : [...users, user] })
  useSession.setState((s) => ({ me, userId: me.id, authStatus: 'authenticated', flags: { ...s.flags, reviewPanel: me.flags.reviewPanel } }))
}

export function clearMe(notice: SessionNotice | null = null) {
  useSession.setState({ me: null, userId: null, authStatus: 'anonymous', notice })
}
