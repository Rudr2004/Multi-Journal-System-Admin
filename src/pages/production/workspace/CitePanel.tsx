import { useMemo, useState } from 'react'
import { Copy, FileDown, FileUp, TextCursorInput } from 'lucide-react'
import type { JournalCode } from '@/shared/types'
import { SectionCard } from '@/components/Card'
import { Switch } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { newId } from '@/mock/actions'
import { journalByCode } from '@/mock/data/core'
import { NOW } from '@/mock/data/papers'
import { useDataStore } from '@/mock/store'
import { doiFor } from '@/shared/paperId'
import type { Draft } from './MetadataChecklist'

type Style = 'apa' | 'mla' | 'vancouver'
const STYLES: { value: Style; label: string }[] = [
  { value: 'apa', label: 'APA 7' },
  { value: 'mla', label: 'MLA 9' },
  { value: 'vancouver', label: 'Vancouver' },
]

const split = (name: string) => {
  const parts = name.replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean)
  return { last: parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? '', first: parts.slice(0, -1) }
}
const initials = (first: string[], dots: boolean) => first.map((f) => f[0]?.toUpperCase() + (dots ? '.' : '')).join(dots ? ' ' : '')

function build(style: Style, d: { authors: string[]; title: string; journal: string; year: number; volume?: number; issue?: number; pages?: string; doi: string }) {
  const people = d.authors.filter(Boolean).map(split)
  const vol = d.volume ? `${d.volume}${d.issue ? `(${d.issue})` : ''}` : ''
  if (style === 'apa') {
    const names = people.map((p) => `${p.last}, ${initials(p.first, true)}`.trim())
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}` : names[0] ?? ''
    return `${list} (${d.year}). ${d.title}. ${d.journal}${vol ? `, ${vol}` : ''}${d.pages ? `, ${d.pages}` : ''}. https://doi.org/${d.doi}`
  }
  if (style === 'mla') {
    const first = people[0]
    const rest = people.slice(1).map((p) => `${p.first.join(' ')} ${p.last}`.trim())
    const list = people.length > 2 ? `${first.last}, ${first.first.join(' ')}, et al` : [first ? `${first.last}, ${first.first.join(' ')}`.trim().replace(/,$/, '') : '', ...rest].filter(Boolean).join(', and ')
    return `${list}. “${d.title}.” ${d.journal}${d.volume ? `, vol. ${d.volume}` : ''}${d.issue ? `, no. ${d.issue}` : ''}, ${d.year}${d.pages ? `, pp. ${d.pages}` : ''}, https://doi.org/${d.doi}.`
  }
  const list = people.map((p) => `${p.last} ${initials(p.first, false)}`.trim()).join(', ')
  return `${list}. ${d.title}. ${d.journal}. ${d.year}${vol ? `;${vol}` : ''}${d.pages ? `:${d.pages}` : ''}. doi:${d.doi}`
}

function printAsPdf(text: string, journalName: string) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) { frame.remove(); toast.error('Printing is not available in this browser.'); return }
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  doc.open()
  doc.write(`<html><head><title>Cite this article</title><style>body{font-family:Georgia,serif;margin:48px;color:#0f172a}h1{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#475569}p{font-size:14px;line-height:1.7;border-left:3px solid #4f46e5;padding-left:12px}</style></head><body><h1>${esc(journalName)}</h1><h1>Cite this article</h1><p>${esc(text)}</p></body></html>`)
  doc.close()
  frame.contentWindow?.focus()
  setTimeout(() => { frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1500) }, 150)
}

/** "Cite this article": generated from the article's own details, optional in the print version. */
export function CitePanel({ journal, paperId, draft, update, readOnly, onGoToFile }: {
  journal: JournalCode; paperId: string; draft: Draft; update: (p: Partial<Draft>) => void; readOnly: boolean; onGoToFile: () => void
}) {
  const issues = useDataStore((s) => s.issues)
  const [style, setStyle] = useState<Style>('apa')
  const issue = useMemo(() => issues.find((i) => i.articleIds.includes(paperId)) ?? issues.filter((i) => i.journal === journal && !i.conferenceId && (i.status === 'open' || i.status === 'in_production')).sort((a, b) => a.publicationDate.localeCompare(b.publicationDate))[0], [issues, paperId, journal])
  const j = journalByCode(journal)
  const year = new Date(issue?.publicationDate ?? NOW).getFullYear()
  const text = useMemo(
    () => build(style, { authors: draft.authors.map((a) => a.name), title: draft.title.replace(/\.$/, ''), journal: j.name, year, volume: issue?.volume, issue: issue?.number, pages: issue?.pages[paperId], doi: doiFor(paperId) }),
    [style, draft.authors, draft.title, j.name, year, issue, paperId],
  )
  const on = !!draft.citeInPrint

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.success('Citation copied.') } catch { toast.info('Copy is not available here. Select the text and copy it manually.') }
  }
  const insert = () => {
    const line = `Cite this article: ${text}`
    if (draft.blocks.some((b) => b.kind === 'paragraph' && b.text === line)) { toast.info('This citation is already in the article.'); return }
    update({ blocks: [...draft.blocks, { id: newId('blk'), kind: 'paragraph', text: line }] })
    toast.success('Citation added at the end of the web article.')
  }

  return (
    <SectionCard title="Cite this article">
      <p className="mb-3 text-sm text-muted">The citation is built from the article title, authors, issue, pages and DOI, and updates as you edit them. Needed only for articles whose print version carries a citation.</p>
      <Switch checked={on} disabled={readOnly} onChange={(v) => update({ citeInPrint: v })} label="Include a citation in the print version" description={on ? 'Insert it into the formatted article, convert it to PDF and upload the final PDF.' : 'Off. The article is published without a printed citation.'} />
      <fieldset disabled={!on} className="mt-4 min-w-0 space-y-3 disabled:opacity-50">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Citation style">
          {STYLES.map((s) => (
            <button key={s.value} type="button" role="radio" aria-checked={style === s.value} onClick={() => setStyle(s.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${style === s.value ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-subtle'}`}>{s.label}</button>
          ))}
        </div>
        <blockquote className="select-all rounded-lg border-l-4 border-accent bg-subtle px-4 py-3 text-sm leading-6">{text}</blockquote>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={copy}><Copy size={14} aria-hidden /> Copy citation</button>
          <button type="button" className="btn-secondary" disabled={readOnly} onClick={insert}><TextCursorInput size={14} aria-hidden /> Insert into article</button>
          <button type="button" className="btn-secondary" onClick={() => printAsPdf(text, j.name)}><FileDown size={14} aria-hidden /> Convert to PDF</button>
          <button type="button" className="btn-primary" onClick={onGoToFile}><FileUp size={14} aria-hidden /> Upload final PDF</button>
        </div>
        <p className="text-xs text-muted">Convert to PDF opens the print dialog; choose “Save as PDF”. After the citation is in your typeset article, upload the final PDF under Final file.</p>
      </fieldset>
    </SectionCard>
  )
}
