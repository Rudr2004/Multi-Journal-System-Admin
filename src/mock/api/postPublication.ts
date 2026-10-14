import type { Author, JournalCode, Paper } from '@/shared/types'
import { computeGst, type Currency } from '@/shared/gst'
import { addDeposit, currentActor, getAuthors, logEvent, newId, productionAssigneeFor, recordAudit, sendMessage, setPaperStatus } from '../actions'
import {
  CHANGE_TYPE_META, type ArticleVersion, type ChangeEvent, type ChangeFee, type ChangeRequest, type ChangeResult, type ChangeTarget, type ChangeType, type ProductionRecord,
} from '../data/production'
import { doiFor } from '@/shared/paperId'
import { journalByCode } from '../data/core'
import { useDataStore, useSession } from '../store'
import { useProductionStore } from '../stores/production'
import { ApiError, delay } from './latency'
import { ensureRecord } from './production'

const store = () => useDataStore.getState()
const pstore = () => useProductionStore.getState()

export const LIVE_STATUSES = ['published', 'indexed', 'corrected']

const ev = (text: string, note?: string): ChangeEvent => ({ id: newId('cev'), at: new Date().toISOString(), actor: currentActor(), text, note })

function save(id: string, fn: (r: ChangeRequest) => ChangeRequest) {
  pstore().patch({ changeRequests: pstore().changeRequests.map((r) => (r.id === id ? fn(r) : r)) })
}

function find(id: string): ChangeRequest {
  const r = pstore().changeRequests.find((x) => x.id === id)
  if (!r) throw new ApiError('Change request not found', 'not_found')
  return r
}

export interface ChangeListFilter {
  /** Support Executive: only requests they raised. */
  requestedBy?: string
  /** Associate Editor: only approved correction requests, never retractions or withdrawals. */
  forAssociateEditor?: boolean
}

const BEFORE_APPROVAL = ['requested', 'under_review', 'rejected']

export async function listChangeRequests(journals: JournalCode[], filter: ChangeListFilter = {}): Promise<ChangeRequest[]> {
  return delay(pstore().changeRequests
    .filter((r) => journals.includes(r.journal))
    .filter((r) => !filter.requestedBy || r.requestedBy === filter.requestedBy)
    .filter((r) => !filter.forAssociateEditor || (!BEFORE_APPROVAL.includes(r.status) && CHANGE_TYPE_META[r.type].editsArticle))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)))
}

/** Why the Associate Editor cannot work on this request yet (undefined = ready to work). */
export function workBlockReason(r: ChangeRequest): string | undefined {
  if (r.status === 'ready' || r.status === 'revision') return undefined
  if (r.status === 'approved') return r.fee?.state === 'pending' ? 'Waiting for fee payment. The author has not paid the correction fee yet.' : 'Waiting for the Editor to set or waive the correction fee.'
  if (r.status === 'version_review') return 'Your version is with the Editor for approval.'
  if (r.status === 'completed') return 'This correction is complete.'
  return 'The Editor has not approved this request yet.'
}

export interface ChangeDetail {
  request: ChangeRequest
  paper: Paper
  record: ProductionRecord
  authors: Author[]
}

export async function getChangeRequest(id: string): Promise<ChangeDetail> {
  const request = find(id)
  const paper = store().papers.find((p) => p.id === request.paperId)
  if (!paper) throw new ApiError('The paper for this request is no longer available.', 'not_found')
  return delay({ request, paper, record: ensureRecord(paper.id), authors: getAuthors(paper.id) })
}

export async function listPublishedPapers(journals: JournalCode[]): Promise<Paper[]> {
  return delay(store().papers.filter((p) => journals.includes(p.journal) && LIVE_STATUSES.includes(p.status)))
}

export function authorsOf(paperId: string): Author[] {
  return getAuthors(paperId)
}

export interface NewChangeInput {
  paperId: string
  type: ChangeType
  reason: string
  authorIndex?: number
  newValue?: string
  oldText?: string
  newText?: string
  fileName?: string
  notice?: string
  attachmentName?: string
}

function buildTargets(i: NewChangeInput, authors: Author[]): ChangeTarget[] {
  switch (i.type) {
    case 'author_name': {
      const a = authors[i.authorIndex ?? 0]
      return [{ key: `author-${i.authorIndex}-name`, label: `Author ${(i.authorIndex ?? 0) + 1} · Name`, oldValue: a.name, newValue: (i.newValue ?? '').trim(), apply: { kind: 'author', index: i.authorIndex ?? 0, prop: 'name' } }]
    }
    case 'affiliation': {
      const a = authors[i.authorIndex ?? 0]
      return [{ key: `author-${i.authorIndex}-affiliation`, label: `Author ${(i.authorIndex ?? 0) + 1} · Affiliation`, oldValue: a.affiliation, newValue: (i.newValue ?? '').trim(), apply: { kind: 'author', index: i.authorIndex ?? 0, prop: 'affiliation' } }]
    }
    case 'correction':
      return [{ key: 'text-0', label: 'Corrected text', oldValue: (i.oldText ?? '').trim(), newValue: (i.newText ?? '').trim(), multiline: true, apply: { kind: 'text' } }]
    case 'erratum':
      return [{ key: 'notice', label: 'Erratum notice', oldValue: '', newValue: (i.notice ?? '').trim(), multiline: true, apply: { kind: 'notice' } }]
    case 'file_replacement':
      return [{ key: 'file', label: 'Final file', oldValue: ensureRecord(i.paperId).finalFile?.name ?? 'Current final file', newValue: (i.fileName ?? '').trim(), apply: { kind: 'file' } }]
    case 'retraction':
    case 'withdrawal':
      return [{ key: 'notice', label: i.type === 'retraction' ? 'Retraction notice' : 'Withdrawal notice', oldValue: '', newValue: (i.notice ?? '').trim(), multiline: true, apply: { kind: 'notice' } }]
  }
}

export async function createChangeRequest(input: NewChangeInput): Promise<ChangeRequest> {
  const paper = store().papers.find((p) => p.id === input.paperId)
  if (!paper || !LIVE_STATUSES.includes(paper.status)) throw new ApiError('Only published papers can be changed after publication.')
  const authors = getAuthors(paper.id)
  const n = Math.max(0, ...pstore().changeRequests.map((r) => Number(r.id.replace('PPC-', '')) || 0)) + 1
  const rec = ensureRecord(paper.id)
  const request: ChangeRequest = {
    id: `PPC-${String(n).padStart(4, '0')}`, paperId: paper.id, journal: paper.journal, type: input.type, reason: input.reason.trim(),
    targets: buildTargets(input, authors), requestedBy: currentActor(), requestedAt: new Date().toISOString(), status: 'requested', baseVersion: rec.articleVersion, versions: [], attachmentName: input.attachmentName || undefined,
    events: [ev('raised a change request', input.reason.trim())],
  }
  pstore().patch({ changeRequests: [request, ...pstore().changeRequests] })
  logEvent(paper.id, `Post-publication change requested: ${CHANGE_TYPE_META[input.type].label}`, input.reason.trim())
  recordAudit({ journal: paper.journal, action: 'Post-publication change requested', target: paper.id, newValue: `${request.id} · ${CHANGE_TYPE_META[input.type].label}` })
  return delay(request, 400, 800)
}

export async function startReview(id: string): Promise<ChangeRequest> {
  const r = find(id)
  if (r.status !== 'requested') throw new ApiError('Only new requests can be moved to review.')
  save(id, (x) => ({ ...x, status: 'under_review', events: [...x.events, ev('started reviewing the request')] }))
  logEvent(r.paperId, `Post-publication change under review: ${CHANGE_TYPE_META[r.type].label}`)
  recordAudit({ journal: r.journal, action: 'Post-publication change under review', target: r.paperId, oldValue: r.id })
  await delay(undefined, 200, 400)
  return find(id)
}

const feeOn = () => useSession.getState().flags.correctionFee
const assigneeFor = (journal: JournalCode) => productionAssigneeFor(journal)

export async function decideChangeRequest(id: string, decision: 'approve' | 'reject', note?: string): Promise<ChangeRequest> {
  const r = find(id)
  if (r.status !== 'requested' && r.status !== 'under_review') throw new ApiError('This request has already been decided.')
  const label = CHANGE_TYPE_META[r.type].label
  if (decision === 'reject') {
    if (!note?.trim()) throw new ApiError('A reason is required to reject a request.')
    save(id, (x) => ({ ...x, status: 'rejected', decisionNote: note, events: [...x.events, ev('rejected the change request', note)] }))
    logEvent(r.paperId, `Post-publication change rejected: ${label}`, note)
    recordAudit({ journal: r.journal, action: 'Post-publication change rejected', target: r.paperId, oldValue: r.id, newValue: note })
    await delay(undefined, 300, 500)
    return find(id)
  }
  if (!CHANGE_TYPE_META[r.type].editsArticle) {
    // retraction / withdrawal skip the fee and version steps and take effect immediately once approved
    const result = applyTerminal(r)
    save(id, (x) => ({ ...x, status: 'completed', decisionNote: note, result, events: [...x.events, ev(`approved the ${label.toLowerCase()} and applied it`, note)] }))
  } else if (feeOn()) {
    // the Editor now sets or waives the correction fee; the Associate Editor waits until it is paid or waived
    save(id, (x) => ({ ...x, status: 'approved', decisionNote: note, assigneeId: assigneeFor(x.journal), events: [...x.events, ev('approved the change request (fee pending)', note)] }))
    logEvent(r.paperId, `Post-publication change approved: ${label}`, note)
  } else {
    save(id, (x) => ({ ...x, status: 'ready', decisionNote: note, assigneeId: assigneeFor(x.journal), events: [...x.events, ev('approved the change request; no correction fee applies', note)] }))
    logEvent(r.paperId, `Post-publication change approved: ${label}`, note)
  }
  recordAudit({ journal: r.journal, action: 'Post-publication change approved', target: r.paperId, oldValue: r.id })
  await delay(undefined, 300, 600)
  return find(id)
}

/* ---------------- Correction fee (proposed, behind the correctionFee flag) ---------------- */

export function paymentLinkFor(r: ChangeRequest) {
  return `https://pay.${journalByCode(r.journal).domain}/corrections/${r.id}`
}

export function previewFee(currency: Currency, base: number) {
  return computeGst(base, currency)
}

const money = (c: 'INR' | 'USD', n: number) => `${c} ${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

export async function setCorrectionFee(id: string, currency: Currency, base: number): Promise<ChangeRequest> {
  const r = find(id)
  if (r.status !== 'approved') throw new ApiError('A fee can only be set on an approved request that is waiting for it.')
  if (!(base > 0)) throw new ApiError('Enter an amount greater than zero, or waive the fee.')
  const paper = store().papers.find((p) => p.id === r.paperId)
  if (!paper) throw new ApiError('Paper not found', 'not_found')
  const g = computeGst(base, currency)
  const fee: ChangeFee = { state: 'pending', currency, base, gst: Math.round((g.cgst + g.sgst + g.igst) * 100) / 100, gstNote: g.note, total: g.total, link: paymentLinkFor(r), sentAt: new Date().toISOString() }
  save(id, (x) => ({ ...x, fee, events: [...x.events, ev(`set a correction fee of ${money(currency, g.total)} and sent the payment link`)] }))
  sendMessage({ journal: r.journal, paperId: r.paperId, recipient: paper.authorEmail, channel: 'email', template: 'Correction fee payment link' })
  logEvent(r.paperId, 'Correction fee requested from the author', money(currency, g.total))
  recordAudit({ journal: r.journal, action: 'Correction fee set', target: r.paperId, oldValue: r.id, newValue: money(currency, g.total) })
  await delay(undefined, 300, 600)
  return find(id)
}

export async function waiveCorrectionFee(id: string, reason: string): Promise<ChangeRequest> {
  const r = find(id)
  if (r.status !== 'approved') throw new ApiError('The fee can only be waived while the request is waiting for it.')
  if (!reason.trim()) throw new ApiError('A reason is required to waive the fee.')
  const fee: ChangeFee = { state: 'waived', currency: r.fee?.currency ?? 'INR', base: 0, gst: 0, gstNote: '', total: 0, waivedReason: reason.trim() }
  save(id, (x) => ({ ...x, fee, status: 'ready', events: [...x.events, ev('waived the correction fee', reason.trim()), ev('released the request for correction')] }))
  logEvent(r.paperId, 'Correction fee waived', reason.trim())
  recordAudit({ journal: r.journal, action: 'Correction fee waived', target: r.paperId, oldValue: r.id, newValue: reason.trim() })
  await delay(undefined, 300, 500)
  return find(id)
}

/** Prototype only: simulates the author paying through the link. */
export async function markFeePaid(id: string): Promise<ChangeRequest> {
  const r = find(id)
  if (r.status !== 'approved' || r.fee?.state !== 'pending') throw new ApiError('There is no pending fee to mark as paid.')
  save(id, (x) => ({ ...x, status: 'ready', fee: x.fee && { ...x.fee, state: 'paid', paidAt: new Date().toISOString() }, events: [...x.events, ev('recorded the correction fee payment (prototype simulation)'), ev('released the request for correction')] }))
  logEvent(r.paperId, 'Correction fee paid (simulated in the prototype)', r.fee ? money(r.fee.currency, r.fee.total) : undefined)
  recordAudit({ journal: r.journal, action: 'Correction fee paid (prototype)', target: r.paperId, oldValue: r.id })
  await delay(undefined, 300, 500)
  return find(id)
}

/** With the correctionFee flag off there is no fee step: release the approved request straight to the Associate Editor. */
export async function releaseWithoutFee(id: string): Promise<ChangeRequest> {
  const r = find(id)
  if (r.status !== 'approved' || r.fee) throw new ApiError('This request already has a fee decision.')
  save(id, (x) => ({ ...x, status: 'ready', events: [...x.events, ev('released the request for correction; no fee step')] }))
  recordAudit({ journal: r.journal, action: 'Post-publication change released', target: r.paperId, oldValue: r.id })
  await delay(undefined, 200, 400)
  return find(id)
}

export async function submitNewVersion(id: string, values: Record<string, string>, summary: string): Promise<ChangeRequest> {
  const r = find(id)
  if (r.status !== 'ready' && r.status !== 'revision') throw new ApiError('This request is not open for editing yet.')
  const changes = r.targets
    .map((t) => ({ field: t.label, oldValue: t.oldValue, newValue: (values[t.key] ?? t.newValue).trim() }))
    .filter((c) => c.newValue !== c.oldValue)
  if (changes.length === 0) throw new ApiError('The new version is identical to the published one.')
  const n = r.baseVersion + 1
  const version: ArticleVersion = { n, at: new Date().toISOString(), by: currentActor(), summary: summary.trim() || `Version ${n}`, changes, state: 'in_review' }
  save(id, (x) => ({ ...x, status: 'version_review', versions: [...x.versions.filter((v) => v.n !== n), version], events: [...x.events, ev(`submitted version ${n} for approval`, version.summary)] }))
  logEvent(r.paperId, `Version ${n} drafted for post-publication change`, version.summary)
  await delay(undefined, 400, 700)
  return find(id)
}

export async function reviewNewVersion(id: string, decision: 'approve' | 'changes', note?: string): Promise<ChangeRequest> {
  const r = find(id)
  const version = r.versions[r.versions.length - 1]
  if (r.status !== 'version_review' || !version) throw new ApiError('There is no version awaiting approval.')
  if (decision === 'changes') {
    save(id, (x) => ({ ...x, status: 'revision', decisionNote: note, versions: x.versions.map((v) => (v.n === version.n ? { ...v, state: 'draft' } : v)), events: [...x.events, ev(`asked for changes to version ${version.n}`, note)] }))
    await delay(undefined, 300, 500)
    return find(id)
  }
  const result = applyVersion(r, version)
  save(id, (x) => ({
    ...x, status: 'completed', result, decisionNote: note ?? x.decisionNote,
    versions: x.versions.map((v) => (v.n === version.n ? { ...v, state: 'live' } : { ...v, state: 'superseded' })),
    events: [...x.events, ev(`approved version ${version.n} and published the change`, note)],
  }))
  await delay(undefined, 600, 1000)
  return find(id)
}

function recipients(paper: Paper, authors: Author[]) {
  return Array.from(new Set([paper.authorEmail, ...authors.map((a) => a.email)]))
}

function applyTerminal(r: ChangeRequest): ChangeResult {
  const paper = store().papers.find((p) => p.id === r.paperId)!
  const retract = r.type === 'retraction'
  const authors = getAuthors(r.paperId)
  setPaperStatus(r.paperId, retract ? 'retracted' : 'withdrawn', retract ? 'Article retracted' : 'Article withdrawn', r.targets[0]?.newValue)
  addDeposit(r.paperId, 're_deposited')
  const to = recipients(paper, authors)
  for (const email of to) sendMessage({ journal: r.journal, paperId: r.paperId, recipient: email, channel: 'email', template: retract ? 'Retraction notice' : 'Withdrawal notice' })
  const depositVersion = Math.max(...store().deposits.filter((d) => d.paperId === r.paperId).map((d) => d.version))
  return { at: new Date().toISOString(), by: currentActor(), doi: doiFor(r.paperId), depositVersion, paperStatus: retract ? 'retracted' : 'withdrawn', certificates: [], notified: to }
}

function applyVersion(r: ChangeRequest, version: ArticleVersion): ChangeResult {
  const paper = store().papers.find((p) => p.id === r.paperId)!
  const rec = ensureRecord(r.paperId)
  const newVal = (label: string) => version.changes.find((c) => c.field === label)?.newValue
  const authors = getAuthors(r.paperId).map((a) => ({ ...a }))
  const nameChanged = new Set<number>()
  let blocks = rec.blocks
  let finalFile = rec.finalFile
  for (const t of r.targets) {
    const v = newVal(t.label)
    if (v === undefined) continue
    if (t.apply.kind === 'author') {
      authors[t.apply.index] = { ...authors[t.apply.index], [t.apply.prop]: v }
      if (t.apply.prop === 'name') nameChanged.add(t.apply.index)
    } else if (t.apply.kind === 'text') {
      const hit = blocks.some((b) => b.kind === 'paragraph' && b.text.includes(t.oldValue))
      blocks = hit
        ? blocks.map((b) => (b.kind === 'paragraph' && b.text.includes(t.oldValue) ? { ...b, text: b.text.replace(t.oldValue, v) } : b))
        : [...blocks, { id: newId('blk'), kind: 'paragraph', text: `Correction (version ${version.n}): ${v}` }]
    } else if (t.apply.kind === 'notice') {
      blocks = [...blocks, { id: newId('blk'), kind: 'heading', text: 'Erratum' }, { id: newId('blk'), kind: 'paragraph', text: v }]
    } else if (t.apply.kind === 'file') {
      finalFile = { name: v, version: (rec.finalFile?.version ?? 0) + 1, uploadedAt: new Date().toISOString(), uploadedBy: currentActor(), sizeKb: rec.finalFile?.sizeKb ?? 600 }
    }
  }
  const now = new Date().toISOString()
  const certificates = authors.map((a, i) => {
    const prev = rec.certificates.find((c) => c.authorEmail === a.email)
    return nameChanged.has(i) || !prev ? { authorEmail: a.email, name: a.name, date: now, version: (prev?.version ?? 0) + 1, generatedAt: now } : prev
  })
  pstore().patch({ records: { ...pstore().records, [r.paperId]: { ...rec, authors, blocks, finalFile, certificates, articleVersion: version.n } } })
  useDataStore.getState().patch({ authorsOverride: { ...store().authorsOverride, [r.paperId]: authors } })
  setPaperStatus(r.paperId, 'corrected', `Published ${CHANGE_TYPE_META[r.type].label.toLowerCase()} (version ${version.n})`, version.summary)
  addDeposit(r.paperId, 're_deposited')
  const to = recipients(paper, authors)
  for (const email of to) sendMessage({ journal: r.journal, paperId: r.paperId, recipient: email, channel: 'email', template: 'Correction notice' })
  for (const i of nameChanged) sendMessage({ journal: r.journal, paperId: r.paperId, recipient: authors[i].email, channel: 'email', template: 'Updated certificate of publication' })
  recordAudit({ journal: r.journal, action: 'Post-publication version approved', target: r.paperId, oldValue: `v${r.baseVersion}`, newValue: `v${version.n}` })
  const depositVersion = Math.max(...store().deposits.filter((d) => d.paperId === r.paperId).map((d) => d.version))
  return {
    at: now, by: currentActor(), doi: doiFor(r.paperId), depositVersion, paperStatus: 'corrected',
    certificates: authors.map((a, i) => ({ authorName: a.name, changed: nameChanged.has(i) })), notified: to,
  }
}
