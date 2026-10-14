import { addDays, parseISO } from 'date-fns'
import type { Author, Issue, JournalCode, Paper, PaperStatus } from '@/shared/types'
import { backdatedId, doiFor } from '@/shared/paperId'
import { addDeposit, currentActor, getAuthors, logEvent, productionAssigneeFor, recordAudit, sendMessage, updatePaper } from '../actions'
import { buildRecord, draftSeo, hashString, readiness, type BackdatedItem, type ProductionRecord, type Readiness } from '../data/production'
import { journalByCode } from '../data/core'
import { useDataStore } from '../store'
import { useProductionStore } from '../stores/production'
import { ApiError, delay } from './latency'

export const PRODUCTION_STATUSES: PaperStatus[] = ['paid', 'in_production', 'returned_to_production', 'ready_for_approval']
/** Papers that are listed publicly on the Article In Press page while the Associate Editor works on them. */
export const IN_PRESS_STATUSES: PaperStatus[] = ['in_production', 'returned_to_production', 'ready_for_approval']
export const PUBLISHED_STATUSES: PaperStatus[] = ['published', 'indexed', 'corrected', 'retracted']

const store = () => useDataStore.getState()
const pstore = () => useProductionStore.getState()

export const assigneeOf = (p: Paper) => p.assigneeId ?? productionAssigneeFor(p.journal)
export const userName = (id?: string) => (id ? store().users.find((u) => u.id === id)?.name : undefined)
export const dueOf = (p: Paper) => p.productionDue ?? addDays(parseISO(p.updatedAt), 5).toISOString()

/** The workspace record for a paper, created from deterministic seed content on first access. */
export function ensureRecord(paperId: string): ProductionRecord {
  const existing = pstore().records[paperId]
  if (existing) return existing
  const paper = store().papers.find((p) => p.id === paperId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  const rec = buildRecord(paper, getAuthors(paperId))
  pstore().patch({ records: { ...pstore().records, [paperId]: rec } })
  return rec
}

function saveRecord(paperId: string, next: ProductionRecord) {
  pstore().patch({ records: { ...pstore().records, [paperId]: next } })
}

/* ---------------------------------------------------------------- */
/* Production queue + workspace                                      */
/* ---------------------------------------------------------------- */

export interface QueueRow {
  paper: Paper
  assigneeId?: string
  assigneeName?: string
  due: string
  missing: number
  returned: boolean
  /** Listed on the Article In Press page until the Editor publishes it. */
  inPress: boolean
}

export async function listProductionQueue(journals: JournalCode[], onlyAssignedTo?: string): Promise<QueueRow[]> {
  const rows = store().papers
    .filter((p) => journals.includes(p.journal) && PRODUCTION_STATUSES.includes(p.status))
    .filter((p) => !onlyAssignedTo || assigneeOf(p) === onlyAssignedTo)
    .map((p) => {
      const rec = ensureRecord(p.id)
      const a = assigneeOf(p)
      return { paper: p, assigneeId: a, assigneeName: userName(a), due: dueOf(p), missing: readiness(rec, !!rec.returnNote).missing.length, returned: p.status === 'returned_to_production', inPress: IN_PRESS_STATUSES.includes(p.status) }
    })
  return delay(rows)
}

export interface Workspace {
  paper: Paper
  record: ProductionRecord
  assigneeId?: string
  assigneeName?: string
}

export async function getWorkspace(paperId: string): Promise<Workspace> {
  const paper = store().papers.find((p) => p.id === paperId)
  if (!paper) throw new ApiError('This paper does not exist or is no longer available.', 'not_found')
  const record = ensureRecord(paperId)
  const a = assigneeOf(paper)
  return delay({ paper, record, assigneeId: a, assigneeName: userName(a) })
}

export async function startProduction(paperId: string): Promise<void> {
  const paper = store().papers.find((p) => p.id === paperId)
  if (!paper || paper.status !== 'paid') throw new ApiError('Only paid papers can be started.')
  updatePaper(paperId, { status: 'in_production' }, { event: 'Production started', audit: 'Production started' })
  await delay(undefined, 200, 400)
}

/** Autosave target: merges edits into the stored record without latency. */
export function saveDraft(paperId: string, draft: Partial<ProductionRecord>): void {
  const rec = ensureRecord(paperId)
  saveRecord(paperId, { ...rec, ...draft, savedAt: new Date().toISOString() })
}

export async function uploadFinalFile(paperId: string, fileName: string, sizeKb: number): Promise<ProductionRecord> {
  const rec = ensureRecord(paperId)
  const version = (rec.finalFile?.version ?? 0) + 1
  const next: ProductionRecord = { ...rec, finalFile: { name: fileName, version, uploadedAt: new Date().toISOString(), uploadedBy: currentActor(), sizeKb } }
  saveRecord(paperId, next)
  const paper = store().papers.find((p) => p.id === paperId)
  logEvent(paperId, `uploaded final paper file ${fileName} (version ${version})`)
  recordAudit({ journal: paper?.journal ?? 'ALL', action: 'Final paper file uploaded', target: paperId, oldValue: rec.finalFile ? `v${rec.finalFile.version}` : undefined, newValue: `v${version}` })
  return delay(next, 400, 800)
}

export function certificateDraftFor(rec: ProductionRecord, authors: Author[], onlyEmails?: string[]) {
  const now = new Date().toISOString()
  const keep = rec.certificates.filter((c) => !!onlyEmails && !onlyEmails.includes(c.authorEmail) && authors.some((a) => a.email === c.authorEmail))
  const regen = authors.filter((a) => !onlyEmails || onlyEmails.includes(a.email)).map((a) => {
    const prev = rec.certificates.find((c) => c.authorEmail === a.email)
    return { authorEmail: a.email, name: a.name, date: prev?.date ?? now, version: (prev?.version ?? 0) + 1, generatedAt: now }
  })
  return authors.map((a) => [...keep, ...regen].find((c) => c.authorEmail === a.email)).filter((c): c is NonNullable<typeof c> => !!c)
}

export async function generateCertificates(paperId: string, onlyEmails?: string[], override?: { email: string; name: string; date: string }): Promise<ProductionRecord> {
  const rec = ensureRecord(paperId)
  let authors = rec.authors
  if (override) authors = authors.map((a) => (a.email === override.email ? { ...a, name: override.name } : a))
  let certs = certificateDraftFor({ ...rec, authors }, authors, onlyEmails)
  if (override) certs = certs.map((c) => (c.authorEmail === override.email ? { ...c, date: override.date } : c))
  const next = { ...rec, authors, certificates: certs }
  saveRecord(paperId, next)
  const paper = store().papers.find((p) => p.id === paperId)
  logEvent(paperId, override ? `regenerated the certificate for ${override.name}` : `generated ${certs.length} author certificate(s)`)
  recordAudit({ journal: paper?.journal ?? 'ALL', action: 'Certificates generated', target: paperId, newValue: certs.map((c) => `${c.name} v${c.version}`).join(', ') })
  return delay(next, 300, 600)
}

export async function sendForFinalApproval(paperId: string): Promise<Readiness> {
  const paper = store().papers.find((p) => p.id === paperId)
  const rec = ensureRecord(paperId)
  if (!paper) throw new ApiError('Paper not found')
  const r = readiness(rec, !!rec.returnNote)
  if (!r.ready) throw new ApiError('Required fields are still incomplete.')
  saveRecord(paperId, { ...rec, sentAt: new Date().toISOString(), returnAcknowledged: false })
  // keep the author list used by certificates and the article page consistent across the system
  useDataStore.getState().patch({ authorsOverride: { ...store().authorsOverride, [paperId]: rec.authors } })
  const bd = pstore().backdated.find((b) => b.finalId === paperId && b.status === 'in_production')
  if (bd) pstore().patch({ backdated: pstore().backdated.map((b) => (b.id === bd.id ? { ...b, status: 'pending_approval' } : b)) })
  updatePaper(paperId, { status: 'ready_for_approval' }, { event: 'Sent for final approval', note: rec.returnNote ? 'Resubmitted after addressing the Editor’s return note.' : undefined, audit: 'Sent for final approval' })
  return delay(r, 300, 600)
}

/* ---------------------------------------------------------------- */
/* Final approval                                                    */
/* ---------------------------------------------------------------- */

export interface ApprovalRow {
  paper: Paper
  sentAt?: string
  assigneeName?: string
  backdated?: BackdatedItem
  missing: number
}

export async function listApprovalQueue(journals: JournalCode[]): Promise<ApprovalRow[]> {
  const rows = store().papers
    .filter((p) => journals.includes(p.journal) && p.status === 'ready_for_approval')
    .map((p) => {
      const rec = ensureRecord(p.id)
      return { paper: p, sentAt: rec.sentAt ?? p.updatedAt, assigneeName: userName(assigneeOf(p)), backdated: pstore().backdated.find((b) => b.finalId === p.id && b.status === 'pending_approval'), missing: readiness(rec, false).missing.length }
    })
  return delay(rows)
}

export interface ApprovalDetail extends Workspace {
  issues: Issue[]
  backdated?: BackdatedItem
  readiness: Readiness
}

export async function getApprovalDetail(paperId: string): Promise<ApprovalDetail> {
  const ws = await getWorkspace(paperId)
  const backdated = pstore().backdated.find((b) => b.finalId === paperId)
  const issues = store().issues.filter((i) => i.journal === ws.paper.journal && (backdated ? i.id === backdated.issueId : ['open', 'in_production'].includes(i.status)))
  return { ...ws, issues, backdated, readiness: readiness(ws.record, false) }
}

const pageEnd = (pages: string) => Number(pages.split(/[–-]/).pop()) || 0

export function nextPages(issue: Issue, paperId: string): string {
  const last = Math.max(0, ...issue.articleIds.map((id) => pageEnd(issue.pages[id] ?? '')))
  const len = 8 + (hashString(paperId) % 7)
  return `${last + 1}–${last + len}`
}

export function articleUrl(journal: JournalCode, slug: string) {
  return `https://${journalByCode(journal).domain}/articles/${slug}`
}

export async function publishPaper(paperId: string, issueId: string): Promise<ProductionRecord> {
  const paper = store().papers.find((p) => p.id === paperId)
  const issue = store().issues.find((i) => i.id === issueId)
  if (!paper || paper.status !== 'ready_for_approval') throw new ApiError('Only papers that are ready for approval can be published.')
  if (!issue || issue.journal !== paper.journal) throw new ApiError('Choose an issue of the same journal.')
  const rec = ensureRecord(paperId)
  const authors = rec.authors
  const pages = nextPages(issue, paperId)
  const actor = currentActor()
  const backdated = pstore().backdated.find((b) => b.finalId === paperId && b.status === 'pending_approval')

  updatePaper(paperId, { status: 'published', title: rec.title }, { event: `Published in ${issue.label}`, note: `Pages ${pages}${backdated ? ' · backdated publication' : ''}`, audit: 'Article published' })
  useDataStore.getState().patch({
    issues: store().issues.map((i) => (i.id === issueId ? { ...i, articleIds: [...i.articleIds, paperId], pages: { ...i.pages, [paperId]: pages } } : i)),
    authorsOverride: { ...store().authorsOverride, [paperId]: authors },
  })
  addDeposit(paperId, 'success')
  logEvent(paperId, 'queued the DOI deposit to Crossref', doiFor(paperId))
  const depositVersion = Math.max(1, ...store().deposits.filter((d) => d.paperId === paperId).map((d) => d.version))
  const recipients = Array.from(new Set(authors.map((a) => a.email)))
  for (const email of recipients) sendMessage({ journal: paper.journal, paperId, recipient: email, channel: 'email', template: 'Certificate of publication' })
  sendMessage({ journal: paper.journal, paperId, recipient: paper.authorEmail, channel: 'whatsapp', template: 'Article published' })
  recordAudit({ journal: paper.journal, action: 'Added article to issue', target: paperId, newValue: `${issue.label} · pages ${pages}` })
  if (backdated) pstore().patch({ backdated: pstore().backdated.map((b) => (b.id === backdated.id ? { ...b, status: 'published' } : b)) })

  const next: ProductionRecord = {
    ...rec,
    publication: { at: new Date().toISOString(), by: actor, issueId, issueLabel: issue.label, pages, doi: doiFor(paperId), url: articleUrl(paper.journal, rec.seo.slug), depositVersion, certificatesSent: recipients, backdated: !!backdated },
  }
  saveRecord(paperId, next)
  return delay(next, 500, 900)
}

export async function returnToProduction(paperId: string, note: string): Promise<void> {
  const paper = store().papers.find((p) => p.id === paperId)
  if (!paper || paper.status !== 'ready_for_approval') throw new ApiError('Only papers that are ready for approval can be returned.')
  const rec = ensureRecord(paperId)
  saveRecord(paperId, { ...rec, returnNote: { text: note, by: currentActor(), at: new Date().toISOString() }, returnAcknowledged: false, sentAt: undefined })
  const bd = pstore().backdated.find((b) => b.finalId === paperId && b.status === 'pending_approval')
  if (bd) pstore().patch({ backdated: pstore().backdated.map((b) => (b.id === bd.id ? { ...b, status: 'in_production' } : b)) })
  updatePaper(paperId, { status: 'returned_to_production' }, { event: 'Returned to production', note, audit: 'Returned to production' })
  const assignee = assigneeOf(paper)
  if (assignee) sendMessage({ journal: paper.journal, paperId, recipient: userName(assignee) ?? 'Production', channel: 'email', template: 'Returned to production' })
  await delay(undefined, 300, 600)
}

/* ---------------------------------------------------------------- */
/* Backdated publication                                             */
/* ---------------------------------------------------------------- */

export interface BackdateMatch {
  paper: Paper
  eligible: boolean
  reason?: string
}

export async function searchBackdatable(query: string, journals: JournalCode[]): Promise<BackdateMatch[]> {
  const q = query.trim().toLowerCase()
  const backdatedFinal = new Set(pstore().backdated.map((b) => b.finalId))
  // with no query, suggest rejected papers (the common backdating case)
  const matches = store().papers
    .filter((p) => journals.includes(p.journal) && (q.length < 3 ? p.status === 'rejected' : p.id.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)))
    .slice(0, 8)
    .map((paper): BackdateMatch => {
      if (PUBLISHED_STATUSES.includes(paper.status) || paper.status === 'indexed') return { paper, eligible: false, reason: 'Already published. Use Post-publication changes to amend a live article.' }
      if (backdatedFinal.has(paper.id) && paper.status === 'in_production') return { paper, eligible: false, reason: 'Already in production as a backdated item.' }
      if (paper.status === 'ready_for_approval') return { paper, eligible: false, reason: backdatedFinal.has(paper.id) ? 'Already sent to final approval as a backdated item.' : 'Already waiting in final approval.' }
      return { paper, eligible: true }
    })
  return delay(matches, 250, 500)
}

export function listPastIssues(journal: JournalCode): Issue[] {
  return store().issues.filter((i) => i.journal === journal && i.status === 'published').sort((a, b) => b.publicationDate.localeCompare(a.publicationDate))
}

export function nextBackdatedSeq(journal: JournalCode) {
  return pstore().backdatedSeq[journal]
}

/** Backdated items still in the production stage, for the Associate Editor (own items only). */
export async function listBackdatedInProduction(journals: JournalCode[], onlyAssignedTo?: string): Promise<(BackdatedItem & { paper: Paper })[]> {
  const rows = pstore().backdated
    .filter((b) => journals.includes(b.journal) && b.status !== 'published')
    .map((b) => ({ ...b, paper: store().papers.find((p) => p.id === b.finalId) }))
    .filter((b): b is BackdatedItem & { paper: Paper } => !!b.paper && IN_PRESS_STATUSES.includes(b.paper.status))
    .filter((b) => !onlyAssignedTo || assigneeOf(b.paper) === onlyAssignedTo)
  return delay(rows)
}

export async function listBackdated(journals: JournalCode[]): Promise<BackdatedItem[]> {
  return delay(pstore().backdated.filter((b) => journals.includes(b.journal)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
}

export interface BackdateInput {
  paperId: string
  title: string
  author: string
  articleType: string
  acceptNote: string
  issueId: string
  generateId: boolean
}

function renamePaper(oldId: string, newId: string) {
  const s = store()
  const rec = pstore().records[oldId]
  s.patch({
    papers: s.papers.map((p) => (p.id === oldId ? { ...p, id: newId } : p)),
    events: s.events.map((e) => (e.paperId === oldId ? { ...e, paperId: newId } : e)),
    payments: s.payments.map((p) => (p.paperId === oldId ? { ...p, paperId: newId } : p)),
    messages: s.messages.map((m) => (m.paperId === oldId ? { ...m, paperId: newId } : m)),
    authorsOverride: Object.fromEntries(Object.entries(s.authorsOverride).map(([k, v]) => [k === oldId ? newId : k, v])),
  })
  if (rec) {
    const { [oldId]: _drop, ...rest } = pstore().records
    void _drop
    pstore().patch({ records: { ...rest, [newId]: { ...rec, paperId: newId } } })
  }
}

export async function submitBackdated(input: BackdateInput): Promise<BackdatedItem> {
  const paper = store().papers.find((p) => p.id === input.paperId)
  const issue = store().issues.find((i) => i.id === input.issueId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  if (!issue || issue.status !== 'published') throw new ApiError('Choose a past (published) issue.')
  const originalStatus = paper.status
  updatePaper(paper.id, { title: input.title.trim(), author: input.author.trim(), articleType: input.articleType }, { audit: 'Backdated: details edited' })
  logEvent(paper.id, `re-accepted the paper for backdated publication in ${issue.label}`, input.acceptNote)
  let finalId = paper.id
  if (input.generateId) {
    const seq = pstore().backdatedSeq[paper.journal]
    finalId = backdatedId(paper.journal, issue.volume, issue.number, seq)
    pstore().patch({ backdatedSeq: { ...pstore().backdatedSeq, [paper.journal]: seq + 1 } })
    renamePaper(paper.id, finalId)
    logEvent(finalId, `was assigned the backdated ID ${finalId}`, `Original ID ${paper.id} was unavailable.`)
  }
  // production step: the Associate Editor of the journal completes it, then sends it to final approval
  const assignee = productionAssigneeFor(paper.journal)
  updatePaper(finalId, { status: 'in_production', assigneeId: assignee, productionDue: addDays(new Date(), 5).toISOString() }, {
    event: `Moved to production as a backdated item for ${issue.label}`,
    note: assignee ? `Assigned to ${userName(assignee) ?? 'the Associate Editor'}.` : 'No Associate Editor is assigned to this journal yet; assign one in User Management.',
    audit: 'Backdated publication moved to production',
  })
  ensureRecord(finalId)
  const item: BackdatedItem = {
    id: `bd-${finalId}`, journal: paper.journal, originalId: paper.id, finalId, generatedId: input.generateId, title: input.title.trim(),
    originalStatus: originalStatus.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), issueId: issue.id, issueLabel: issue.label, issueDate: issue.publicationDate,
    createdAt: new Date().toISOString(), createdBy: currentActor(), note: input.acceptNote, status: 'in_production', unassigned: !assignee,
  }
  pstore().patch({ backdated: [item, ...pstore().backdated] })
  recordAudit({ journal: paper.journal, action: 'Backdated publication', target: finalId, oldValue: paper.id, newValue: `${issue.label} (${issue.publicationDate})` })
  return delay(item, 500, 900)
}

/** Re-exported so pages can redraft SEO without importing the data module twice. */
export { draftSeo }
