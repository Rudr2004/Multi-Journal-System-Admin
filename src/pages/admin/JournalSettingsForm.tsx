import { useEffect, useState } from 'react'
import { Controller, useFieldArray, useForm, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { FormField, Switch } from '@/components/Form'
import { SectionCard } from '@/components/Card'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { usePermission } from '@/permissions/hooks'
import { computeGst, GST_RATE, PUBLISHER_STATE } from '@/shared/gst'
import { DOI_PREFIX, doiFor, formatPaperId } from '@/shared/paperId'
import { formatMoney } from '@/shared/formatters'
import type { JournalCode } from '@/shared/types'
import { INDIAN_STATES, INDEXING_SERVICES, type JournalSettings } from '@/mock/data/settings'
import { diffSettings, saveJournalSettings } from '@/mock/api/journalSettings'
import { TagInput } from '@/pages/website/TagInput'

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 08:45.')
const num = (msg: string) => z.number({ error: msg })
const urlOrEmpty = z.string().trim().refine((v) => v === '' || /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v), 'Enter a full link starting with https://')
const label = z.string().trim().min(1, 'Enter a label.').max(60, 'Keep the label under 60 characters.')

export const settingsSchema = z
  .object({
    name: z.string().trim().min(5, 'Enter the full journal name.').max(140, 'Keep the name under 140 characters.'),
    domain: z.string().trim().regex(/^(?!-)([a-z0-9-]+\.)+[a-z]{2,}$/i, 'Enter a domain such as journal.example.org (no https://).'),
    issn: z.string().trim().regex(/^\d{4}-\d{3}[\dX]$/, 'ISSN must be in the format NNNN-NNNN, e.g. 2584-1001.'),
    nextSequence: num('Enter a whole number.').int('Enter a whole number.').min(1, 'Must be at least 1.').max(999999, 'The sequence has 6 digits (max 999999).'),
    apcInr: num('Enter the APC in rupees.').min(0, 'APC cannot be negative.').max(1_000_000, 'That looks too high — check the amount.'),
    apcUsd: num('Enter the APC in dollars.').min(0, 'APC cannot be negative.').max(100_000, 'That looks too high — check the amount.'),
    gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'GSTIN has 15 characters, e.g. 24AABCE4821F1Z5.'),
    gstState: z.string().min(1, 'Choose the state of registration.'),
    whatsapp: z.string().trim().regex(/^\+\d[\d ]{8,16}\d$/, 'Use international format, e.g. +91 98250 10001.'),
    dispatchSlots: z.array(z.object({ label: z.string().trim().min(2, 'Name this slot.').max(40, 'Keep it under 40 characters.'), time })).min(1, 'Keep at least one dispatch slot.').max(4, 'At most 4 slots.'),
    supportStart: time,
    supportEnd: time,
    indexing: z.record(z.string(), z.boolean()),
    site: z.object({
      infoTable: z.array(z.object({ label, value: z.string().trim().min(1, 'Enter a value.').max(160, 'Keep the value under 160 characters.') })).max(15, 'At most 15 rows.'),
      publisher: z.string().trim().min(2, 'Enter the publisher name.').max(100, 'Keep it under 100 characters.'),
      emails: z.array(z.object({ label, value: z.string().trim().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.') })).min(1, 'Add at least one contact email.').max(6, 'At most 6 emails.'),
      phones: z.array(z.object({ label, value: z.string().trim().regex(/^\+?[\d ()-]{7,20}$/, 'Enter a phone number such as +91 20 4000 1100.') })).max(4, 'At most 4 phone numbers.'),
      address: z.string().trim().min(10, 'Enter the full postal address.').max(240, 'Keep the address under 240 characters.'),
      mapLink: urlOrEmpty,
      social: z.object({ linkedin: urlOrEmpty, x: urlOrEmpty, facebook: urlOrEmpty, youtube: urlOrEmpty, instagram: urlOrEmpty }),
      subjects: z.array(z.object({ name: z.string().trim().min(2, 'Name the subject.').max(60, 'Keep it under 60 characters.'), branches: z.array(z.string()) })).min(1, 'Add at least one subject.').max(12, 'At most 12 subjects.'),
      articleTypes: z.array(z.string()).min(1, 'Add at least one article type.'),
      trustBadges: z.array(z.string()).max(10, 'At most 10 badges.'),
      trustLedger: z.array(z.object({
        title: z.string().trim().min(3, 'Enter a title.').max(80, 'Keep it under 80 characters.'),
        detail: z.string().trim().max(200, 'Keep it under 200 characters.'),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
      })).max(10, 'At most 10 entries.'),
      callForPapers: z.object({ enabled: z.boolean(), text: z.string().trim().max(400, 'Keep it under 400 characters.'), deadline: z.string() }).superRefine((c, ctx) => {
        if (!c.enabled) return
        if (c.text.length < 20) ctx.addIssue({ code: 'custom', path: ['text'], message: 'Write at least a sentence (20 characters).' })
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c.deadline)) ctx.addIssue({ code: 'custom', path: ['deadline'], message: 'Choose the submission deadline.' })
      }),
    }),
  })
  .refine((v) => v.supportEnd > v.supportStart, { path: ['supportEnd'], message: 'Support hours must end after they start.' })

export type SettingsValues = z.infer<typeof settingsSchema>

export const SETTINGS_SECTIONS = [
  { id: 'identity', label: 'Journal identity' },
  { id: 'info', label: 'Information table' },
  { id: 'contact', label: 'Contact details' },
  { id: 'address', label: 'Address and map' },
  { id: 'social', label: 'Social links' },
  { id: 'fees', label: 'APC and GST' },
  { id: 'subjects', label: 'Subjects and branches' },
  { id: 'articleTypes', label: 'Article types' },
  { id: 'trust', label: 'Trust badges and ledger' },
  { id: 'cfp', label: 'Call for papers' },
  { id: 'paperId', label: 'Paper ID pattern' },
  { id: 'comms', label: 'WhatsApp and time slots' },
  { id: 'indexing', label: 'Indexing badges' },
] as const

type LVKey = 'infoTable' | 'emails' | 'phones'

function LabelValueList({ name, control, register, errors, max, min = 0, disabled, addLabel, labelPlaceholder, valuePlaceholder, valueType = 'text' }: {
  name: LVKey; control: Control<SettingsValues>; register: UseFormRegister<SettingsValues>; errors: FieldErrors<SettingsValues>
  max: number; min?: number; disabled: boolean; addLabel: string; labelPlaceholder: string; valuePlaceholder: string; valueType?: 'text' | 'email' | 'tel'
}) {
  const { fields, append, remove } = useFieldArray({ control, name: `site.${name}` })
  const errs = errors.site?.[name] as ({ label?: { message?: string }; value?: { message?: string } } | undefined)[] | { message?: string } | undefined
  const rowErr = (i: number) => (Array.isArray(errs) ? errs[i] : undefined)
  const rootMsg = !Array.isArray(errs) ? errs?.message : undefined
  return (
    <div>
      <ul className="space-y-2">
        {fields.map((f, i) => (
          <li key={f.id} className="grid grid-cols-[1fr_1.6fr_auto] items-start gap-2">
            <FormField label={`${addLabel} ${i + 1} label`} error={rowErr(i)?.label?.message}>{(a) => <input {...a} className="input" placeholder={labelPlaceholder} {...register(`site.${name}.${i}.label` as const)} />}</FormField>
            <FormField label={`${addLabel} ${i + 1} value`} error={rowErr(i)?.value?.message}>{(a) => <input {...a} type={valueType} className="input" placeholder={valuePlaceholder} {...register(`site.${name}.${i}.value` as const)} />}</FormField>
            <button type="button" aria-label={`Remove ${addLabel.toLowerCase()} ${i + 1}`} className="btn-ghost mt-5 h-9 w-9 px-0" disabled={disabled || fields.length <= min} onClick={() => remove(i)}><Trash2 size={15} strokeWidth={1.5} /></button>
          </li>
        ))}
      </ul>
      {rootMsg && <p role="alert" className="mt-1 text-xs text-red-600">{rootMsg}</p>}
      <button type="button" className="btn-secondary mt-2" disabled={disabled || fields.length >= max} onClick={() => append({ label: '', value: '' })}><Plus size={14} strokeWidth={1.5} aria-hidden /> {addLabel}</button>
    </div>
  )
}

function Anchor({ id, children }: { id: string; children: React.ReactNode }) {
  return <div id={`sec-${id}`} className="scroll-mt-20">{children}</div>
}

export function JournalSettingsForm({ code, saved, draft, onDraft }: {
  code: JournalCode; saved: JournalSettings; draft?: JournalSettings; onDraft: (code: JournalCode, v: JournalSettings | null) => void
}) {
  const perm = usePermission('journalSettings')
  const canEdit = perm.can('manage')
  const [authorState, setAuthorState] = useState('Maharashtra')
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const { register, control, handleSubmit, watch, getValues, setValue, reset, formState: { errors } } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema), defaultValues: draft ?? saved, mode: 'onBlur',
  })
  const slots = useFieldArray({ control, name: 'dispatchSlots' })
  const subjects = useFieldArray({ control, name: 'site.subjects' })
  const ledger = useFieldArray({ control, name: 'site.trustLedger' })

  useEffect(() => {
    const sub = watch(() => { setJustSaved(false); onDraft(code, getValues() as JournalSettings) })
    return () => sub.unsubscribe()
  }, [watch, getValues, onDraft, code])

  const v = watch()
  const changes = diffSettings(saved, v as JournalSettings)
  const year = new Date().getFullYear()
  const seq = Number.isFinite(v.nextSequence) ? Math.min(999999, Math.max(1, Math.trunc(v.nextSequence))) : 1
  const sampleId = formatPaperId(code, year, seq)
  const inrGst = computeGst(Number.isFinite(v.apcInr) ? v.apcInr : 0, 'INR', authorState)
  const usdGst = computeGst(Number.isFinite(v.apcUsd) ? v.apcUsd : 0, 'USD')

  const submit = handleSubmit(async (values) => {
    setSaving(true)
    try {
      const clean = { ...values, gstin: values.gstin.toUpperCase() } as JournalSettings
      const { changes: n } = await saveJournalSettings(code, clean)
      reset(clean)
      onDraft(code, null)
      setJustSaved(n > 0)
      toast.success(n ? `${code} settings saved (${n} change${n > 1 ? 's' : ''}). Changes go live on the website within minutes.` : 'Nothing to save — no changes.')
    } catch {
      toast.error('Settings could not be saved. Try again.')
    } finally {
      setSaving(false)
    }
  }, () => toast.error('Some fields need attention. The first problem is highlighted.'))

  const discard = () => { reset(saved); onDraft(code, null) }
  const off = !canEdit
  const err = errors.site

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <fieldset disabled={off} className="space-y-4 disabled:opacity-90">
        <Anchor id="identity"><SectionCard title="Journal identity">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Journal name" required error={errors.name?.message} className="md:col-span-2">{(a) => <input {...a} className="input" {...register('name')} />}</FormField>
            <FormField label="Journal code" hint="Used in Paper IDs, DOIs and invoice numbers — cannot be changed.">
              {(a) => <input {...a} className="input bg-subtle font-medium" value={code} readOnly />}
            </FormField>
            <FormField label="Website domain" required error={errors.domain?.message}>{(a) => <input {...a} className="input" inputMode="url" {...register('domain')} />}</FormField>
            <FormField label="ISSN" required error={errors.issn?.message} hint="Format NNNN-NNNN">{(a) => <input {...a} className="input" placeholder="2584-1001" maxLength={9} {...register('issn')} />}</FormField>
            <FormField label="Publisher" required error={err?.publisher?.message}>{(a) => <input {...a} className="input" {...register('site.publisher')} />}</FormField>
          </div>
        </SectionCard></Anchor>

        <Anchor id="info"><SectionCard title="Information table">
          <p className="mb-3 text-sm text-muted">The “Journal at a glance” table on the About page, one row per fact.</p>
          <LabelValueList name="infoTable" control={control} register={register} errors={errors} max={15} disabled={off} addLabel="Add row" labelPlaceholder="Frequency" valuePlaceholder="Quarterly" />
        </SectionCard></Anchor>

        <Anchor id="contact"><SectionCard title="Contact details">
          <p className="mb-2 text-sm font-medium">Emails</p>
          <LabelValueList name="emails" control={control} register={register} errors={errors} max={6} min={1} disabled={off} addLabel="Add email" labelPlaceholder="Editorial office" valuePlaceholder="editorial@journal.org" valueType="email" />
          <p className="mb-2 mt-5 text-sm font-medium">Phones</p>
          <LabelValueList name="phones" control={control} register={register} errors={errors} max={4} disabled={off} addLabel="Add phone" labelPlaceholder="Phone and WhatsApp" valuePlaceholder="+91 20 4000 1100" valueType="tel" />
        </SectionCard></Anchor>

        <Anchor id="address"><SectionCard title="Address and map">
          <div className="grid gap-4">
            <FormField label="Postal address" required error={err?.address?.message}>{(a) => <textarea {...a} rows={2} className="input !h-auto py-2" {...register('site.address')} />}</FormField>
            <FormField label="Map link" error={err?.mapLink?.message} hint="A Google Maps or similar link opened from the Contact page.">{(a) => <input {...a} type="url" inputMode="url" className="input" placeholder="https://maps.google.com/..." {...register('site.mapLink')} />}</FormField>
          </div>
        </SectionCard></Anchor>

        <Anchor id="social"><SectionCard title="Social links">
          <div className="grid gap-4 md:grid-cols-2">
            {([['linkedin', 'LinkedIn'], ['x', 'X (Twitter)'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['instagram', 'Instagram']] as const).map(([k, l]) => (
              <FormField key={k} label={l} error={err?.social?.[k]?.message} hint="Leave empty to hide the icon.">{(a) => <input {...a} type="url" inputMode="url" className="input" placeholder="https://" {...register(`site.social.${k}`)} />}</FormField>
            ))}
          </div>
        </SectionCard></Anchor>

        <Anchor id="fees"><SectionCard title="Article processing charge (APC) and GST">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="APC for Indian authors (INR, excl. GST)" required error={errors.apcInr?.message}>
              {(a) => <input {...a} type="number" min={0} step="1" className="input" {...register('apcInr', { valueAsNumber: true })} />}
            </FormField>
            <FormField label="APC for international authors (USD)" required error={errors.apcUsd?.message}>
              {(a) => <input {...a} type="number" min={0} step="1" className="input" {...register('apcUsd', { valueAsNumber: true })} />}
            </FormField>
          </div>

          <div className="mt-4 rounded-md border border-line p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">GST preview</p>
              <label className="flex items-center gap-2 text-xs text-muted">Author’s state
                <select aria-label="Author’s state for the GST preview" className="input !h-8 !w-auto" value={authorState} onChange={(e) => setAuthorState(e.target.value)} disabled={false}>
                  {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" aria-live="polite">
              <div className="flex justify-between"><dt className="text-muted">APC</dt><dd className="tabular-nums">{formatMoney(inrGst.base, 'INR')}</dd></div>
              {inrGst.cgst > 0 && <div className="flex justify-between"><dt className="text-muted">CGST 9%</dt><dd className="tabular-nums">{formatMoney(inrGst.cgst, 'INR')}</dd></div>}
              {inrGst.sgst > 0 && <div className="flex justify-between"><dt className="text-muted">SGST 9%</dt><dd className="tabular-nums">{formatMoney(inrGst.sgst, 'INR')}</dd></div>}
              {inrGst.igst > 0 && <div className="flex justify-between"><dt className="text-muted">IGST 18%</dt><dd className="tabular-nums">{formatMoney(inrGst.igst, 'INR')}</dd></div>}
              <div className="flex justify-between font-medium sm:col-span-2 sm:border-t sm:border-line sm:pt-1"><dt>Author pays</dt><dd className="tabular-nums">{formatMoney(inrGst.total, 'INR')}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-muted">{inrGst.note}. International authors pay {formatMoney(usdGst.total, 'USD')} — {usdGst.note.toLowerCase()}.</p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <FormField label="GSTIN" required error={errors.gstin?.message} hint="15 characters. The first two digits are the state code.">
              {(a) => <input {...a} className="input font-mono uppercase" maxLength={15} {...register('gstin')} />}
            </FormField>
            <FormField label="State of registration" required error={errors.gstState?.message}>
              {(a) => <select {...a} className="input" {...register('gstState')}>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select>}
            </FormField>
          </div>
          <div className="mt-3 rounded-md bg-subtle p-3 text-xs leading-5 text-muted">
            <p className="font-medium text-ink">How GST is charged</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Indian authors in <strong>{v.gstState || PUBLISHER_STATE}</strong> (same state as the publisher): CGST {GST_RATE * 50}% + SGST {GST_RATE * 50}%.</li>
              <li>Indian authors in any other state: IGST {GST_RATE * 100}%.</li>
              <li>International authors paying in USD: no GST (export of services).</li>
            </ul>
          </div>
        </SectionCard></Anchor>

        <Anchor id="subjects"><SectionCard title="Subjects and branches">
          <p className="mb-3 text-sm text-muted">Authors choose a subject, then a branch, when they submit. They also drive the subject pages on the website.</p>
          <ul className="space-y-3">
            {subjects.fields.map((f, i) => (
              <li key={f.id} className="rounded-lg border border-line p-3">
                <div className="grid items-start gap-3 md:grid-cols-[1fr_1.6fr_auto]">
                  <FormField label={`Subject ${i + 1}`} error={err?.subjects?.[i]?.name?.message}>{(a) => <input {...a} className="input" {...register(`site.subjects.${i}.name`)} />}</FormField>
                  <FormField label={`Branches of subject ${i + 1}`} hint="Press Enter or comma after each branch.">
                    {(a) => <Controller control={control} name={`site.subjects.${i}.branches`} render={({ field }) => <TagInput id={a.id} value={field.value} onChange={field.onChange} disabled={off} placeholder="Add a branch" max={15} />} />}
                  </FormField>
                  <button type="button" aria-label={`Remove subject ${i + 1}`} className="btn-ghost mt-5 h-9 w-9 px-0" disabled={off || subjects.fields.length <= 1} onClick={() => subjects.remove(i)}><Trash2 size={15} strokeWidth={1.5} /></button>
                </div>
              </li>
            ))}
          </ul>
          {typeof err?.subjects?.message === 'string' && <p role="alert" className="mt-1 text-xs text-red-600">{err.subjects.message}</p>}
          {typeof err?.subjects?.root?.message === 'string' && <p role="alert" className="mt-1 text-xs text-red-600">{err.subjects.root.message}</p>}
          <button type="button" className="btn-secondary mt-3" disabled={off || subjects.fields.length >= 12} onClick={() => subjects.append({ name: '', branches: [] })}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add subject</button>
        </SectionCard></Anchor>

        <Anchor id="articleTypes"><SectionCard title="Article types">
          <FormField label="Article types accepted" error={typeof err?.articleTypes?.message === 'string' ? err.articleTypes.message : err?.articleTypes?.root?.message} hint="Shown in the submission form and on Author Guidelines.">
            {(a) => <Controller control={control} name="site.articleTypes" render={({ field }) => <TagInput id={a.id} value={field.value} onChange={field.onChange} disabled={off} placeholder="Add an article type" max={12} />} />}
          </FormField>
        </SectionCard></Anchor>

        <Anchor id="trust"><SectionCard title="Trust badges and trust ledger">
          <FormField label="Trust badges" error={typeof err?.trustBadges?.message === 'string' ? err.trustBadges.message : undefined} hint="Short claims shown under the journal title, e.g. Peer reviewed.">
            {(a) => <Controller control={control} name="site.trustBadges" render={({ field }) => <TagInput id={a.id} value={field.value} onChange={field.onChange} disabled={off} placeholder="Add a badge" max={10} />} />}
          </FormField>
          <p className="mb-2 mt-5 text-sm font-medium">Trust ledger</p>
          <p className="mb-2 text-xs text-muted">Dated milestones that readers can verify, shown as a timeline on the website.</p>
          <ul className="space-y-2">
            {ledger.fields.map((f, i) => (
              <li key={f.id} className="grid items-start gap-2 md:grid-cols-[1fr_1.6fr_150px_auto]">
                <FormField label={`Entry ${i + 1} title`} error={err?.trustLedger?.[i]?.title?.message}>{(a) => <input {...a} className="input" {...register(`site.trustLedger.${i}.title`)} />}</FormField>
                <FormField label={`Entry ${i + 1} detail`} error={err?.trustLedger?.[i]?.detail?.message}>{(a) => <input {...a} className="input" {...register(`site.trustLedger.${i}.detail`)} />}</FormField>
                <FormField label={`Entry ${i + 1} date`} error={err?.trustLedger?.[i]?.date?.message}>{(a) => <input {...a} type="date" className="input" {...register(`site.trustLedger.${i}.date`)} />}</FormField>
                <button type="button" aria-label={`Remove ledger entry ${i + 1}`} className="btn-ghost mt-5 h-9 w-9 px-0" disabled={off} onClick={() => ledger.remove(i)}><Trash2 size={15} strokeWidth={1.5} /></button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-secondary mt-2" disabled={off || ledger.fields.length >= 10} onClick={() => ledger.append({ title: '', detail: '', date: new Date().toISOString().slice(0, 10) })}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add ledger entry</button>
        </SectionCard></Anchor>

        <Anchor id="cfp"><SectionCard title="Call for papers">
          <Switch label="Show the call for papers on the website" description="Appears in the home page banner and on the Submit page." checked={!!v.site?.callForPapers?.enabled} disabled={off} onChange={(on) => setValue('site.callForPapers.enabled', on, { shouldDirty: true })} />
          <div className="mt-3 grid gap-4 md:grid-cols-[1fr_200px]">
            <FormField label="Call for papers text" error={err?.callForPapers?.text?.message}>{(a) => <textarea {...a} rows={3} className="input !h-auto py-2" {...register('site.callForPapers.text')} />}</FormField>
            <FormField label="Submission deadline" error={err?.callForPapers?.deadline?.message}>{(a) => <input {...a} type="date" className="input" {...register('site.callForPapers.deadline')} />}</FormField>
          </div>
        </SectionCard></Anchor>

        <Anchor id="paperId"><SectionCard title="Paper ID pattern">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Next sequence number" required error={errors.nextSequence?.message} hint="The next paper submitted receives this number. Existing IDs never change.">
              {(a) => <input {...a} type="number" inputMode="numeric" className="input" {...register('nextSequence', { valueAsNumber: true })} />}
            </FormField>
            <div className="rounded-md bg-subtle p-3 text-sm" aria-live="polite">
              <p className="text-xs text-muted">Pattern: <span className="font-mono">{'{CODE}{YEAR}{6-digit sequence}'}</span></p>
              <p className="mt-1">Next Paper ID <span className="ml-1 whitespace-nowrap font-mono font-medium">{sampleId}</span></p>
              <p className="mt-0.5">DOI <span className="ml-1 whitespace-nowrap font-mono font-medium">{doiFor(sampleId)}</span></p>
              <p className="mt-1 text-xs text-muted">DOI prefix {DOI_PREFIX} is set by Crossref and is shared by all journals.</p>
            </div>
          </div>
        </SectionCard></Anchor>

        <Anchor id="comms"><SectionCard title="WhatsApp and time slots">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="WhatsApp number" required error={errors.whatsapp?.message} hint="Business number authors use to reach this journal.">
              {(a) => <input {...a} type="tel" className="input" {...register('whatsapp')} />}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Support hours from" required error={errors.supportStart?.message}>{(a) => <input {...a} type="time" className="input" {...register('supportStart')} />}</FormField>
              <FormField label="Support hours to" required error={errors.supportEnd?.message}>{(a) => <input {...a} type="time" className="input" {...register('supportEnd')} />}</FormField>
            </div>
          </div>
          <div className="mt-4">
            <p className="label">Daily dispatch slots (IST)</p>
            <ul className="space-y-2">
              {slots.fields.map((f, i) => (
                <li key={f.id} className="grid grid-cols-[1fr_120px_auto] items-start gap-2">
                  <FormField label={`Slot ${i + 1} name`} error={errors.dispatchSlots?.[i]?.label?.message}>{(a) => <input {...a} className="input" {...register(`dispatchSlots.${i}.label`)} />}</FormField>
                  <FormField label="Time" error={errors.dispatchSlots?.[i]?.time?.message}>{(a) => <input {...a} type="time" className="input" {...register(`dispatchSlots.${i}.time`)} />}</FormField>
                  <button type="button" aria-label={`Remove slot ${i + 1}`} className="btn-ghost mt-5 h-9 w-9 px-0" disabled={slots.fields.length <= 1 || off} onClick={() => slots.remove(i)}><Trash2 size={15} strokeWidth={1.5} /></button>
                </li>
              ))}
            </ul>
            {errors.dispatchSlots?.root?.message && <p role="alert" className="mt-1 text-xs text-red-600">{errors.dispatchSlots.root.message}</p>}
            {typeof errors.dispatchSlots?.message === 'string' && <p role="alert" className="mt-1 text-xs text-red-600">{errors.dispatchSlots.message}</p>}
            <button type="button" className="btn-secondary mt-2" disabled={slots.fields.length >= 4 || off} onClick={() => slots.append({ label: 'Extra dispatch', time: '12:00' })}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add slot</button>
            <p className="mt-2 text-xs text-muted">Author emails and WhatsApp messages are queued and released together at each slot.</p>
          </div>
        </SectionCard></Anchor>

        <Anchor id="indexing"><SectionCard title="Indexing badges on the website">
          <p className="mb-3 text-sm text-muted">Only switch on a badge once the journal is truly listed — the website shows these in the header and footer. Listing status and verification links are managed in Journal Metrics.</p>
          <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {INDEXING_SERVICES.map((s) => (
              <li key={s.id}>
                <Switch checked={!!v.indexing?.[s.id]} disabled={off} label={s.label} description={s.description} onChange={(on) => setValue(`indexing.${s.id}`, on, { shouldDirty: true })} />
              </li>
            ))}
          </ul>
        </SectionCard></Anchor>
      </fieldset>

      <div className="sticky -bottom-6 z-30 -mx-6 border-t border-line bg-surface/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted" role="status">
            {!canEdit ? (perm.why('manage') ?? '') : changes.length ? <span className="font-medium text-amber-700">{changes.length} unsaved change{changes.length > 1 ? 's' : ''}: {[...new Set(changes.map((c) => c.group))].join(', ')}</span> : justSaved ? 'Saved. Changes go live on the website within minutes.' : 'All changes saved.'}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={discard} disabled={!changes.length || saving}>Discard</button>
            <GuardedButton allowed={canEdit} why={perm.why('manage')} className="btn-primary" type="submit" disabled={!changes.length || saving}>{saving ? 'Saving…' : 'Save settings'}</GuardedButton>
          </div>
        </div>
      </div>
    </form>
  )
}
