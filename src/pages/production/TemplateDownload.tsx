import { useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import type { Issue, JournalCode } from '@/shared/types'
import { Dialog } from '@/components/Dialog'
import { toast } from '@/components/Toasts'
import { formatDate } from '@/shared/formatters'
import { journalByCode } from '@/mock/data/core'
import { useDataStore } from '@/mock/store'

/** The issue the journal is collecting and formatting articles for right now. */
export function useCurrentIssue(journal: JournalCode): Issue | undefined {
  const issues = useDataStore((s) => s.issues)
  return useMemo(() => {
    const own = issues.filter((i) => i.journal === journal && !i.conferenceId)
    const byDate = (a: Issue, b: Issue) => a.publicationDate.localeCompare(b.publicationDate)
    return own.filter((i) => i.status === 'open').sort(byDate)[0] ?? own.filter((i) => i.status === 'in_production').sort(byDate)[0]
  }, [issues, journal])
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function templateName(issue: Issue) {
  return issue.files?.manuscriptTemplate?.name ?? `${issue.journal}_V${issue.volume}I${issue.number}_Manuscript_Template.doc`
}

/** Downloads the template uploaded for the issue; otherwise a standard blank template for the journal. */
export function downloadTemplate(issue: Issue) {
  const up = issue.files?.manuscriptTemplate
  const a = document.createElement('a')
  let url = ''
  if (up?.data) { a.href = up.data } else {
    const j = journalByCode(issue.journal)
    const html = `<html><head><meta charset="utf-8"><title>Manuscript template</title></head><body><p><b>${esc(j.name)}</b><br>${esc(issue.label)}</p><h1>Title of the article (Times New Roman, 16 pt, bold)</h1><p><i>Author names, affiliations, e-mail and ORCID iD</i></p><h2>Abstract</h2><p>120–300 words.</p><h2>Keywords</h2><p>3–8 keywords, separated by commas.</p><h2>1. Introduction</h2><p>Body text in 11 pt, single column, justified.</p><h2>2. Methods</h2><h2>3. Results and discussion</h2><h2>4. Conclusion</h2><h2>References</h2><p>Use the journal reference style.</p></body></html>`
    url = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }))
    a.href = url
  }
  a.download = templateName(issue).replace(/\.(docx?|pdf)$/i, '') + (up?.data ? up.name.match(/\.(docx?|pdf)$/i)?.[0] ?? '' : '.doc')
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.success('Manuscript template downloaded.')
}

/** Inline card with the current issue's template, shown where formatting starts. */
export function TemplateCard({ journal }: { journal: JournalCode }) {
  const issue = useCurrentIssue(journal)
  if (!issue) return null
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3">
      <FileText size={18} className="shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Manuscript template · {issue.label}</p>
        <p className="text-xs text-muted">Download it before you start formatting. Publication date {formatDate(issue.publicationDate)}.</p>
      </div>
      <button type="button" className="btn-secondary" onClick={() => downloadTemplate(issue)}><Download size={14} aria-hidden /> Download template</button>
    </div>
  )
}

/** Opens each time the dashboard is opened or the journal is switched. */
export function TemplatePopup({ journals }: { journals: JournalCode[] }) {
  const journal = journals[0]
  const issue = useCurrentIssue(journal)
  const [closed, setClosed] = useState<string | null>(null)
  const key = issue ? `${journal}:${issue.id}` : ''
  const open = !!issue && closed !== key
  if (!issue) return null
  return (
    <Dialog open={open} onClose={() => setClosed(key)} title="Manuscript template" description={`${issue.journal} · ${issue.label}`} width={460}
      footer={<><button type="button" className="btn-secondary" onClick={() => setClosed(key)}>Close</button><button type="button" className="btn-primary" onClick={() => { downloadTemplate(issue); setClosed(key) }}><Download size={14} aria-hidden /> Download template</button></>}>
      <p className="text-sm">Download the template for the current issue before you start formatting an article. It keeps the layout the same across the issue.</p>
      <p className="mt-2 text-xs text-muted">{templateName(issue)} · publication date {formatDate(issue.publicationDate)}</p>
    </Dialog>
  )
}
