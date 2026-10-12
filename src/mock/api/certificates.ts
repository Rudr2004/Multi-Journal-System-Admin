import type { Author, JournalCode, Paper } from '@/shared/types'
import { journalByCode } from '../data/core'
import { isPublished, type CertificateRecord } from '../data/publishing'
import { getAuthors, logEvent, recordAudit, sendMessage } from '../actions'
import { useDataStore } from '../store'
import { usePublishingStore } from '../stores/publishing'
import { ApiError, delay } from './latency'

export interface CertificateRow {
  key: string
  paper: Paper
  author: Author
  authorIndex: number
  record: CertificateRecord
  /** Published article page the QR code points to. */
  verifyUrl: string
}

export const articleUrl = (paper: Paper) => `https://${journalByCode(paper.journal).domain}/article/${paper.id}`
const keyOf = (paperId: string, i: number) => `${paperId}#${i}`

export function listCertificates(journals: JournalCode[]) {
  const { papers } = useDataStore.getState()
  const { certs } = usePublishingStore.getState()
  const rows: CertificateRow[] = []
  for (const paper of papers.filter((p) => isPublished(p) && journals.includes(p.journal))) {
    getAuthors(paper.id).forEach((author, i) => {
      const key = keyOf(paper.id, i)
      rows.push({ key, paper, author, authorIndex: i, verifyUrl: articleUrl(paper), record: certs[key] ?? { version: 1, issuedAt: paper.updatedAt, sendCount: 0 } })
    })
  }
  return delay(rows.sort((a, b) => b.paper.updatedAt.localeCompare(a.paper.updatedAt)))
}

function rowFor(key: string) {
  const [paperId, idx] = key.split('#')
  const paper = useDataStore.getState().papers.find((p) => p.id === paperId)
  const author = paper && getAuthors(paperId)[Number(idx)]
  if (!paper || !author) throw new ApiError('Certificate not found', 'not_found')
  return { paper, author }
}

const mutate = (key: string, paper: Paper, fn: (r: CertificateRecord) => CertificateRecord) => {
  const { certs, patch } = usePublishingStore.getState()
  const cur = certs[key] ?? { version: 1, issuedAt: paper.updatedAt, sendCount: 0 }
  patch({ certs: { ...certs, [key]: fn(cur) } })
}

export async function regenerateCertificate(key: string) {
  const { paper, author } = rowFor(key)
  mutate(key, paper, (r) => ({ ...r, version: r.version + 1, issuedAt: new Date().toISOString() }))
  logEvent(paper.id, `Certificate regenerated for ${author.name}`)
  recordAudit({ journal: paper.journal, action: 'Certificate regenerated', target: `${paper.id} · ${author.name}` })
  return delay(true, 500, 900)
}

function send(key: string) {
  const { paper, author } = rowFor(key)
  mutate(key, paper, (r) => ({ ...r, lastSentAt: new Date().toISOString(), sendCount: r.sendCount + 1 }))
  sendMessage({ journal: paper.journal, paperId: paper.id, recipient: author.email, channel: 'email', template: 'Certificate of publication' })
  logEvent(paper.id, `Certificate emailed to ${author.name}`)
  return { paper, author }
}

export async function resendCertificate(key: string) {
  const { paper, author } = send(key)
  recordAudit({ journal: paper.journal, action: 'Certificate resent', target: `${paper.id} · ${author.email}` })
  return delay(true, 400, 800)
}

export async function resendCertificates(keys: string[]) {
  const first = keys.map(send)
  const journals = [...new Set(first.map((f) => f.paper.journal))]
  journals.forEach((j) => recordAudit({ journal: j, action: 'Certificates resent (bulk)', target: `${first.filter((f) => f.paper.journal === j).length} certificate(s)` }))
  return delay(keys.length, 500, 900)
}
