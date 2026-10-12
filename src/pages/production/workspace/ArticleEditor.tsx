import { useId } from 'react'
import { ArrowDown, ArrowUp, Heading2, ImageIcon, Pilcrow, Plus, Table2, Trash2 } from 'lucide-react'
import { CharCount } from '@/components/Form'
import { Badge } from '@/components/Badges'
import { newId } from '@/mock/actions'
import { wordCount, type Block } from '@/mock/data/production'
import { FigureMock } from '../shared'

const KIND_LABEL: Record<Block['kind'], string> = { heading: 'Section heading', paragraph: 'Paragraph', table: 'Table', figure: 'Figure' }

function TableEditor({ block, onChange, readOnly }: { block: Extract<Block, { kind: 'table' }>; onChange: (b: Block) => void; readOnly: boolean }) {
  const setCell = (r: number, c: number, v: string) => onChange({ ...block, rows: block.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) })
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="label">Table caption</span>
        <input className="input" value={block.caption} disabled={readOnly} onChange={(e) => onChange({ ...block, caption: e.target.value })} />
      </label>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              {block.header.map((h, c) => (
                <th key={c} scope="col" className="p-0 text-left">
                  <input aria-label={`Column ${c + 1} heading`} className="input !h-8 font-semibold" value={h} disabled={readOnly}
                    onChange={(e) => onChange({ ...block, header: block.header.map((x, j) => (j === c ? e.target.value : x)) })} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className="p-0">
                    <input aria-label={`Row ${r + 1}, ${block.header[c] || `column ${c + 1}`}`} className="input !h-8 tabular-nums" value={cell} disabled={readOnly} onChange={(e) => setCell(r, c, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary !h-8" onClick={() => onChange({ ...block, rows: [...block.rows, block.header.map(() => '')] })}><Plus size={14} aria-hidden /> Add row</button>
          <button type="button" className="btn-ghost !h-8" disabled={block.rows.length <= 1} onClick={() => onChange({ ...block, rows: block.rows.slice(0, -1) })}>Remove last row</button>
          <button type="button" className="btn-secondary !h-8" onClick={() => onChange({ ...block, header: [...block.header, 'Column'], rows: block.rows.map((r) => [...r, '']) })}><Plus size={14} aria-hidden /> Add column</button>
          <button type="button" className="btn-ghost !h-8" disabled={block.header.length <= 2} onClick={() => onChange({ ...block, header: block.header.slice(0, -1), rows: block.rows.map((r) => r.slice(0, -1)) })}>Remove last column</button>
        </div>
      )}
    </div>
  )
}

function BlockBody({ block, onChange, readOnly }: { block: Block; onChange: (b: Block) => void; readOnly: boolean }) {
  const id = useId()
  switch (block.kind) {
    case 'heading':
      return <input aria-label="Section heading" className="input font-semibold" value={block.text} disabled={readOnly} onChange={(e) => onChange({ ...block, text: e.target.value })} />
    case 'paragraph':
      return (
        <div>
          <textarea aria-label="Paragraph text" aria-describedby={`${id}-wc`} rows={Math.min(8, Math.max(3, Math.ceil(block.text.length / 90)))} className="input !h-auto py-2 leading-6" value={block.text} disabled={readOnly}
            onChange={(e) => onChange({ ...block, text: e.target.value })} />
          <p id={`${id}-wc`} className="mt-0.5 text-right text-xs text-muted tabular-nums">{wordCount(block.text)} words</p>
        </div>
      )
    case 'table':
      return <TableEditor block={block} onChange={onChange} readOnly={readOnly} />
    case 'figure':
      return (
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          <FigureMock alt={block.alt} />
          <div className="space-y-2">
            <label className="block"><span className="label">Figure caption</span>
              <input className="input" value={block.caption} disabled={readOnly} onChange={(e) => onChange({ ...block, caption: e.target.value })} /></label>
            <label className="block"><span className="label">Alt text (for screen readers)</span>
              <textarea rows={3} className="input !h-auto py-2" value={block.alt} disabled={readOnly} onChange={(e) => onChange({ ...block, alt: e.target.value })} />
              <span className="mt-0.5 block text-right"><CharCount value={block.alt} max={250} /></span></label>
          </div>
        </div>
      )
  }
}

const NEW_BLOCK: Record<Block['kind'], () => Block> = {
  heading: () => ({ id: newId('blk'), kind: 'heading', text: 'New section' }),
  paragraph: () => ({ id: newId('blk'), kind: 'paragraph', text: '' }),
  table: () => ({ id: newId('blk'), kind: 'table', caption: 'Table N. Caption', header: ['Variable', 'Value'], rows: [['', '']] }),
  figure: () => ({ id: newId('blk'), kind: 'figure', caption: 'Figure N. Caption', alt: '' }),
}

export function ArticleEditor({ title, abstract, blocks, readOnly, onTitle, onAbstract, onBlocks }: {
  title: string; abstract: string; blocks: Block[]; readOnly: boolean
  onTitle: (v: string) => void; onAbstract: (v: string) => void; onBlocks: (b: Block[]) => void
}) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    onBlocks(next)
  }
  const aw = wordCount(abstract)
  return (
    <section aria-label="Web article editor" className="card flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-page px-4 py-2.5">
        <div>
          <p className="text-sm font-medium">Web article</p>
          <p className="text-xs text-muted">What readers will see on the journal website</p>
        </div>
        <Badge tone="accent">{blocks.length} blocks</Badge>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <label className="block">
          <span className="label">Title</span>
          <textarea rows={2} className="input !h-auto py-2 text-lg font-semibold leading-snug" value={title} disabled={readOnly} onChange={(e) => onTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Abstract</span>
          <textarea rows={7} className="input !h-auto py-2 leading-6" value={abstract} disabled={readOnly} onChange={(e) => onAbstract(e.target.value)} />
          <span className={`mt-0.5 block text-right text-xs tabular-nums ${aw < 100 || aw > 300 ? 'text-red-600' : 'text-muted'}`}>{aw} words (100–300)</span>
        </label>
        <div className="space-y-3">
          {blocks.map((b, i) => (
            <div key={b.id} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge tone="neutral">{KIND_LABEL[b.kind]}</Badge>
                {!readOnly && (
                  <div className="flex gap-1">
                    <button type="button" aria-label={`Move ${KIND_LABEL[b.kind].toLowerCase()} up`} className="btn-ghost !h-7 !w-7 !px-0" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                    <button type="button" aria-label={`Move ${KIND_LABEL[b.kind].toLowerCase()} down`} className="btn-ghost !h-7 !w-7 !px-0" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                    <button type="button" aria-label={`Delete ${KIND_LABEL[b.kind].toLowerCase()}`} className="btn-ghost !h-7 !w-7 !px-0 hover:!text-red-600" onClick={() => onBlocks(blocks.filter((x) => x.id !== b.id))}><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              <BlockBody block={b} readOnly={readOnly} onChange={(nb) => onBlocks(blocks.map((x) => (x.id === b.id ? nb : x)))} />
            </div>
          ))}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-4">
            <span className="text-xs text-muted">Add block:</span>
            {([['heading', Heading2], ['paragraph', Pilcrow], ['table', Table2], ['figure', ImageIcon]] as const).map(([k, Icon]) => (
              <button key={k} type="button" className="btn-secondary !h-8" onClick={() => onBlocks([...blocks, NEW_BLOCK[k]()])}><Icon size={14} aria-hidden /> {KIND_LABEL[k]}</button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
