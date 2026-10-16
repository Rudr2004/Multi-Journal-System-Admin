import { addDays, parseISO } from 'date-fns'
import type { Author, FileRef, Issue, JournalCode, Paper, PaperStatus } from '@/shared/types'
import { backdatedId, doiFor } from '@/shared/paperId'
import { addDeposit, currentActor, getAuthors, logEvent, productionAssigneeFor, recordAudit, sendMessage, setPaperStatus, updatePaper } from '../actions'
import { buildRecord, draftSeo, hashString, readiness, type BackdatedAuthorForm, type BackdatedItem, type BackdatedSubmission, type ProductionRecord, type Readiness } from '../data/production'
import { abstractFor, conferenceFor, hash, keywordsFor, mentorFor, paperSubjects, referralFor, type FileVersion } from '../data/editorial'
import { COUNTRIES, SUBJECT_BRANCHES, branchesFor, splitPhone } from '../data/backdatedOptions'
import { journalByCode } from '../data/core'
import { useDataStore } from '../store'
import { useEditorialStore } from '../stores/editorial'
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

/* ------------------------------------------------------------------ */
/* Backdated publication                                               */
/* The Editor picks a past issue, re-edits a rejected / payment-pending */
/* submission in full and files it under that issue as 'submitted'.     */
/* ------------------------------------------------------------------ */

/** Statuses an article can have to be taken into a backdated issue. */
export const BACKDATABLE_STATUSES: PaperStatus[] = ['rejected', 'payment_pending']

export interface BackdateCandidate {
  paper: Paper
}

/** Rejected and payment-pending articles of one journal, newest submission first. */
export async function listBackdatedCandidates(journal: JournalCode): Promise<BackdateCandidate[]> {
  const rows = store().papers
    .filter((p) => p.journal === journal && BACKDATABLE_STATUSES.includes(p.status))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((paper) => ({ paper }))
  return delay(rows, 200, 400)
}

/** Published, non-conference issues of a journal, newest first. */
export function listPastIssues(journal: JournalCode): Issue[] {
  return store().issues.filter((i) => i.journal === journal && i.status === 'published' && !i.conferenceId).sort((a, b) => b.publicationDate.localeCompare(a.publicationDate))
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

/** Articles filed under one past issue (any status after re-submission), for the "Submitted under" table. */
export async function listSubmittedUnderIssue(issueId: string): Promise<Paper[]> {
  const viaItem = new Set(pstore().backdated.filter((b) => b.issueId === issueId).map((b) => b.finalId))
  const rows = store().papers
    .filter((p) => p.backdatedIssueId === issueId || (viaItem.has(p.id) && p.status !== 'published'))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return delay(rows, 150, 300)
}

const fileRefOf = (f: FileVersion): FileRef => ({ name: f.name, size: f.sizeKb * 1024, uploadedAt: f.uploadedAt })
const slug = (s: string) => s.toLowerCase().replace(/^(prof|dr)\.?\s+/, '').replace(/[^a-z\s]/g, '').trim().split(/\s+/)

/** The form content for a paper: what the Editor saved earlier, otherwise rebuilt from the original submission. */
export async function getBackdatedSubmission(paperId: string): Promise<BackdatedSubmission> {
  const paper = store().papers.find((p) => p.id === paperId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  const saved = pstore().backdatedSubmissions[paperId]
  if (saved) return delay(saved, 200, 400)

  const subject = paperSubjects(paper)[0] ?? Object.keys(SUBJECT_BRANCHES)[0]
  const branches = branchesFor(subject)
  const keywords = Array.from(new Set([...keywordsFor(paper), ...paperSubjects(paper).map((s) => s.toLowerCase())])).slice(0, 6)
  const files = (useEditorialStore.getState().files[paperId] ?? []).slice().sort((a, b) => b.version - a.version)
  const manuscripts = files.filter((f) => f.kind === 'manuscript')
  const copyright = files.find((f) => /copyright/i.test(f.name))
  const mentorRaw = mentorFor(paper)
  let mentor: BackdatedSubmission['mentor']
  if (mentorRaw) {
    const [name, institution = ''] = mentorRaw.split(' · ')
    const parts = slug(name)
    mentor = { name, institution, email: `${parts[0]}.${parts[parts.length - 1]}@${slug(institution)[0] ?? 'university'}.example`, phone: `+91 9${String(hash(paperId)).padStart(9, '0').slice(0, 4)} ${String(hash(name)).padStart(5, '0').slice(0, 5)}` }
  }
  const conference = conferenceFor(paper)
  const authors: BackdatedAuthorForm[] = getAuthors(paperId).map((a, i) => {
    const ph = splitPhone(a.phone)
    return {
      name: a.name, email: a.email, phoneCode: ph.code, phone: ph.number, country: COUNTRIES.includes(a.country) ? a.country : 'Other', affiliation: a.affiliation,
      orcid: a.orcid ?? '', photo: a.photo ? { name: `${a.name.replace(/\s+/g, '_')}_photo`, size: 0, uploadedAt: paper.submittedAt, data: a.photo } : null,
      corresponding: a.corresponding ?? i === 0,
    }
  })
  if (authors.length && !authors.some((a) => a.corresponding)) authors[0].corresponding = true
  const out: BackdatedSubmission = {
    paperId, issueId: '', subject, branch: branches.length ? branches[hash(paperId) % branches.length] : '', abstract: abstractFor(paper), keywords, mentor,
    referralCode: referralFor(paper)?.code ?? '', conference: conference === 'None' ? '' : conference,
    manuscript: manuscripts[0] ? fileRefOf(manuscripts[0]) : null, previousManuscripts: manuscripts.slice(1).map(fileRefOf),
    supplementary: files.filter((f) => f.kind === 'supplementary' && f !== copyright).map(fileRefOf), copyright: copyright ? fileRefOf(copyright) : null,
    declarations: { original: true, ethics: true, copyright: true, consent: true }, authors, savedAt: paper.updatedAt, savedBy: paper.author,
  }
  return delay(out, 200, 400)
}

export interface BackdatedSubmitInput {
  paperId: string
  issueId: string
  articleType: string
  title: string
  form: Omit<BackdatedSubmission, 'paperId' | 'issueId' | 'savedAt' | 'savedBy'>
  /** Keep the original Paper ID, or generate IJMAT.V1I1.100 from the journal's backdated sequence. */
  generateId: boolean
  reason: string
}

export interface BackdatedSubmitResult {
  item: BackdatedItem
  paper: Paper
  newManuscriptVersion?: number
}

function renamePaper(oldId: string, newId: string) {
  const s = store()
  const rec = pstore().records[oldId]
  const sub = pstore().backdatedSubmissions[oldId]
  const re = <T,>(m: Record<string, T>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k === oldId ? newId : k, v])) as Record<string, T>
  s.patch({
    papers: s.papers.map((p) => (p.id === oldId ? { ...p, id: newId } : p)),
    events: s.events.map((e) => (e.paperId === oldId ? { ...e, paperId: newId } : e)),
    payments: s.payments.map((p) => (p.paperId === oldId ? { ...p, paperId: newId } : p)),
    messages: s.messages.map((m) => (m.paperId === oldId ? { ...m, paperId: newId } : m)),
    authorsOverride: re(s.authorsOverride),
  })
  const ed = useEditorialStore.getState()
  ed.patch({
    files: re(Object.fromEntries(Object.entries(ed.files).map(([k, v]) => [k, v.map((f) => (f.paperId === oldId ? { ...f, paperId: newId } : f))]))),
    reviews: ed.reviews.map((r) => (r.paperId === oldId ? { ...r, paperId: newId } : r)),
    decisions: ed.decisions.map((d) => (d.paperId === oldId ? { ...d, paperId: newId } : d)),
    history: ed.history.map((e) => (e.paperId === oldId ? { ...e, paperId: newId } : e)),
    reminders: re(ed.reminders),
    panelOverrides: re(ed.panelOverrides),
  })
  if (rec) {
    const { [oldId]: _drop, ...rest } = pstore().records
    void _drop
    pstore().patch({ records: { ...rest, [newId]: { ...rec, paperId: newId } } })
  }
  if (sub) {
    const { [oldId]: _d2, ...rest } = pstore().backdatedSubmissions
    void _d2
    pstore().patch({ backdatedSubmissions: { ...rest, [newId]: { ...sub, paperId: newId } } })
  }
}

const extOf = (name: string): 'docx' | 'pdf' => (/\.pdf$/i.test(name) ? 'pdf' : 'docx')

/**
 * Saves the re-edited submission and files the article under the chosen past issue as 'submitted'.
 * The Editor then re-accepts it through the normal decision flow; Final approval stays locked to this issue.
 */
export async function submitBackdatedSubmission(input: BackdatedSubmitInput): Promise<BackdatedSubmitResult> {
  const paper = store().papers.find((p) => p.id === input.paperId)
  const issue = store().issues.find((i) => i.id === input.issueId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  if (!BACKDATABLE_STATUSES.includes(paper.status)) throw new ApiError('Only rejected or payment-pending articles can be re-submitted into a past issue.')
  if (!issue || issue.status !== 'published' || issue.journal !== paper.journal) throw new ApiError('Choose a past (published) issue of the same journal.')
  const f = input.form
  const corresponding = f.authors.find((a) => a.corresponding) ?? f.authors[0]
  if (!corresponding) throw new ApiError('Add at least one author.')
  const originalStatus = paper.status
  const before = {
    title: paper.title, type: paper.articleType, authors: getAuthors(paper.id).length, abstract: pstore().backdatedSubmissions[paper.id]?.abstract ?? abstractFor(paper),
    manuscript: pstore().backdatedSubmissions[paper.id]?.manuscript ?? (useEditorialStore.getState().files[paper.id] ?? []).filter((x) => x.kind === 'manuscript').sort((a, b) => b.version - a.version).map(fileRefOf)[0] ?? null,
  }

  // Article ID: keep the original or generate the next one in the journal's backdated sequence
  let finalId = paper.id
  if (input.generateId) {
    const seq = pstore().backdatedSeq[paper.journal]
    finalId = backdatedId(paper.journal, issue.volume, issue.number, seq)
    pstore().patch({ backdatedSeq: { ...pstore().backdatedSeq, [paper.journal]: seq + 1 } })
    renamePaper(paper.id, finalId)
    logEvent(finalId, `was assigned the backdated ID ${finalId}`, `Original ID ${paper.id} was unavailable.`)
  }

  // Files: a changed manuscript becomes the next version; new supplementary files and a new copyright form are added
  const ed = useEditorialStore.getState()
  const existing = ed.files[finalId] ?? []
  const added: FileVersion[] = []
  const stamp = new Date().toISOString()
  const addFile = (file: FileRef, kind: FileVersion['kind'], version: number, note: string): FileVersion => {
    const fv: FileVersion = { id: `file-${finalId}-${kind[0]}${version}-${Date.now().toString(36)}${added.length}`, paperId: finalId, version, name: file.name, kind, format: extOf(file.name), sizeKb: Math.max(1, Math.ceil(file.size / 1024)), uploadedAt: file.uploadedAt || stamp, note }
    added.push(fv)
    return fv
  }
  let newManuscriptVersion: number | undefined
  const m = f.manuscript
  if (m && (!before.manuscript || m.name !== before.manuscript.name || m.uploadedAt !== before.manuscript.uploadedAt)) {
    newManuscriptVersion = Math.max(0, ...existing.filter((x) => x.kind === 'manuscript').map((x) => x.version)) + 1
    addFile(m, 'manuscript', newManuscriptVersion, 'Uploaded by the Editor for backdated publication')
  }
  const known = new Set(existing.map((x) => x.name))
  for (const s of f.supplementary) if (!known.has(s.name)) addFile(s, 'supplementary', 1, 'Supplementary file added by the Editor')
  if (f.copyright && !known.has(f.copyright.name)) addFile(f.copyright, 'supplementary', 1, 'Copyright form uploaded by the Editor')
  if (added.length) ed.patch({ files: { ...ed.files, [finalId]: [...added.filter((x) => x.kind === 'manuscript'), ...existing, ...added.filter((x) => x.kind !== 'manuscript')] } })

  // Shared records: authors (in the order entered), then the paper itself
  const authors: Author[] = f.authors.map((a) => ({
    name: a.name.trim(), email: a.email.trim(), affiliation: a.affiliation.trim(), country: a.country, orcid: a.orcid.trim() || undefined,
    corresponding: a.corresponding, phone: `${a.phoneCode} ${a.phone.trim()}`, photo: a.photo?.data,
  }))
  useDataStore.getState().patch({ authorsOverride: { ...store().authorsOverride, [finalId]: authors } })
  const assignee = productionAssigneeFor(paper.journal)
  updatePaper(finalId, {
    title: input.title.trim(), author: corresponding.name.trim(), authorEmail: corresponding.email.trim(), authorCountry: corresponding.country, articleType: input.articleType,
    status: 'submitted', backdatedIssueId: issue.id, assigneeId: assignee,
  }, { audit: 'Backdated: status changed to submitted' })

  const changes = [
    before.title !== input.title.trim() && 'title', before.type !== input.articleType && 'article type', before.authors !== f.authors.length && 'author list',
    before.abstract !== f.abstract.trim() && 'abstract', newManuscriptVersion && `manuscript (v${newManuscriptVersion})`,
  ].filter(Boolean).join(', ')
  logEvent(finalId, `re-edited the submission and filed it under ${issue.label} (${issue.publicationDate.slice(0, 10)})`, `${input.reason}${changes ? `\nChanged: ${changes}.` : ''}`)
  logEvent(finalId, `status changed from ${originalStatus.replace(/_/g, ' ')} to submitted`, 'Awaiting the Editor’s decision.')

  pstore().patch({
    backdatedSubmissions: { ...pstore().backdatedSubmissions, [finalId]: { ...f, abstract: f.abstract.trim(), paperId: finalId, issueId: issue.id, savedAt: stamp, savedBy: currentActor() } },
  })

  // BackdatedItem: Final approval stays locked to the issue; stays 'in_production' so the normal hand-over to final approval works later
  const item: BackdatedItem = {
    id: `bd-${finalId}`, journal: paper.journal, originalId: input.paperId, finalId, generatedId: input.generateId, title: input.title.trim(),
    originalStatus: originalStatus.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), issueId: issue.id, issueLabel: issue.label, issueDate: issue.publicationDate,
    createdAt: stamp, createdBy: currentActor(), note: input.reason.trim(), status: 'in_production', unassigned: !assignee,
  }
  pstore().patch({ backdated: [item, ...pstore().backdated.filter((b) => b.finalId !== finalId && b.id !== item.id)] })
  recordAudit({ journal: paper.journal, action: 'Backdated publication submitted', target: finalId, oldValue: `${input.paperId} (${originalStatus})`, newValue: `Submitted under ${issue.label} (${issue.publicationDate})` })
  return delay({ item, paper: store().papers.find((p) => p.id === finalId) ?? paper, newManuscriptVersion }, 500, 900)
}

/** Re-exported so pages can redraft SEO without importing the data module twice. */
export { draftSeo }

/* ---------------------------------------------------------------- */
/* Retraction at the author's request                                 */
/* ---------------------------------------------------------------- */
const RETRACTABLE: PaperStatus[] = ['paid', 'in_production', 'returned_to_production', 'ready_for_approval', 'published', 'indexed', 'corrected']

/**
 * Retract an article before or after publication. Needs the author's written consent (documented) and the Editor's explicit approval.
 * The article page at its URL becomes a retraction notice; the DOI and bibliographic record are kept.
 */
export async function retractArticle(paperId: string, input: { reason: string; consentFrom: string; consentDate: string; consentExcerpt: string; consentFileName?: string; consentConfirmed: boolean; approved: boolean }): Promise<ProductionRecord> {
  await delay(null, 500, 900)
  const paper = store().papers.find((p) => p.id === paperId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  if (!RETRACTABLE.includes(paper.status)) throw new ApiError(paper.status === 'retracted' ? 'This article is already retracted.' : 'Only papers in production or published articles can be retracted.', 'invalid')
  if (!input.consentConfirmed || input.consentExcerpt.trim().length < 20 || !input.consentFrom.trim()) throw new ApiError('The author’s written consent by email is required and must be documented.', 'invalid')
  if (!input.approved) throw new ApiError('The Editor must explicitly approve the retraction.', 'invalid')
  if (input.reason.trim().length < 10) throw new ApiError('Give the reason for the retraction.', 'invalid')
  const rec = ensureRecord(paperId)
  const wasPublished = ['published', 'indexed', 'corrected'].includes(paper.status)
  const at = new Date().toISOString()
  const by = currentActor()
  const url = rec.publication?.url ?? articleUrl(paper.journal, rec.seo.slug || paperId.toLowerCase())
  const doi = doiFor(paperId)
  const notice = `This article, “${rec.title}”, has been retracted at the request of its author${rec.authors.length > 1 ? 's' : ''}.\nReason: ${input.reason.trim()}\nThe retraction was approved by the Editor on ${at.slice(0, 10)}. The DOI ${doi} and the bibliographic record remain available for transparency.`
  saveRecord(paperId, { ...rec, retraction: { at, by, approvedBy: by, reason: input.reason.trim(), wasPublished, consent: { from: input.consentFrom.trim(), date: input.consentDate, excerpt: input.consentExcerpt.trim(), fileName: input.consentFileName }, notice, url, doi } })
  setPaperStatus(paperId, 'retracted', wasPublished ? 'Article retracted after publication at the author’s request' : 'Article retracted before publication at the author’s request', input.reason.trim())
  logEvent(paperId, `recorded the author’s consent to retract (email from ${input.consentFrom.trim()}, ${input.consentDate})`, input.consentExcerpt.trim())
  if (wasPublished) addDeposit(paperId, 're_deposited')
  sendMessage({ journal: paper.journal, paperId, recipient: paper.authorEmail, channel: 'email', template: 'Retraction confirmation' })
  recordAudit({ journal: paper.journal, action: 'Article retracted', target: paperId, oldValue: paper.status, newValue: `retracted · consent from ${input.consentFrom.trim()} on ${input.consentDate} · approved by ${by}` })
  return ensureRecord(paperId)
}
