import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowDown, ArrowUp, Bot, ChevronDown, ChevronRight, CornerDownRight, HelpCircle, LifeBuoy, MessageCircle, Plus, RotateCcw, Trash2, UserRound } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { Badge } from '@/components/Badges'
import { DataTable, SelectFilter, type Column } from '@/components/DataTable'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { FormField, Switch } from '@/components/Form'
import { ErrorState } from '@/components/States'
import { Tabs } from '@/components/Tabs'
import { RelativeTime } from '@/components/Time'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import { usePermission } from '@/permissions/hooks'
import { newId } from '@/mock/actions'
import { countNodes, deleteFaq, getChatbot, saveBotTree, saveFaq, setFaqPublished } from '@/mock/api/chatbot'
import { FAQ_CATEGORIES, type BotAction, type BotNode, type Faq } from '@/mock/data/communication'
import { PageSkeleton } from './parts'

const MAX_CHILDREN = 8
const GREETING = 'Hi, I’m the EdTech Publishers assistant. Choose an option below.'

/* ---------- immutable tree helpers ---------- */
const mapTree = (nodes: BotNode[], fn: (n: BotNode) => BotNode): BotNode[] => nodes.map((n) => { const m = fn(n); return { ...m, children: mapTree(m.children, fn) } })
const findNode = (nodes: BotNode[], id: string): BotNode | undefined => { for (const n of nodes) { if (n.id === id) return n; const c = findNode(n.children, id); if (c) return c } return undefined }
const removeNode = (nodes: BotNode[], id: string): BotNode[] => nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: removeNode(n.children, id) }))
const parentOf = (nodes: BotNode[], id: string, parent: BotNode | null = null): { parent: BotNode | null; siblings: BotNode[] } | undefined => {
  if (nodes.some((n) => n.id === id)) return { parent, siblings: nodes }
  for (const n of nodes) { const r = parentOf(n.children, id, n); if (r) return r }
  return undefined
}
function moveNode(nodes: BotNode[], id: string, dir: -1 | 1): BotNode[] {
  const i = nodes.findIndex((n) => n.id === id)
  if (i >= 0) {
    const j = i + dir
    if (j < 0 || j >= nodes.length) return nodes
    const c = [...nodes]; [c[i], c[j]] = [c[j], c[i]]
    return c
  }
  return nodes.map((n) => ({ ...n, children: moveNode(n.children, id, dir) }))
}
const addChild = (nodes: BotNode[], parentId: string | null, child: BotNode): BotNode[] =>
  parentId === null ? [...nodes, child] : nodes.map((n) => (n.id === parentId ? { ...n, children: [...n.children, child] } : { ...n, children: addChild(n.children, parentId, child) }))
const flatten = (nodes: BotNode[]): BotNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)])

function nodeErrors(n: BotNode, faqs: Faq[]): { label?: string; reply?: string; faq?: string } {
  const e: { label?: string; reply?: string; faq?: string } = {}
  if (n.label.trim().length < 2) e.label = 'Label must be at least 2 characters'
  else if (n.label.length > 30) e.label = 'Keep labels under 30 characters so they fit a WhatsApp button'
  if (n.reply.trim().length < 5) e.reply = 'Reply text must be at least 5 characters'
  else if (n.reply.length > 600) e.reply = 'Reply is too long (600 characters max)'
  if (n.action.type === 'faq' && !faqs.some((f) => f.id === (n.action as { faqId: string }).faqId)) e.faq = 'Choose a FAQ to show'
  return e
}

/* ---------- phone preview ---------- */
function PhonePreview({ tree, faqs }: { tree: BotNode[]; faqs: Faq[] }) {
  const [trail, setTrail] = useState<string[]>([])
  const path: BotNode[] = []
  let level = tree
  for (const id of trail) { const n = level.find((x) => x.id === id); if (!n) break; path.push(n); level = n.children }
  const options = path.length ? path[path.length - 1].children : tree
  const last = path[path.length - 1]
  const faq = last?.action.type === 'faq' ? faqs.find((f) => f.id === (last.action as { faqId: string }).faqId) : undefined
  return (
    <div className="mx-auto w-full max-w-[300px]" aria-label="Chatbot preview">
      <div className="rounded-[28px] border-[5px] border-slate-800 bg-slate-800 p-0.5 shadow-overlay">
        <div className="flex h-[520px] flex-col overflow-hidden rounded-[22px] bg-[#e9edf1]">
          <div className="flex items-center gap-2 bg-[#128c7e] px-3 py-2.5 text-white">
            <Bot size={18} aria-hidden /> <div><p className="text-sm font-semibold leading-4">EdTech Assistant</p><p className="text-[11px] opacity-80">Preview mode</p></div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-[13px]" aria-live="polite">
            <p className="max-w-[85%] rounded-lg rounded-tl-sm bg-white px-2.5 py-1.5 shadow-sm">{GREETING}</p>
            {path.map((n, i) => (
              <div key={n.id} className="space-y-2">
                <p className="ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-2.5 py-1.5 shadow-sm">{n.label}</p>
                <p className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-tl-sm bg-white px-2.5 py-1.5 shadow-sm">{n.reply}</p>
                {i === path.length - 1 && n.action.type === 'faq' && faq && (
                  <p className="max-w-[85%] rounded-lg rounded-tl-sm border-l-4 border-[#128c7e] bg-white px-2.5 py-1.5 shadow-sm"><strong className="block">{faq.question}</strong>{faq.answer}</p>
                )}
                {i === path.length - 1 && n.action.type === 'ticket' && <p className="max-w-[85%] rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900 shadow-sm">A helpdesk ticket has been created. You will get the number by SMS.</p>}
                {i === path.length - 1 && n.action.type === 'agent' && <p className="max-w-[85%] rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900 shadow-sm">Handing over to a support agent…</p>}
              </div>
            ))}
          </div>
          <div className="space-y-1.5 border-t border-slate-300 bg-white p-2">
            {options.length === 0 && <p className="px-1 text-center text-xs text-muted">End of this branch</p>}
            {options.map((o) => (
              <button key={o.id} onClick={() => setTrail((t) => [...t, o.id])} className="w-full rounded-md border border-line px-2 py-1.5 text-center text-[13px] font-medium text-[#0b7a6e] hover:bg-slate-50">{o.label || '(untitled)'}</button>
            ))}
            <div className="flex gap-1.5 pt-0.5">
              <button disabled={!path.length} onClick={() => setTrail((t) => t.slice(0, -1))} className="flex-1 rounded-md bg-slate-100 py-1 text-xs font-medium text-muted hover:text-ink disabled:opacity-40">Back</button>
              <button disabled={!path.length} onClick={() => setTrail([])} className="flex-1 rounded-md bg-slate-100 py-1 text-xs font-medium text-muted hover:text-ink disabled:opacity-40">Main menu</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- tree editor ---------- */
const ACTION_ICON = { none: null, faq: HelpCircle, ticket: LifeBuoy, agent: UserRound }

function TreeRows({ nodes, depth, selected, collapsed, toggle, onSelect, faqs }: { nodes: BotNode[]; depth: number; selected: string | null; collapsed: Set<string>; toggle: (id: string) => void; onSelect: (id: string) => void; faqs: Faq[] }) {
  return (
    <ul role={depth === 0 ? 'tree' : 'group'}>
      {nodes.map((n) => {
        const Icon = ACTION_ICON[n.action.type]
        const open = !collapsed.has(n.id)
        const bad = Object.keys(nodeErrors(n, faqs)).length > 0
        return (
          <li key={n.id} role="treeitem" aria-expanded={n.children.length ? open : undefined} aria-selected={n.id === selected}>
            <div className={cn('flex items-center gap-1 rounded-md pr-2', n.id === selected ? 'bg-accent-soft' : 'hover:bg-subtle')} style={{ paddingLeft: depth * 18 + 4 }}>
              {n.children.length ? (
                <button aria-label={`${open ? 'Collapse' : 'Expand'} ${n.label}`} className="p-1 text-faint hover:text-ink" onClick={() => toggle(n.id)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              ) : <span className="w-6" />}
              <button className={cn('flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm', n.id === selected && 'font-medium text-accent')} onClick={() => onSelect(n.id)}>
                <span className="truncate">{n.label || '(untitled)'}</span>
                {Icon && <Icon size={13} strokeWidth={1.5} className="shrink-0 text-faint" aria-label={`Action: ${n.action.type}`} />}
                {bad && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" role="img" aria-label="Has errors" />}
              </button>
              {n.children.length > 0 && <span className="text-xs text-faint">{n.children.length}</span>}
            </div>
            {n.children.length > 0 && open && <TreeRows nodes={n.children} depth={depth + 1} selected={selected} collapsed={collapsed} toggle={toggle} onSelect={onSelect} faqs={faqs} />}
          </li>
        )
      })}
    </ul>
  )
}

function TreeEditor({ initial, faqs, canEdit, why, reload, onDirty }: { initial: BotNode[]; faqs: Faq[]; canEdit: boolean; why?: string; reload: () => void; onDirty: (d: boolean) => void }) {
  const [tree, setTree] = useState<BotNode[]>(() => structuredClone(initial))
  const [selected, setSelected] = useState<string | null>(initial[0]?.id ?? null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(tree) !== JSON.stringify(initial)
  useUnsavedChanges(dirty)
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])

  const node = selected ? findNode(tree, selected) : undefined
  const loc = selected ? parentOf(tree, selected) : undefined
  const errs = node ? nodeErrors(node, faqs) : {}
  const allValid = flatten(tree).every((n) => Object.keys(nodeErrors(n, faqs)).length === 0)
  const edit = (p: Partial<BotNode>) => node && setTree((t) => mapTree(t, (n) => (n.id === node.id ? { ...n, ...p } : n)))
  const idx = loc ? loc.siblings.findIndex((s) => s.id === selected) : -1
  const add = (parentId: string | null) => {
    const child: BotNode = { id: newId('b'), label: 'New option', reply: 'Write the reply the customer sees.', action: { type: 'none' }, children: [] }
    setTree((t) => addChild(t, parentId, child))
    if (parentId) setCollapsed((c) => { const n = new Set(c); n.delete(parentId); return n })
    setSelected(child.id)
  }
  const setAction = (type: BotAction['type']) => edit({ action: type === 'faq' ? { type, faqId: faqs[0]?.id ?? '' } : ({ type } as BotAction) })
  const save = async () => {
    setSaving(true)
    await saveBotTree(tree)
    setSaving(false)
    toast.success('Chatbot menu saved and published')
    reload()
  }
  const w = !canEdit ? why : undefined
  const descendants = node ? countNodes(node.children) : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">A fixed menu, not AI: customers tap options and receive the replies you write here. Changes appear in the preview straight away and go live when you save.</p>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs font-medium text-amber-700">Unsaved changes</span>}
          <button className="btn-secondary" disabled={!dirty || saving} onClick={() => { setTree(structuredClone(initial)); setSelected(initial[0]?.id ?? null) }}><RotateCcw size={14} aria-hidden /> Discard</button>
          <GuardedButton allowed={canEdit} why={why} className="btn-primary" disabled={!dirty || !allValid || saving} onClick={save}>{saving ? 'Saving…' : 'Save & publish'}</GuardedButton>
        </div>
      </div>
      {!allValid && dirty && <p role="alert" className="text-sm text-red-600">Fix the nodes marked with a red dot before saving.</p>}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr] xl:grid-cols-[280px_1fr_330px]">
        <section aria-label="Menu tree" className="card h-fit">
          <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <h2 className="text-[16px] font-semibold">Menu</h2>
            <GuardedButton allowed={canEdit && tree.length < MAX_CHILDREN} why={w ?? `A menu level holds up to ${MAX_CHILDREN} options.`} className="btn-secondary !h-8" onClick={() => add(null)}><Plus size={14} aria-hidden /> Option</GuardedButton>
          </header>
          <div className="p-2">
            {tree.length === 0 ? <p className="px-2 py-4 text-center text-sm text-muted">No options yet. Add the first menu option.</p>
              : <TreeRows nodes={tree} depth={0} selected={selected} collapsed={collapsed} faqs={faqs} onSelect={setSelected} toggle={(id) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })} />}
          </div>
        </section>

        <section aria-label="Node editor" className="card min-w-0 p-4">
          {!node ? <p className="py-10 text-center text-sm text-muted">Select a menu option to edit it.</p> : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs text-muted"><CornerDownRight size={13} aria-hidden /> {loc?.parent ? `Under “${loc.parent.label}”` : 'Top-level option'}</p>
                <div className="flex gap-1">
                  <GuardedButton allowed={canEdit && idx > 0} why={w} className="btn-ghost !px-2" aria-label="Move up" onClick={() => setTree((t) => moveNode(t, node.id, -1))}><ArrowUp size={16} /></GuardedButton>
                  <GuardedButton allowed={canEdit && !!loc && idx < loc.siblings.length - 1} why={w} className="btn-ghost !px-2" aria-label="Move down" onClick={() => setTree((t) => moveNode(t, node.id, 1))}><ArrowDown size={16} /></GuardedButton>
                  <GuardedButton allowed={canEdit} why={w} className="btn-ghost !px-2 hover:!text-red-600" aria-label="Delete option" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /></GuardedButton>
                </div>
              </div>
              <FormField label="Button label" required error={errs.label} hint={`${node.label.length} / 30 characters`}>
                {(p) => <input {...p} className="input" value={node.label} readOnly={!canEdit} onChange={(e) => edit({ label: e.target.value })} />}
              </FormField>
              <FormField label="Reply text" required error={errs.reply} hint={`${node.reply.length} / 600 characters`}>
                {(p) => <textarea {...p} rows={5} className="input !h-auto py-2" value={node.reply} readOnly={!canEdit} onChange={(e) => edit({ reply: e.target.value })} />}
              </FormField>
              <FormField label="After the reply">
                {(p) => (
                  <select {...p} className="input" value={node.action.type} disabled={!canEdit} onChange={(e) => setAction(e.target.value as BotAction['type'])}>
                    <option value="none">Show sub-options only</option>
                    <option value="faq">Show a FAQ answer</option>
                    <option value="ticket">Create a helpdesk ticket (hand-off)</option>
                    <option value="agent">Hand over to a WhatsApp agent</option>
                  </select>
                )}
              </FormField>
              {node.action.type === 'faq' && (
                <FormField label="FAQ to show" error={errs.faq}>
                  {(p) => (
                    <select {...p} className="input" value={node.action.type === 'faq' ? node.action.faqId : ''} disabled={!canEdit} onChange={(e) => edit({ action: { type: 'faq', faqId: e.target.value } })}>
                      {faqs.map((f) => <option key={f.id} value={f.id}>{f.question}{f.published ? '' : ' (unpublished)'}</option>)}
                    </select>
                  )}
                </FormField>
              )}
              <div className="border-t border-line pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Sub-options ({node.children.length})</h3>
                  <GuardedButton allowed={canEdit && node.children.length < MAX_CHILDREN} why={w ?? `Up to ${MAX_CHILDREN} sub-options`} className="btn-secondary !h-8" onClick={() => add(node.id)}><Plus size={14} aria-hidden /> Add sub-option</GuardedButton>
                </div>
                {node.children.length === 0 ? <p className="text-sm text-muted">No sub-options. This option ends its branch after the reply.</p> : (
                  <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                    {node.children.map((c) => <li key={c.id}><button className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-subtle" onClick={() => setSelected(c.id)}>{c.label}<ChevronRight size={14} className="text-faint" aria-hidden /></button></li>)}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        <section aria-label="Preview" className="lg:col-span-2 xl:col-span-1">
          <h2 className="mb-3 text-[16px] font-semibold">Preview</h2>
          <PhonePreview tree={tree} faqs={faqs} />
        </section>
      </div>

      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} danger confirmLabel="Delete option" title={`Delete “${node?.label}”?`}
        consequences={['Remove this option from the menu.', descendants ? `Also delete its ${descendants} sub-option${descendants === 1 ? '' : 's'}.` : 'It has no sub-options.', 'Take effect for customers when you save and publish.']}
        onConfirm={() => { if (node) { setTree((t) => removeNode(t, node.id)); setSelected(loc?.parent?.id ?? null) } }} />
    </div>
  )
}

/* ---------- FAQs ---------- */
const faqSchema = z.object({
  question: z.string().trim().min(8, 'Question must be at least 8 characters').max(160, 'Keep the question under 160 characters'),
  answer: z.string().trim().min(20, 'Answer must be at least 20 characters').max(800, 'Answer is too long (800 characters max)'),
  category: z.string().min(1, 'Choose a category'),
  published: z.boolean(),
})
type FaqForm = z.infer<typeof faqSchema>

function FaqForm({ faq, onSaved }: { faq?: Faq; onSaved: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FaqForm>({
    resolver: zodResolver(faqSchema),
    defaultValues: { question: faq?.question ?? '', answer: faq?.answer ?? '', category: faq?.category ?? FAQ_CATEGORIES[0], published: faq?.published ?? true },
  })
  const submit = handleSubmit(async (v) => {
    await saveFaq({ ...v, id: faq?.id })
    toast.success(faq ? 'FAQ updated' : 'FAQ added')
    onSaved()
  })
  return (
    <form id="faq-form" onSubmit={submit} noValidate className="space-y-4">
      <FormField label="Question" required error={errors.question?.message}>{(p) => <input {...p} className="input" {...register('question')} />}</FormField>
      <FormField label="Answer" required error={errors.answer?.message}>{(p) => <textarea {...p} rows={5} className="input !h-auto py-2" {...register('answer')} />}</FormField>
      <FormField label="Category" required error={errors.category?.message}>{(p) => <select {...p} className="input" {...register('category')}>{FAQ_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>}</FormField>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-indigo-600" {...register('published')} /> Published (visible to the chatbot)</label>
      <button type="submit" className="sr-only" disabled={isSubmitting}>Save</button>
    </form>
  )
}

function FaqTab({ faqs, canEdit, why, reload }: { faqs: Faq[]; canEdit: boolean; why?: string; reload: () => void }) {
  const [editing, setEditing] = useState<Faq | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Faq | null>(null)
  const [category, setCategory] = useState('')
  const rows = useMemo(() => faqs.filter((f) => !category || f.category === category), [faqs, category])
  const columns: Column<Faq>[] = [
    { id: 'q', header: 'Question', locked: true, sort: (f) => f.question, cell: (f) => <div className="max-w-[420px]"><p className="font-medium">{f.question}</p><p className="line-clamp-2 text-xs text-muted" title={f.answer}>{f.answer}</p></div> },
    { id: 'cat', header: 'Category', sort: (f) => f.category, cell: (f) => <Badge>{f.category}</Badge> },
    { id: 'upd', header: 'Updated', sort: (f) => f.updatedAt, cell: (f) => <span className="whitespace-nowrap text-muted"><RelativeTime value={f.updatedAt} /></span> },
    { id: 'pub', header: 'Published', cell: (f) => <div className="w-24" data-no-row-click><Switch label={`${f.published ? 'Unpublish' : 'Publish'}: ${f.question}`} checked={f.published} disabled={!canEdit}
      onChange={async (v) => { await setFaqPublished(f.id, v); toast.success(v ? 'FAQ published' : 'FAQ unpublished'); reload() }} /></div> },
    { id: 'act', header: 'Actions', locked: true, cell: (f) => (
      <div className="flex gap-1" data-no-row-click>
        <GuardedButton allowed={canEdit} why={why} className="btn-secondary !h-8" onClick={() => setEditing(f)}>Edit</GuardedButton>
        <GuardedButton allowed={canEdit} why={why} className="btn-ghost !h-8 !px-2 hover:!text-red-600" aria-label={`Delete FAQ: ${f.question}`} onClick={() => setDeleting(f)}><Trash2 size={15} strokeWidth={1.5} /></GuardedButton>
      </div>
    ) },
  ]
  return (
    <>
      <DataTable<Faq> id="chatbot-faqs" data={rows} columns={columns} rowKey={(f) => f.id}
        search={{ placeholder: 'Search questions and answers', text: (f) => `${f.question} ${f.answer}` }}
        filters={<SelectFilter label="Category" value={category} onChange={setCategory} options={FAQ_CATEGORIES.map((c) => ({ value: c, label: c }))} />}
        empty={{ icon: MessageCircle, title: 'No FAQs yet', hint: 'Add questions the chatbot can answer.' }}
        toolbarRight={<GuardedButton allowed={canEdit} why={why} className="btn-primary" onClick={() => setEditing('new')}><Plus size={15} strokeWidth={1.5} aria-hidden /> Add FAQ</GuardedButton>} />
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add FAQ' : 'Edit FAQ'} width={560}
        footer={<><button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button type="submit" form="faq-form" className="btn-primary">Save FAQ</button></>}>
        <FaqForm faq={editing && editing !== 'new' ? editing : undefined} onSaved={() => { setEditing(null); reload() }} />
      </Dialog>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger confirmLabel="Delete FAQ" title="Delete this FAQ?"
        consequences={[`Remove “${deleting?.question}” permanently.`, 'Menu options that showed this FAQ will show only their reply text.']}
        onConfirm={async () => { if (deleting) { await deleteFaq(deleting.id); toast.success('FAQ deleted'); reload() } }} />
    </>
  )
}

/* ---------- page ---------- */
export function ChatbotPage() {
  const { can, why } = usePermission('chatbot')
  const canEdit = can('manage')
  const { data, loading, error, reload } = useAsync(getChatbot, [])
  const [tab, setTab] = useState('tree')
  const dirtyRef = useRef(false)
  const onDirty = useCallback((d: boolean) => { dirtyRef.current = d }, [])
  const change = (id: string) => {
    if (id === tab) return
    if (dirtyRef.current && !window.confirm('You have unsaved menu changes. Discard them and switch tab?')) return
    dirtyRef.current = false
    setTab(id)
  }
  return (
    <>
      <PageHeader title="Chatbot flows" description="Edit the menu customers see in the chatbot, and the FAQ answers it can show."
        actions={!canEdit ? <Badge>View only</Badge> : undefined} />
      {error ? <div className="card"><ErrorState message="Chatbot settings could not be loaded." onRetry={reload} /></div>
        : loading && !data ? <PageSkeleton rows={3} />
        : data && (
          <Tabs value={tab} onChange={change} tabs={[
            { id: 'tree', label: 'Menu tree', content: <TreeEditor onDirty={onDirty} initial={data.tree} faqs={data.faqs} canEdit={canEdit} why={why('manage')} reload={reload} /> },
            { id: 'faqs', label: 'FAQs', badge: data.faqs.length, content: <FaqTab faqs={data.faqs} canEdit={canEdit} why={why('manage')} reload={reload} /> },
          ]} />
        )}
    </>
  )
}
