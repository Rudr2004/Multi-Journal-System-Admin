import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { SectionCard } from '@/components/Card'
import { Badge } from '@/components/Badges'
import { Switch } from '@/components/Form'
import { EmptyState, ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useScopeJournals } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { useCan, usePermission } from '@/permissions/hooks'
import { FLAG_META } from '@/permissions/flags'
import { useSession } from '@/mock/store'
import { newId } from '@/mock/actions'
import { SEO_TARGET_LABEL, type SeoRule, type SeoTargetType } from '@/mock/data/pageMgmt'
import { getSeoRules, saveSeoRules } from '@/mock/api/pageMgmt'
import type { JournalCode, Paper } from '@/shared/types'
import { JournalTabs, useActiveJournal } from '../shared'

export const seoDirty = (a: SeoRule[], b: SeoRule[]) => JSON.stringify(a) !== JSON.stringify(b)

const SAMPLE = 'Every manuscript goes through double-blind peer review before acceptance. Because we are an open access journal, the article processing charge covers hosting and indexing. Our peer review policy explains each step.'

function ruleErrors(rules: SeoRule[]): Record<string, { keyword?: string; target?: string; max?: string }> {
  const out: Record<string, { keyword?: string; target?: string; max?: string }> = {}
  rules.forEach((r, i) => {
    const e: { keyword?: string; target?: string; max?: string } = {}
    const k = r.keyword.trim().toLowerCase()
    if (k.length < 3) e.keyword = 'Use at least 3 characters.'
    else if (rules.some((x, j) => j !== i && x.keyword.trim().toLowerCase() === k)) e.keyword = 'This keyword already has a rule.'
    if (!r.target.trim()) e.target = r.targetType === 'article' ? 'Choose an article.' : 'Enter a target.'
    if (!Number.isInteger(r.maxPerPage) || r.maxPerPage < 1 || r.maxPerPage > 10) e.max = 'Use 1 to 10.'
    if (e.keyword || e.target || e.max) out[r.id] = e
  })
  return out
}

/** Apply active rules to a sentence: longest keyword first, each limited to `maxPerPage` links, no overlaps. */
function applyLinks(text: string, rules: SeoRule[]) {
  const taken: { s: number; e: number; rule: SeoRule }[] = []
  const active = rules.filter((r) => r.on && r.keyword.trim().length >= 3).sort((a, b) => b.keyword.length - a.keyword.length)
  for (const r of active) {
    const re = new RegExp(r.keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    let count = 0
    for (const m of text.matchAll(re)) {
      if (count >= Math.max(1, r.maxPerPage)) break
      const s = m.index ?? 0
      const e = s + m[0].length
      if (taken.some((t) => s < t.e && e > t.s)) continue
      taken.push({ s, e, rule: r }); count++
    }
  }
  taken.sort((a, b) => a.s - b.s)
  const parts: { text: string; rule?: SeoRule }[] = []
  let at = 0
  for (const t of taken) { if (t.s > at) parts.push({ text: text.slice(at, t.s) }); parts.push({ text: text.slice(t.s, t.e), rule: t.rule }); at = t.e }
  if (at < text.length) parts.push({ text: text.slice(at) })
  return parts
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export function SeoSettingsTab({ drafts, onDraft }: { drafts: Partial<Record<JournalCode, SeoRule[]>>; onDraft: (j: JournalCode, v: SeoRule[] | null) => void }) {
  const flagOn = useSession((s) => s.flags.seoAutoLink)
  const canManage = useCan('journalSettings', 'manage')
  const journals = useScopeJournals()
  const [pick, setPick] = useState<JournalCode | undefined>()
  const journal = useActiveJournal(pick)
  const { data, loading, error, reload } = useAsync(() => (journal ? getSeoRules(journal) : Promise.reject(new Error('none'))), [journal])

  if (!flagOn) {
    return (
      <div className="card">
        <EmptyState icon={Lock} title="SEO keyword auto-linking is switched off"
          hint={canManage ? 'It is a proposed feature. Switch it on under Proposed features in Journal Settings to manage keyword rules.' : 'It is a proposed feature that the Super Admin can switch on in Journal Settings.'}
          action={canManage ? <Link to="/journal-settings#features" className="btn-primary">Open Journal Settings</Link> : undefined} />
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {journals.length > 1 && <JournalTabs journals={journals} value={journal ?? journals[0]} onChange={setPick} />}
        <Badge tone="accent">{FLAG_META.seoAutoLink.badge}</Badge>
        {!canManage && <span className="inline-flex items-center gap-1 text-sm text-muted"><Lock size={13} aria-hidden /> Read-only. Only the Super Admin can change SEO settings.</span>}
      </div>
      {!journal || error ? <div className="card"><ErrorState message="SEO settings could not be loaded." onRetry={reload} /></div>
        : loading || !data ? <div className="space-y-4" aria-busy="true"><Skeleton className="h-40 w-full" /></div>
        : <Body key={journal} journal={journal} saved={data.rules} papers={data.papers} canManage={canManage} draft={drafts[journal]} onDraft={onDraft} onSaved={reload} />}
    </div>
  )
}

function Body({ journal, saved, papers, canManage, draft, onDraft, onSaved }: {
  journal: JournalCode; saved: SeoRule[]; papers: Paper[]; canManage: boolean; draft?: SeoRule[]; onDraft: (j: JournalCode, v: SeoRule[] | null) => void; onSaved: () => void
}) {
  const { why } = usePermission('journalSettings')
  const rules = draft ?? saved
  const dirty = !!draft && seoDirty(draft, saved)
  const errs = useMemo(() => ruleErrors(rules), [rules])
  const [saving, setSaving] = useState(false)
  const [sample, setSample] = useState(SAMPLE)
  const set = (r: SeoRule[]) => onDraft(journal, r)
  const upd = (id: string, p: Partial<SeoRule>) => set(rules.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const parts = useMemo(() => applyLinks(sample, rules), [sample, rules])
  const targetLabel = (r: SeoRule) => (r.targetType === 'article' ? (papers.find((p) => p.id === r.target)?.title ?? r.target) : r.targetType === 'subject' ? `/subjects/${slug(r.target)}` : `/search?q=${encodeURIComponent(r.target)}`)

  const save = async () => {
    if (Object.keys(errs).length) { toast.error('Fix the highlighted rules before saving.'); return }
    setSaving(true)
    try { await saveSeoRules(journal, rules); onDraft(journal, null); toast.success(`${journal} SEO rules saved. Changes go live on the website within minutes.`); onSaved() }
    catch { toast.error('SEO rules could not be saved. Try again.') }
    finally { setSaving(false) }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <SectionCard title="Keyword auto-linking rules" action={<span className="text-xs text-muted">{rules.filter((r) => r.on).length} of {rules.length} on</span>}>
        <fieldset disabled={!canManage} className="space-y-3">
          {rules.length === 0 && <p className="rounded-md border border-dashed border-line p-4 text-center text-sm text-muted">No rules yet. Add a keyword and choose where it should link.</p>}
          {rules.map((r) => {
            const e = errs[r.id] ?? {}
            return (
              <div key={r.id} className={cn('rounded-lg border border-line p-3', !r.on && 'bg-page')}>
                <div className="grid gap-2 md:grid-cols-[1fr_150px]">
                  <div>
                    <label className="label" htmlFor={`kw-${r.id}`}>Keyword</label>
                    <input id={`kw-${r.id}`} aria-invalid={!!e.keyword} className="input !h-9" value={r.keyword} maxLength={60} onChange={(ev) => upd(r.id, { keyword: ev.target.value })} />
                    {e.keyword && <p role="alert" className="mt-0.5 text-xs text-red-600">{e.keyword}</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor={`tt-${r.id}`}>Links to</label>
                    <select id={`tt-${r.id}`} className="input !h-9" value={r.targetType} onChange={(ev) => upd(r.id, { targetType: ev.target.value as SeoTargetType, target: '' })}>
                      {(Object.keys(SEO_TARGET_LABEL) as SeoTargetType[]).map((t) => <option key={t} value={t}>{SEO_TARGET_LABEL[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`tg-${r.id}`}>{r.targetType === 'article' ? 'Article' : r.targetType === 'subject' ? 'Subject page' : 'Search query'}</label>
                    {r.targetType === 'article' ? (
                      <select id={`tg-${r.id}`} aria-invalid={!!e.target} className="input !h-9" value={r.target} onChange={(ev) => upd(r.id, { target: ev.target.value })}>
                        <option value="">Choose a published article…</option>
                        {papers.map((p) => <option key={p.id} value={p.id}>{p.title.slice(0, 80)}</option>)}
                      </select>
                    ) : <input id={`tg-${r.id}`} aria-invalid={!!e.target} className="input !h-9" value={r.target} maxLength={80} placeholder={r.targetType === 'subject' ? 'e.g. Smart materials' : 'e.g. peer review'} onChange={(ev) => upd(r.id, { target: ev.target.value })} />}
                    {e.target && <p role="alert" className="mt-0.5 text-xs text-red-600">{e.target}</p>}
                  </div>
                  <div>
                    <label className="label" htmlFor={`mx-${r.id}`}>Max links per page</label>
                    <input id={`mx-${r.id}`} type="number" min={1} max={10} aria-invalid={!!e.max} className="input !h-9" value={Number.isFinite(r.maxPerPage) ? r.maxPerPage : ''} onChange={(ev) => upd(r.id, { maxPerPage: ev.target.valueAsNumber })} />
                    {e.max && <p role="alert" className="mt-0.5 text-xs text-red-600">{e.max}</p>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Switch label={`Rule for ${r.keyword || 'new keyword'} is on`} checked={r.on} onChange={(on) => upd(r.id, { on })} />
                  <button type="button" className="btn-ghost h-8 px-2 hover:!text-red-600" aria-label={`Delete rule for ${r.keyword || 'new keyword'}`} onClick={() => set(rules.filter((x) => x.id !== r.id))}><Trash2 size={15} strokeWidth={1.5} /></button>
                </div>
              </div>
            )
          })}
          <button type="button" className="btn-secondary h-9" onClick={() => set([...rules, { id: newId('seo'), journal, keyword: '', targetType: 'search', target: '', maxPerPage: 1, on: true }])}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add rule</button>
        </fieldset>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-sm text-muted" role="status">{!canManage ? (why('manage') ?? '') : dirty ? <span className="font-medium text-amber-700">Unsaved changes</span> : 'All changes saved.'}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!dirty || saving} onClick={() => onDraft(journal, null)}>Discard</button>
            <GuardedButton type="button" allowed={canManage} why={why('manage')} className="btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save rules'}</GuardedButton>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Preview">
        <label className="label" htmlFor="seo-sample">Try a sentence</label>
        <textarea id="seo-sample" rows={4} className="input !h-auto py-2" value={sample} onChange={(e) => setSample(e.target.value)} />
        <p className="mb-1 mt-3 text-xs font-medium text-muted">On the website</p>
        <p className="rounded-md bg-subtle p-3 text-sm leading-6">
          {parts.map((p, i) => <Fragment key={i}>{p.rule ? <span className="text-accent underline decoration-dotted underline-offset-2" title={targetLabel(p.rule)}>{p.text}</span> : p.text}</Fragment>)}
        </p>
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {rules.filter((r) => r.on && r.keyword.trim()).map((r) => <li key={r.id}><span className="font-medium text-ink">{r.keyword}</span> links to {targetLabel(r)} (max {r.maxPerPage})</li>)}
        </ul>
      </SectionCard>
    </div>
  )
}
