import { Fragment, type ReactNode } from 'react'

/** Inline: **bold**, *italic*, `code`, [text](url). Rendered as React nodes (no raw HTML is ever injected). */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const key = `${keyBase}-${i++}`
    if (t.startsWith('**')) out.push(<strong key={key}>{inline(t.slice(2, -2), key)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={key} className="rounded bg-subtle px-1 py-0.5 text-[0.9em]">{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)!
      const safe = /^(https?:|mailto:|\/|#)/i.test(mm[2])
      out.push(safe ? <a key={key} href={mm[2]} target="_blank" rel="noreferrer" className="text-accent underline">{mm[1]}</a> : mm[1])
    } else out.push(<em key={key}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

/** A small, safe Markdown renderer for the CMS preview: headings, lists, quotes, rules, tables, paragraphs. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = `b${k++}`
    if (!line.trim()) { i++; continue }
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      const cls = level === 1 ? 'mt-6 text-2xl font-semibold' : level === 2 ? 'mt-6 text-xl font-semibold' : 'mt-5 text-base font-semibold'
      blocks.push(level <= 2 ? <h2 key={key} className={cls}>{inline(h[2], key)}</h2> : <h3 key={key} className={cls}>{inline(h[2], key)}</h3>)
      i++
    } else if (/^---+\s*$/.test(line)) { blocks.push(<hr key={key} className="my-5 border-line" />); i++ }
    else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''))
      blocks.push(<ul key={key} className="my-3 list-disc space-y-1 pl-6">{items.map((t, n) => <li key={n}>{inline(t, `${key}-${n}`)}</li>)}</ul>)
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''))
      blocks.push(<ol key={key} className="my-3 list-decimal space-y-1 pl-6">{items.map((t, n) => <li key={n}>{inline(t, `${key}-${n}`)}</li>)}</ol>)
    } else if (/^>\s?/.test(line)) {
      const q: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(<blockquote key={key} className="my-3 border-l-4 border-slate-300 pl-4 italic text-muted">{inline(q.join(' '), key)}</blockquote>)
    } else if (isTableRow(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]))
      blocks.push(
        <div key={key} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{head.map((c, n) => <th key={n} className="border-b border-line px-3 py-2 text-left font-semibold">{inline(c, `${key}h${n}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, n) => <tr key={n}>{r.map((c, m) => <td key={m} className="border-b border-line px-3 py-2">{inline(c, `${key}-${n}-${m}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
    } else {
      const p: string[] = []
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*]\s+|\s*\d+\.\s+|>\s?|---+\s*$)/.test(lines[i]) && !isTableRow(lines[i])) p.push(lines[i++])
      if (p.length === 0) { p.push(lines[i++]) }
      blocks.push(
        <p key={key} className="my-3">
          {p.map((t, n) => <Fragment key={n}>{n > 0 && <br />}{inline(t, `${key}-${n}`)}</Fragment>)}
        </p>,
      )
    }
  }
  return <div className={className ?? 'text-sm leading-7 text-ink'}>{blocks}</div>
}
