import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { SectionCard } from '@/components/Card'
import { Badge } from '@/components/Badges'
import { Switch } from '@/components/Form'
import { ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useScopeJournals } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { usePermission } from '@/permissions/hooks'
import { newId } from '@/mock/actions'
import type { Announcement } from '@/mock/data/website'
import { announcementStatus } from '@/mock/data/website'
import type { HomeSections } from '@/mock/data/pageMgmt'
import { getHomeSections, saveHomeSections } from '@/mock/api/pageMgmt'
import type { JournalCode, Paper } from '@/shared/types'
import { JournalTabs, useActiveJournal } from '../shared'
import { SortableList, moveItem } from '../SortableList'

export const homeDirty = (a: HomeSections, b: HomeSections) => JSON.stringify({ ...a, updatedAt: '', updatedBy: '' }) !== JSON.stringify({ ...b, updatedAt: '', updatedBy: '' })

/** Keep the notices ordering in step with the tab notifications that exist. */
const reconcileNotices = (list: HomeSections['notices'], notices: Announcement[]) => {
  const ids = notices.map((n) => n.id)
  return [...list.filter((n) => ids.includes(n.id)), ...ids.filter((id) => !list.some((n) => n.id === id)).map((id) => ({ id, show: true }))]
}

export function HomeSectionsTab({ drafts, onDraft }: { drafts: Partial<Record<JournalCode, HomeSections>>; onDraft: (j: JournalCode, v: HomeSections | null) => void }) {
  const journals = useScopeJournals()
  const [pick, setPick] = useState<JournalCode | undefined>()
  const journal = useActiveJournal(pick)
  const { data, loading, error, reload } = useAsync(() => (journal ? getHomeSections(journal) : Promise.reject(new Error('none'))), [journal])
  return (
    <div className="space-y-4">
      {journals.length > 1 && <JournalTabs journals={journals} value={journal ?? journals[0]} onChange={setPick} />}
      {!journal || error ? <div className="card"><ErrorState message="Home page sections could not be loaded." onRetry={reload} /></div>
        : loading || !data ? <div className="space-y-4" aria-busy="true"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
        : <Body key={journal} journal={journal} saved={data.sections} papers={data.papers} notices={data.notices} draft={drafts[journal]} onDraft={onDraft} onSaved={reload} />}
    </div>
  )
}

function Body({ journal, saved, papers, notices, draft, onDraft, onSaved }: {
  journal: JournalCode; saved: HomeSections; papers: Paper[]; notices: Announcement[]; draft?: HomeSections
  onDraft: (j: JournalCode, v: HomeSections | null) => void; onSaved: () => void
}) {
  const { can, why } = usePermission('cms')
  const canEdit = can('work')
  const base = useMemo(() => ({ ...saved, notices: reconcileNotices(saved.notices, notices) }), [saved, notices])
  const cur = draft ?? base
  const dirty = !!draft && homeDirty(draft, base)
  const [saving, setSaving] = useState(false)
  const [addPaper, setAddPaper] = useState('')
  const set = (p: Partial<HomeSections>) => onDraft(journal, { ...cur, ...p })
  const paperById = (id: string) => papers.find((p) => p.id === id)
  const noticeById = (id: string) => notices.find((n) => n.id === id)
  const available = papers.filter((p) => !cur.editorsChoice.some((e) => e.paperId === p.id))

  const save = async () => {
    const bad = cur.testimonials.find((t) => t.show && (!t.name.trim() || t.quote.trim().length < 10))
    if (bad) { toast.error('A visible testimonial needs a name and a quote of at least 10 characters.'); return }
    const badH = cur.highlights.find((h) => h.show && (!h.title.trim() || !h.text.trim()))
    if (badH) { toast.error('A visible highlight needs a title and text.'); return }
    setSaving(true)
    try { await saveHomeSections(journal, cur); onDraft(journal, null); toast.success(`${journal} home page saved. Changes go live on the website within minutes.`); onSaved() }
    catch { toast.error('Home page sections could not be saved. Try again.') }
    finally { setSaving(false) }
  }

  const row = (shown: boolean, handle: React.ReactNode, body: React.ReactNode, sw: React.ReactNode, del?: React.ReactNode) => (
    <div className={cn('flex items-start gap-2 rounded-lg border border-line bg-surface p-3', !shown && 'bg-page')}>
      <div className="pt-0.5">{handle}</div>
      <div className="min-w-0 flex-1">{body}</div>
      <div className="flex shrink-0 items-center gap-1">{sw}{del}</div>
    </div>
  )

  return (
    <fieldset disabled={!canEdit} className="space-y-4">
      <SectionCard title="Editor's Choice articles" action={<span className="text-xs text-muted">{cur.editorsChoice.filter((e) => e.show).length} shown</span>}>
        {cur.editorsChoice.length === 0 && <p className="mb-3 rounded-md border border-dashed border-line p-3 text-center text-sm text-muted">No articles picked. Choose published papers below.</p>}
        <SortableList items={cur.editorsChoice} getId={(e) => e.paperId} getLabel={(e) => paperById(e.paperId)?.title ?? e.paperId} disabled={!canEdit}
          onMove={(f, t) => set({ editorsChoice: moveItem(cur.editorsChoice, f, t) })}
          renderItem={(e, _i, handle) => {
            const p = paperById(e.paperId)
            return row(e.show, handle,
              <><p className="line-clamp-2 text-sm font-medium" title={p?.title}>{p?.title ?? 'Paper no longer published'}</p><p className="text-xs text-muted"><span className="font-mono">{e.paperId}</span> · {p?.author}</p></>,
              <Switch label={`Show ${p?.title ?? e.paperId}`} checked={e.show} onChange={(show) => set({ editorsChoice: cur.editorsChoice.map((x) => (x.paperId === e.paperId ? { ...x, show } : x)) })} />,
              <button type="button" className="btn-ghost h-8 px-2 hover:!text-red-600" aria-label={`Remove ${p?.title ?? e.paperId}`} onClick={() => set({ editorsChoice: cur.editorsChoice.filter((x) => x.paperId !== e.paperId) })}><Trash2 size={15} strokeWidth={1.5} /></button>)
          }} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Published paper to add" className="input !h-9 max-w-md" value={addPaper} onChange={(e) => setAddPaper(e.target.value)} disabled={available.length === 0}>
            <option value="">{available.length ? 'Pick a published paper…' : 'All published papers are already listed'}</option>
            {available.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.title.slice(0, 70)}</option>)}
          </select>
          <button type="button" className="btn-secondary h-9" disabled={!addPaper} onClick={() => { set({ editorsChoice: [...cur.editorsChoice, { paperId: addPaper, show: true }] }); setAddPaper('') }}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add article</button>
        </div>
      </SectionCard>

      <SectionCard title="Highlights and Perspectives">
        <SortableList items={cur.highlights} getId={(h) => h.id} getLabel={(h) => h.title || h.kind} disabled={!canEdit}
          onMove={(f, t) => set({ highlights: moveItem(cur.highlights, f, t) })}
          renderItem={(h, _i, handle) => {
            const upd = (p: Partial<typeof h>) => set({ highlights: cur.highlights.map((x) => (x.id === h.id ? { ...x, ...p } : x)) })
            return row(h.show, handle,
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select aria-label="Kind" className="input !h-9 !w-auto" value={h.kind} onChange={(e) => upd({ kind: e.target.value as typeof h.kind })}><option>Highlight</option><option>Perspective</option></select>
                  <input aria-label="Title" className="input !h-9" placeholder="Title" maxLength={90} value={h.title} onChange={(e) => upd({ title: e.target.value })} />
                </div>
                <textarea aria-label={`${h.title || h.kind} text`} rows={2} className="input !h-auto py-2" placeholder="Short text shown on the home page" maxLength={240} value={h.text} onChange={(e) => upd({ text: e.target.value })} />
              </div>,
              <Switch label={`Show ${h.title || h.kind}`} checked={h.show} onChange={(show) => upd({ show })} />,
              <button type="button" className="btn-ghost h-8 px-2 hover:!text-red-600" aria-label={`Delete ${h.title || h.kind}`} onClick={() => set({ highlights: cur.highlights.filter((x) => x.id !== h.id) })}><Trash2 size={15} strokeWidth={1.5} /></button>)
          }} />
        <button type="button" className="btn-secondary mt-3 h-9" onClick={() => set({ highlights: [...cur.highlights, { id: newId('hl'), kind: 'Highlight', title: '', text: '', show: false }] })}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add highlight</button>
      </SectionCard>

      <SectionCard title="Testimonials">
        <SortableList items={cur.testimonials} getId={(t) => t.id} getLabel={(t) => t.name || 'testimonial'} disabled={!canEdit}
          onMove={(f, t) => set({ testimonials: moveItem(cur.testimonials, f, t) })}
          renderItem={(t, _i, handle) => {
            const upd = (p: Partial<typeof t>) => set({ testimonials: cur.testimonials.map((x) => (x.id === t.id ? { ...x, ...p } : x)) })
            return row(t.show, handle,
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input aria-label="Name" className="input !h-9" placeholder="Name" maxLength={60} value={t.name} onChange={(e) => upd({ name: e.target.value })} />
                  <input aria-label="Role" className="input !h-9" placeholder="Role, institution" maxLength={80} value={t.role} onChange={(e) => upd({ role: e.target.value })} />
                </div>
                <textarea aria-label={`Quote from ${t.name || 'author'}`} rows={2} className="input !h-auto py-2" placeholder="Quote" maxLength={280} value={t.quote} onChange={(e) => upd({ quote: e.target.value })} />
              </div>,
              <Switch label={`Show testimonial from ${t.name || 'author'}`} checked={t.show} onChange={(show) => upd({ show })} />,
              <button type="button" className="btn-ghost h-8 px-2 hover:!text-red-600" aria-label={`Delete testimonial from ${t.name || 'author'}`} onClick={() => set({ testimonials: cur.testimonials.filter((x) => x.id !== t.id) })}><Trash2 size={15} strokeWidth={1.5} /></button>)
          }} />
        <button type="button" className="btn-secondary mt-3 h-9" onClick={() => set({ testimonials: [...cur.testimonials, { id: newId('ts'), name: '', role: '', quote: '', show: false }] })}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add testimonial</button>
      </SectionCard>

      <SectionCard title="Notices order" action={<span className="text-xs text-muted">From Tab Notifications</span>}>
        {cur.notices.length === 0 ? <p className="rounded-md border border-dashed border-line p-3 text-center text-sm text-muted">No tab notifications for {journal}. Add one under Announcements.</p> : (
          <SortableList items={cur.notices} getId={(n) => n.id} getLabel={(n) => noticeById(n.id)?.title ?? 'notice'} disabled={!canEdit}
            onMove={(f, t) => set({ notices: moveItem(cur.notices, f, t) })}
            renderItem={(n, _i, handle) => {
              const a = noticeById(n.id)
              const st = a ? announcementStatus(a) : 'expired'
              return row(n.show, handle,
                <><p className="line-clamp-2 text-sm font-medium" title={a?.title}>{a?.title}</p><p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><Badge tone={st === 'live' ? 'success' : st === 'scheduled' ? 'info' : 'neutral'}>{st === 'live' ? 'Live' : st === 'scheduled' ? 'Scheduled' : 'Expired'}</Badge>{a?.type}</p></>,
                <Switch label={`Show ${a?.title ?? 'notice'}`} checked={n.show} onChange={(show) => set({ notices: cur.notices.map((x) => (x.id === n.id ? { ...x, show } : x)) })} />)
            }} />
        )}
      </SectionCard>

      <div className="sticky -bottom-6 z-30 -mx-6 border-t border-line bg-surface/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted" role="status">{!canEdit ? (why('work') ?? '') : dirty ? <span className="font-medium text-amber-700">Unsaved changes to the {journal} home page</span> : 'All changes saved.'}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!dirty || saving} onClick={() => onDraft(journal, null)}>Discard</button>
            <GuardedButton type="button" allowed={canEdit} why={why('work')} className="btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save home page'}</GuardedButton>
          </div>
        </div>
      </div>
    </fieldset>
  )
}
