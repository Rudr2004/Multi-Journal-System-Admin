import type { Journal, JournalCode, StaffUser } from '@/shared/types'

/** Journal names are placeholders until the client confirms them. */
export const JOURNALS: Journal[] = [
  { code: 'IJMAT', slot: 'J1', name: 'International Journal of Multidisciplinary Applied Technology', domain: 'ijmat.example.org', issn: '2584-1001' },
  { code: 'JIMRT', slot: 'J2', name: 'Journal of Interdisciplinary Management Research & Technology', domain: 'jimrt.example.org', issn: '2584-1002' },
  { code: 'IJCSD', slot: 'J3', name: 'International Journal of Computer Science & Development', domain: 'ijcsd.example.org', issn: '2584-1003' },
  { code: 'IJECM', slot: 'J4', name: 'International Journal of Engineering, Computing & Materials', domain: 'ijecm.example.org', issn: '2584-1004' },
  { code: 'IJFRD', slot: 'J5', name: 'International Journal of Finance Research & Development', domain: 'ijfrd.example.org', issn: '2584-1005' },
]
export const JOURNAL_CODES = JOURNALS.map((j) => j.code)
export const journalByCode = (c: JournalCode) => JOURNALS.find((j) => j.code === c)!

export const DEMO_PASSWORD = 'demo'

const ALL = Object.fromEntries(JOURNAL_CODES.map((c) => [c, 'super_admin'])) as StaffUser['assignments']

export const SEED_USERS: StaffUser[] = [
  { id: 'u-super', name: 'Priya Menon', email: 'priya.menon@edtechpublishers.in', title: 'Publishing Director', status: 'active', twoStep: true, assignments: ALL },
  { id: 'u-editor', name: 'Rohan Mehta', email: 'rohan.mehta@edtechpublishers.in', title: 'Senior Editor', status: 'active', twoStep: false, assignments: { IJMAT: 'editor', IJCSD: 'editor' } },
  { id: 'u-ae', name: 'Neha Kapoor', email: 'neha.kapoor@edtechpublishers.in', title: 'Associate Editor', status: 'active', twoStep: false, assignments: { JIMRT: 'associate_editor' } },
  { id: 'u-multi', name: 'Karan Shah', email: 'karan.shah@edtechpublishers.in', title: 'Editor & Associate Editor', status: 'active', twoStep: false, assignments: { IJMAT: 'editor', JIMRT: 'associate_editor' } },
  { id: 'u-reviewer', name: 'Dr. Ananya Iyer', email: 'ananya.iyer@edtechpublishers.in', title: 'In-house Reviewer', status: 'active', twoStep: false, assignments: { IJMAT: 'reviewer' } },
  { id: 'u-panel', name: 'Dr. Sofia Alvarez', email: 'sofia.alvarez@university.example', title: 'Review Panel Member', status: 'active', twoStep: false, assignments: { IJECM: 'panel_member' } },
  { id: 'u-rev-cs', name: 'Dr. Vikrant Rao', email: 'vikrant.rao@edtechpublishers.in', title: 'In-house Reviewer', status: 'active', twoStep: false, assignments: { IJCSD: 'reviewer', IJECM: 'reviewer' } },
  { id: 'u-rev-mgmt', name: 'Prof. Meenal Joshi', email: 'meenal.joshi@edtechpublishers.in', title: 'In-house Reviewer', status: 'active', twoStep: false, assignments: { JIMRT: 'reviewer', IJFRD: 'reviewer' } },
  { id: 'u-panel-2', name: 'Dr. Hannah Weiss', email: 'hannah.weiss@university.example', title: 'Review Panel Member', status: 'active', twoStep: false, assignments: { IJMAT: 'panel_member', JIMRT: 'panel_member', IJCSD: 'panel_member', IJFRD: 'panel_member' } },
  { id: 'u-support', name: 'Isha Desai', email: 'isha.desai@edtechpublishers.in', title: 'Support Executive', status: 'active', twoStep: false, assignments: { IJMAT: 'support', JIMRT: 'support' } },
]

/** Shown as quick-fill chips on the login screen (prototype only). */
export const DEMO_USER_LABELS: Record<string, string> = {
  'u-super': 'Super Admin — all journals',
  'u-editor': 'Editor — IJMAT, IJCSD',
  'u-ae': 'Associate Editor — JIMRT',
  'u-multi': 'Multi-role — Editor IJMAT, Assoc. Editor JIMRT',
  'u-reviewer': 'Reviewer — IJMAT',
  'u-panel': 'Review Panel Member — IJECM',
  'u-support': 'Support Executive — IJMAT, JIMRT',
}
