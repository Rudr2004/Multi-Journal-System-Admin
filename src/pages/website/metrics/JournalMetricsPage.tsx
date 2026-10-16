import { useCallback, useMemo, useRef, useState } from 'react'
import { FileUp, ImagePlus, Lock, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { PageHeader } from '@/layout/PageHeader'
import { SectionCard } from '@/components/Card'
import { Badge } from '@/components/Badges'
import { FormField, Switch } from '@/components/Form'
import { ErrorState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useScopeJournals } from '@/lib/scope'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import { usePermission } from '@/permissions/hooks'
import { newId } from '@/mock/actions'
import { journalByCode } from '@/mock/data/core'
import { LISTING_LABEL, SYSTEM_STATS, latestSjif, reconcile, statKeys, type CustomStat, type ExternalRating, type SjifYear, type JournalMetricsConfig, type ListingStatus, type StatPlacement } from '@/mock/data/metrics'
import { diffMetrics, getJournalMetrics, saveJournalMetrics } from '@/mock/api/journalMetrics'
import { useMetricsStore } from '@/mock/stores/metrics'
import type { JournalCode } from '@/shared/types'
import { formatDate } from '@/shared/formatters'
import { JournalTabs, useActiveJournal } from '../shared'
import { SortableList, moveItem } from '../SortableList'
import { IMAGE_ACCEPT, readFileRef } from '@/pages/publishing/fields'
import { MetricsPreview, statInfo } from './MetricsPreview'

const urlOk = (v: string) => v === '' || /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v)
const thisYear = new Date().getFullYear()
const yearOk = (v: string) => /^\d{4}$/.test(v) && Number(v) >= 2000 && Number(v) <= thisYear + 1

const schema = z.object({
  sjifYears: z.array(z.object({
    id: z.string(),
    year: z.string().trim().refine(yearOk, `Enter a year from 2000 to ${thisYear + 1}.`),
    value: z.string().trim().refine((v) => /^\d{1,3}(\.\d{1,3})?$/.test(v) && Number(v) <= 100, 'Enter a number such as 6.521.'),
    link: z.string().trim().refine(urlOk, 'Enter a full link starting with https://'),
    certificate: z.string(),
  })),
  ratings: z.array(z.object({
    id: z.string(),
    name: z.string().trim().min(2, 'Name the rating.').max(60, 'Keep the name under 60 characters.'),
    value: z.string().trim().min(1, 'Enter the value.').max(20, 'Keep the value under 20 characters.'),
    year: z.string().trim().refine((v) => v === '' || yearOk(v), `Use a year from 2000 to ${thisYear + 1}.`),
    link: z.string().trim().refine(urlOk, 'Enter a full link starting with https://'),
    certificate: z.string(),
  })),
  customStats: z.array(z.object({
    id: z.string(),
    label: z.string().trim().min(2, 'Name the statistic.').max(50, 'Keep the name under 50 characters.'),
    value: z.string().trim().min(1, 'Enter the value.').max(24, 'Keep the value under 24 characters.'),
    unit: z.string().trim().max(16, 'Keep the unit under 16 characters.'),
  })),
  logos: z.array(z.object({ id: z.string(), name: z.string().trim().min(2, 'Name the service.').max(60, 'Keep the name under 60 characters.'), verifyUrl: z.string().trim().refine(urlOk, 'Enter a full link starting with https://') }).passthrough()),
})

function validate(c: JournalMetricsConfig): Record<string, string> {
  const r = schema.safeParse(c)
  if (r.success) return {}
  const out: Record<string, string> = {}
  for (const i of r.error.issues) out[i.path.join('.')] ??= i.message
  return out
}

/** zod checks each row; this adds the rule that a year can only appear once in the SJIF history. */
function validateAll(c: JournalMetricsConfig): Record<string, string> {
  const out = validate(c)
  const seen = new Map<string, number>()
  c.sjifYears.forEach((y, i) => {
    const yr = y.year.trim()
    if (!yr) return
    if (seen.has(yr)) out[`sjifYears.${i}.year`] ??= `${yr} is already in the list. Edit that row instead.`
    else seen.set(yr, i)
  })
  return out
}

/** Apply an edit and keep both orderings in step with the statistics that now exist. */
function withReconcile(c: JournalMetricsConfig): JournalMetricsConfig {
  const withSjif = { ...c, sjif: latestSjif(c.sjifYears) }
  const keys = statKeys(withSjif)
  return { ...withSjif, home: reconcile(c.home, keys, (k) => k === 'sjif' || k.startsWith('custom:')), table: reconcile(c.table, keys) }
}

function CertificateButton({ value, onChange, disabled, label }: { value: string; onChange: (name: string) => void; disabled: boolean; label: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-2">
      <input ref={ref} type="file" accept="application/pdf,image/*" className="sr-only" tabIndex={-1} aria-label={`${label} file`} onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f.name); e.target.value = '' }} />
      <button type="button" className="btn-secondary h-9" disabled={disabled} onClick={() => ref.current?.click()}><FileUp size={14} strokeWidth={1.5} aria-hidden /> {value ? 'Replace' : 'Upload'}</button>
      {value ? (
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted"><span className="truncate" title={value}>{value}</span>
          {!disabled && <button type="button" className="btn-ghost h-7 px-1.5" aria-label={`Remove ${label}`} onClick={() => onChange('')}><Trash2 size={13} strokeWidth={1.5} /></button>}</span>
      ) : <span className="text-xs text-faint">No file (mock upload)</span>}
    </div>
  )
}

function VisibilityList({ title, hint, list, onChange, info, disabled }: {
  title: string; hint: string; list: StatPlacement[]; onChange: (l: StatPlacement[]) => void; info: (key: string) => { label: string; value: string } | undefined; disabled: boolean
}) {
  const items = list.filter((p) => info(p.key))
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      <SortableList items={items} getId={(p) => p.key} getLabel={(p) => info(p.key)?.label ?? p.key} disabled={disabled}
        onMove={(from, to) => onChange(moveItem(items, from, to))}
        renderItem={(p, _i, handle) => {
          const s = info(p.key)!
          return (
            <div className={cn('flex items-center gap-2 rounded-lg border border-line bg-surface p-2.5', !p.show && 'bg-page')}>
              {handle}
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-medium', !p.show && 'text-muted')}>{s.label}</p>
                <p className="text-xs text-muted tabular-nums">{s.value}</p>
              </div>
              <Switch label={`Show ${s.label}`} checked={p.show} disabled={disabled} onChange={(show) => onChange(items.map((x) => (x.key === p.key ? { ...x, show } : x)))} />
            </div>
          )
        }} />
    </div>
  )
}

function MetricsEditor({ journal, saved, draft, system, onDraft }: {
  journal: JournalCode; saved: JournalMetricsConfig; draft?: JournalMetricsConfig; system: Awaited<ReturnType<typeof getJournalMetrics>>['system']
  onDraft: (j: JournalCode, c: JournalMetricsConfig | null) => void
}) {
  const perm = usePermission('journalMetrics')
  const canEdit = perm.can('manage')
  const cfg = draft ?? saved
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const changes = useMemo(() => diffMetrics(saved, cfg), [saved, cfg])
  const set = (fn: (c: JournalMetricsConfig) => JournalMetricsConfig) => onDraft(journal, withReconcile(fn(cfg)))
  const disabled = !canEdit
  const info = (key: string) => statInfo(key, cfg, system)

  const save = async () => {
    const errs = validateAll(cfg)
    setErrors(errs)
    if (Object.keys(errs).length) { toast.error('Fix the highlighted fields before saving.'); return }
    setSaving(true)
    try {
      const { changes: n } = await saveJournalMetrics(journal, cfg)
      onDraft(journal, null)
      toast.success(n ? `${journal} metrics saved (${n} change${n > 1 ? 's' : ''}). Changes go live on the website within minutes.` : 'Nothing to save, no changes.')
    } catch {
      toast.error('Metrics could not be saved. Try again.')
    } finally { setSaving(false) }
  }

  const setRating = (id: string, p: Partial<ExternalRating>) => set((c) => ({ ...c, ratings: c.ratings.map((r) => (r.id === id ? { ...r, ...p } : r)) }))
  const setYear = (id: string, p: Partial<SjifYear>) => set((c) => ({ ...c, sjifYears: c.sjifYears.map((y) => (y.id === id ? { ...y, ...p } : y)) }))
  const addYear = () => set((c) => {
    const years = c.sjifYears.map((y) => Number(y.year)).filter(Boolean)
    const next = years.length ? Math.min(Math.max(...years) + 1, thisYear + 1) : thisYear
    return { ...c, sjifYears: [{ id: newId('sj'), year: String(next), value: '', link: '', certificate: '' }, ...c.sjifYears] }
  })
  const setCustom = (id: string, p: Partial<CustomStat>) => set((c) => ({ ...c, customStats: c.customStats.map((x) => (x.id === id ? { ...x, ...p } : x)) }))
  const addLogo = () => set((c) => ({ ...c, logos: [...c.logos, { id: newId('lg'), name: '', status: 'applied', verifyUrl: '', show: false }] }))
  const pickLogoImage = async (id: string, file?: File) => {
    if (!file) return
    const ref = await readFileRef(file, IMAGE_ACCEPT.accept, 1, IMAGE_ACCEPT.what)
    if (ref) setLogo(id, { image: { name: ref.name, data: ref.data } })
  }
  const setLogo = (id: string, p: Partial<JournalMetricsConfig['logos'][number]>) => set((c) => ({ ...c, logos: c.logos.map((l) => (l.id === id ? { ...l, ...p } : l)) }))

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <SectionCard title="SJIF Impact Factor Management"
          action={<button type="button" className="btn-secondary h-8" disabled={disabled} onClick={addYear}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add year</button>}>
          <fieldset disabled={disabled}>
            <p className="mb-3 text-sm text-muted">
              Enter the SJIF impact factor for each year, and edit or correct any year later. The newest year is shown on the website
              {cfg.sjif.value ? <> (currently <span className="font-medium text-ink tabular-nums">{cfg.sjif.value}</span> for {cfg.sjif.year})</> : null}.
              Backdated Publications automatically use the value for the article&rsquo;s publication year.
            </p>
            {cfg.sjifYears.length === 0 && <p className="rounded-md border border-dashed border-line p-3 text-center text-sm text-muted">No SJIF values yet. Add the first year to get started.</p>}
            <ul className="space-y-3">
              {cfg.sjifYears.map((y, i) => (
                <li key={y.id} className="rounded-lg border border-line p-3">
                  <div className="grid gap-3 sm:grid-cols-[96px_140px_1fr]">
                    <FormField label="Year" error={errors[`sjifYears.${i}.year`]}>{(a) => <input {...a} className="input" inputMode="numeric" maxLength={4} placeholder="2025" value={y.year} onChange={(e) => setYear(y.id, { year: e.target.value })} />}</FormField>
                    <FormField label="Impact factor" error={errors[`sjifYears.${i}.value`]}>{(a) => <input {...a} className="input" inputMode="decimal" placeholder="e.g. 6.521" value={y.value} onChange={(e) => setYear(y.id, { value: e.target.value })} />}</FormField>
                    <FormField label="Evidence link" error={errors[`sjifYears.${i}.link`]}>{(a) => <input {...a} className="input" type="url" inputMode="url" placeholder="https://" value={y.link} onChange={(e) => setYear(y.id, { link: e.target.value })} />}</FormField>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <CertificateButton label={`SJIF ${y.year || 'new year'} certificate`} value={y.certificate} disabled={disabled} onChange={(certificate) => setYear(y.id, { certificate })} />
                    <button type="button" className="btn-ghost h-8 text-red-600" aria-label={`Delete SJIF ${y.year || 'row'}`} onClick={() => set((c) => ({ ...c, sjifYears: c.sjifYears.filter((x) => x.id !== y.id) }))}><Trash2 size={14} strokeWidth={1.5} aria-hidden /> Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
        </SectionCard>

        <SectionCard title="Other ratings (entered manually)">
          <fieldset disabled={disabled} className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Other ratings</p>
                <button type="button" className="btn-secondary h-8" disabled={disabled || cfg.ratings.length >= 8}
                  onClick={() => set((c) => ({ ...c, ratings: [...c.ratings, { id: newId('rt'), name: '', value: '', year: String(thisYear), link: '', certificate: '' }] }))}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add rating</button>
              </div>
              {cfg.ratings.length === 0 && <p className="rounded-md border border-dashed border-line p-3 text-center text-sm text-muted">No other ratings. Add one such as an ICV score or an impact factor from another service.</p>}
              <ul className="space-y-3">
                {cfg.ratings.map((r, i) => (
                  <li key={r.id} className="rounded-lg border border-line p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_110px_90px]">
                      <FormField label="Rating name" error={errors[`ratings.${i}.name`]}>{(a) => <input {...a} className="input" value={r.name} onChange={(e) => setRating(r.id, { name: e.target.value })} />}</FormField>
                      <FormField label="Value" error={errors[`ratings.${i}.value`]}>{(a) => <input {...a} className="input" value={r.value} onChange={(e) => setRating(r.id, { value: e.target.value })} />}</FormField>
                      <FormField label="Year" error={errors[`ratings.${i}.year`]}>{(a) => <input {...a} className="input" inputMode="numeric" maxLength={4} value={r.year} onChange={(e) => setRating(r.id, { year: e.target.value })} />}</FormField>
                      <FormField label="Evidence link" error={errors[`ratings.${i}.link`]} className="sm:col-span-3">{(a) => <input {...a} className="input" type="url" inputMode="url" placeholder="https://" value={r.link} onChange={(e) => setRating(r.id, { link: e.target.value })} />}</FormField>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <CertificateButton label={`${r.name || 'Rating'} certificate`} value={r.certificate} disabled={disabled} onChange={(certificate) => setRating(r.id, { certificate })} />
                      <button type="button" className="btn-ghost h-8 text-red-600" aria-label={`Delete ${r.name || 'rating'}`} onClick={() => set((c) => ({ ...c, ratings: c.ratings.filter((x) => x.id !== r.id) }))}><Trash2 size={14} strokeWidth={1.5} aria-hidden /> Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </fieldset>
        </SectionCard>

        <SectionCard title="Custom statistics" action={<button type="button" className="btn-secondary h-8" disabled={disabled || cfg.customStats.length >= 10} onClick={() => set((c) => ({ ...c, customStats: [...c.customStats, { id: newId('cs'), label: '', value: '', unit: '' }] }))}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add statistic</button>}>
          <fieldset disabled={disabled}>
            <p className="mb-3 text-sm text-muted">Add your own figures, such as “Reviewers worldwide” or “Institutions represented”. They appear in the lists below, where you can show, hide and reorder them. Only enter figures you can verify.</p>
            {cfg.customStats.length === 0 && <p className="rounded-md border border-dashed border-line p-3 text-center text-sm text-muted">No custom statistics yet. Add one to show another figure on the website.</p>}
            <ul className="space-y-3">
              {cfg.customStats.map((x, i) => (
                <li key={x.id} className="rounded-lg border border-line p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px_110px_auto] sm:items-start">
                    <FormField label="Statistic name" error={errors[`customStats.${i}.label`]}>{(a) => <input {...a} className="input" placeholder="Reviewers worldwide" value={x.label} onChange={(e) => setCustom(x.id, { label: e.target.value })} />}</FormField>
                    <FormField label="Value" error={errors[`customStats.${i}.value`]}>{(a) => <input {...a} className="input" placeholder="1,240" value={x.value} onChange={(e) => setCustom(x.id, { value: e.target.value })} />}</FormField>
                    <FormField label="Unit (optional)" error={errors[`customStats.${i}.unit`]}>{(a) => <input {...a} className="input" placeholder="days, %" value={x.unit} onChange={(e) => setCustom(x.id, { unit: e.target.value })} />}</FormField>
                    <button type="button" className="btn-ghost h-9 text-red-600 sm:mt-5" aria-label={`Delete ${x.label || 'statistic'}`} onClick={() => set((c) => ({ ...c, customStats: c.customStats.filter((y) => y.id !== x.id) }))}><Trash2 size={14} strokeWidth={1.5} aria-hidden /> Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
        </SectionCard>

        <SectionCard title="System figures (calculated)" action={<span className="inline-flex items-center gap-1 text-xs text-muted"><Lock size={12} aria-hidden /> Read-only</span>}>
          <dl className="grid gap-3 sm:grid-cols-2">
            {SYSTEM_STATS.map((s) => {
              const f = system[s.key]
              return (
                <div key={s.key} className="rounded-lg bg-subtle p-3">
                  <dt className="flex items-center gap-2 text-xs text-muted">{s.label}{f.estimated && <Badge tone="warning">Estimate</Badge>}</dt>
                  <dd className="mt-0.5 text-xl font-semibold tabular-nums">{f.display}</dd>
                  <dd className="mt-0.5 text-xs text-muted">{f.basis}</dd>
                </div>
              )
            })}
          </dl>
          <p className="mt-3 text-xs text-muted">These come from the papers in the system, so they cannot be edited here. Decide below whether to show them.</p>
        </SectionCard>

        <SectionCard title="Show on website and order">
          <div className="grid gap-6 lg:grid-cols-2">
            <VisibilityList title="Home page statistics" hint="Drag to reorder. Switch off to hide." list={cfg.home} info={info} disabled={disabled} onChange={(home) => set((c) => ({ ...c, home }))} />
            <VisibilityList title="Statistics table" hint="The table on the journal's About or Statistics page." list={cfg.table} info={info} disabled={disabled} onChange={(table) => set((c) => ({ ...c, table }))} />
          </div>
        </SectionCard>

        <SectionCard title="Indexing logos" action={<button type="button" className="btn-secondary h-8" disabled={disabled} onClick={addLogo}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add logo</button>}>
          <p className="mb-3 text-sm text-muted">Only mark a service as Indexed once it has confirmed the listing. Provide a link so readers can verify it. You can rename, add or delete services, and upload each logo image.</p>
          {cfg.logos.length === 0 && <p className="rounded-md border border-dashed border-line p-3 text-center text-sm text-muted">No indexing services listed. Add one to show its logo on the website.</p>}
          <ul className="space-y-2">
            {cfg.logos.map((l, i) => (
              <li key={l.id} className="rounded-lg border border-line p-2.5">
                <div className="grid items-start gap-2 md:grid-cols-[48px_minmax(0,1fr)_150px]">
                  <label className="relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-subtle text-faint hover:border-accent" title={l.image ? `Replace ${l.image.name}` : 'Upload logo image'}>
                    {l.image?.data ? <img src={l.image.data} alt={`${l.name || 'Service'} logo`} className="h-full w-full object-contain" /> : <ImagePlus size={18} strokeWidth={1.5} aria-hidden />}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={disabled} aria-label={`Upload ${l.name || 'service'} logo image`} onChange={(e) => { void pickLogoImage(l.id, e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                  <div>
                    <input aria-label="Service name" aria-invalid={!!errors[`logos.${i}.name`]} className="input !h-9 font-medium" placeholder="Service name, e.g. Google Scholar" disabled={disabled} value={l.name} onChange={(e) => setLogo(l.id, { name: e.target.value })} />
                    {errors[`logos.${i}.name`] && <p role="alert" className="mt-0.5 text-xs text-red-600">{errors[`logos.${i}.name`]}</p>}
                  </div>
                  <select aria-label={`${l.name || 'Service'} listing status`} className="input !h-9" disabled={disabled} value={l.status} onChange={(e) => setLogo(l.id, { status: e.target.value as ListingStatus })}>
                    {(Object.keys(LISTING_LABEL) as ListingStatus[]).map((st) => <option key={st} value={st}>{LISTING_LABEL[st]}</option>)}
                  </select>
                </div>
                <div className="mt-2 grid items-center gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <div>
                    <input aria-label={`${l.name || 'Service'} verify URL`} aria-invalid={!!errors[`logos.${i}.verifyUrl`]} className="input !h-9" type="url" inputMode="url" placeholder="Verify URL, https://" disabled={disabled} value={l.verifyUrl} onChange={(e) => setLogo(l.id, { verifyUrl: e.target.value })} />
                    {errors[`logos.${i}.verifyUrl`] && <p role="alert" className="mt-0.5 text-xs text-red-600">{errors[`logos.${i}.verifyUrl`]}</p>}
                  </div>
                  <Switch label={`Show ${l.name || 'service'} logo`} checked={l.show} disabled={disabled} onChange={(show) => setLogo(l.id, { show })} />
                  <button type="button" className="btn-ghost h-8 text-red-600" disabled={disabled} aria-label={`Delete ${l.name || 'indexing logo'}`} onClick={() => set((c) => ({ ...c, logos: c.logos.filter((x) => x.id !== l.id) }))}><Trash2 size={14} strokeWidth={1.5} aria-hidden /> Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="sticky -bottom-6 z-30 -mx-6 border-t border-line bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted" role="status">
              {!canEdit ? (perm.why('manage') ?? '') : changes.length ? <span className="font-medium text-amber-700">{changes.length} unsaved change{changes.length > 1 ? 's' : ''}</span> : `All changes saved. Last updated ${formatDate(saved.updatedAt)} by ${saved.updatedBy}.`}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={!changes.length || saving} onClick={() => { onDraft(journal, null); setErrors({}) }}>Discard</button>
              <GuardedButton allowed={canEdit} why={perm.why('manage')} className="btn-primary" disabled={!changes.length || saving} onClick={save}>{saving ? 'Saving…' : 'Save metrics'}</GuardedButton>
            </div>
          </div>
        </div>
      </div>

      <aside aria-label="Website preview" className="xl:sticky xl:top-4 xl:self-start">
        <MetricsPreview config={cfg} system={system} domain={journalByCode(journal).domain} />
        <p className="mt-2 text-xs text-muted">The preview updates as you edit. Nothing goes live until you save.</p>
      </aside>
    </div>
  )
}

export default function JournalMetricsPage() {
  const journals = useScopeJournals()
  const [pick, setPick] = useState<JournalCode | undefined>()
  const journal = useActiveJournal(pick)
  const [drafts, setDrafts] = useState<Partial<Record<JournalCode, JournalMetricsConfig>>>({})
  const configs = useMetricsStore((s) => s.configs)
  const { data, loading, error, reload } = useAsync(() => (journal ? getJournalMetrics(journal) : Promise.reject(new Error('No journal'))), [journal])

  const onDraft = useCallback((j: JournalCode, c: JournalMetricsConfig | null) => {
    setDrafts((d) => { const n = { ...d }; if (c) n[j] = c; else delete n[j]; return n })
  }, [])
  const dirty = useMemo(() => journals.filter((j) => drafts[j] && diffMetrics(configs[j], drafts[j]!).length > 0), [journals, drafts, configs])
  useUnsavedChanges(dirty.length > 0)

  return (
    <>
      <PageHeader title="Journal Metrics" description="Ratings, statistics and indexing logos shown on the journal website. System figures are calculated and cannot be edited."
        actions={journals.length > 1 ? <JournalTabs journals={journals} value={journal ?? journals[0]} onChange={setPick} /> : undefined} />
      {dirty.length > 0 && <p role="status" className="mb-3 text-sm text-amber-700">Unsaved changes in {dirty.join(', ')}. Switching journal keeps them until you save or discard.</p>}
      {!journal ? (
        <div className="card"><ErrorState message="No journal in scope." /></div>
      ) : error ? (
        <div className="card"><ErrorState message="Metrics could not be loaded." onRetry={reload} /></div>
      ) : loading || !data ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading metrics"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>
      ) : (
        <MetricsEditor key={journal} journal={journal} saved={configs[journal]} draft={drafts[journal]} system={data.system} onDraft={onDraft} />
      )}
    </>
  )
}
