import type { DoiDeposit, JournalCode, Paper } from '@/shared/types'
import { formatDate } from '@/shared/formatters'
import { journalByCode } from '../data/core'
import { generatedAuthors } from '../data/authors'
import { logEvent, recordAudit } from '../actions'
import { useDataStore } from '../store'
import { ApiError, delay } from './latency'

export interface DepositRow extends DoiDeposit { paper?: Paper }

export function listDeposits(journals: JournalCode[]) {
  const { deposits, papers } = useDataStore.getState()
  return delay(
    deposits.filter((d) => journals.includes(d.journal)).sort((a, b) => b.at.localeCompare(a.at))
      .map((d): DepositRow => ({ ...d, paper: papers.find((p) => p.id === d.paperId) })),
  )
}

/** Retry a failed (or pending) deposit: succeeds after a short delay and bumps the version. */
export async function retryDeposit(id: string): Promise<DoiDeposit> {
  const { deposits, patch } = useDataStore.getState()
  const d = deposits.find((x) => x.id === id)
  if (!d) throw new ApiError('Deposit not found', 'not_found')
  const next: DoiDeposit = { ...d, status: 'success', version: d.version + 1, at: new Date().toISOString(), error: undefined }
  await delay(null, 900, 1500)
  patch({ deposits: useDataStore.getState().deposits.map((x) => (x.id === id ? next : x)) })
  recordAudit({ journal: d.journal, action: 'Crossref deposit retried', target: d.doi, oldValue: `${d.status} v${d.version}`, newValue: `success v${next.version}` })
  logEvent(d.paperId, `Crossref deposit succeeded (version ${next.version})`)
  return next
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Mock Crossref 5.3.1 deposit XML for the paper behind a deposit. */
export function buildCrossrefXml(d: DoiDeposit): string {
  const paper = useDataStore.getState().papers.find((p) => p.id === d.paperId)
  const j = journalByCode(d.journal)
  const authors = paper ? generatedAuthors(paper) : []
  const pub = new Date(paper?.updatedAt ?? d.at)
  const batch = `${d.paperId}-v${d.version}`
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<doi_batch version="5.3.1" xmlns="http://www.crossref.org/schema/5.3.1">',
    '  <head>',
    `    <doi_batch_id>${batch}</doi_batch_id>`,
    `    <timestamp>${d.at.replace(/\D/g, '').slice(0, 14)}</timestamp>`,
    '    <depositor>',
    '      <depositor_name>EdTech Publishers Pvt. Ltd.</depositor_name>',
    '      <email_address>crossref@edtechpublishers.in</email_address>',
    '    </depositor>',
    '    <registrant>EdTech Publishers Pvt. Ltd.</registrant>',
    '  </head>',
    '  <body>',
    '    <journal>',
    '      <journal_metadata>',
    `        <full_title>${esc(j.name)}</full_title>`,
    `        <abbrev_title>${j.code}</abbrev_title>`,
    `        <issn media_type="electronic">${j.issn}</issn>`,
    '      </journal_metadata>',
    '      <journal_article publication_type="full_text">',
    '        <titles>',
    `          <title>${esc(paper?.title ?? d.paperId)}</title>`,
    '        </titles>',
    '        <contributors>',
    ...authors.flatMap((a, i) => {
      const parts = a.name.replace(/^(Dr\.|Prof\.)\s*/i, '').split(' ')
      const sur = parts.pop() ?? ''
      return [
        `          <person_name sequence="${i === 0 ? 'first' : 'additional'}" contributor_role="author">`,
        `            <given_name>${esc(parts.join(' '))}</given_name>`,
        `            <surname>${esc(sur)}</surname>`,
        ...(a.orcid ? [`            <ORCID>https://orcid.org/${a.orcid}</ORCID>`] : []),
        '          </person_name>',
      ]
    }),
    '        </contributors>',
    '        <publication_date media_type="online">',
    `          <month>${String(pub.getMonth() + 1).padStart(2, '0')}</month>`,
    `          <day>${String(pub.getDate()).padStart(2, '0')}</day>`,
    `          <year>${pub.getFullYear()}</year>`,
    '        </publication_date>',
    '        <doi_data>',
    `          <doi>${d.doi}</doi>`,
    `          <resource>https://${j.domain}/article/${d.paperId}</resource>`,
    '        </doi_data>',
    '      </journal_article>',
    '    </journal>',
    '  </body>',
    '</doi_batch>',
  ]
  if (d.status === 'failed' && d.error) lines.push(`<!-- ${esc(d.error)} (${formatDate(d.at)}) -->`)
  return lines.join('\n')
}

export const getDepositXml = (id: string) => {
  const d = useDataStore.getState().deposits.find((x) => x.id === id)
  if (!d) throw new ApiError('Deposit not found', 'not_found')
  return delay(buildCrossrefXml(d), 150, 350)
}
