import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
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

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, e.g. 08:45.')
const num = (msg: string) => z.number({ error: msg })

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
  })
  .refine((v) => v.supportEnd > v.supportStart, { path: ['supportEnd'], message: 'Support hours must end after they start.' })

export type SettingsValues = z.infer<typeof settingsSchema>

export function JournalSettingsForm({ code, saved, draft, onDraft }: {
  code: JournalCode; saved: JournalSettings; draft?: JournalSettings; onDraft: (code: JournalCode, v: JournalSettings | null) => void
}) {
  const perm = usePermission('journalSettings')
  const canEdit = perm.can('manage')
  const [authorState, setAuthorState] = useState('Maharashtra')
  const [saving, setSaving] = useState(false)
  const { register, control, handleSubmit, watch, getValues, setValue, reset, formState: { errors } } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema), defaultValues: draft ?? saved, mode: 'onBlur',
  })
  const slots = useFieldArray({ control, name: 'dispatchSlots' })

  useEffect(() => {
    const sub = watch(() => onDraft(code, getValues() as JournalSettings))
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
      toast.success(n ? `${code} settings saved (${n} change${n > 1 ? 's' : ''}). Recorded in the audit log.` : 'Nothing to save — no changes.')
    } catch {
      toast.error('Settings could not be saved. Try again.')
    } finally {
      setSaving(false)
    }
  })

  const discard = () => { reset(saved); onDraft(code, null) }
  const fieldsetOff = !canEdit

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <fieldset disabled={fieldsetOff} className="space-y-4 disabled:opacity-90">
        <SectionCard title="Journal identity">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Journal name" required error={errors.name?.message} className="md:col-span-2">{(a) => <input {...a} className="input" {...register('name')} />}</FormField>
            <FormField label="Journal code" hint="Used in Paper IDs, DOIs and invoice numbers — cannot be changed.">
              {(a) => <input {...a} className="input bg-subtle font-medium" value={code} readOnly />}
            </FormField>
            <FormField label="Website domain" required error={errors.domain?.message}>{(a) => <input {...a} className="input" inputMode="url" {...register('domain')} />}</FormField>
            <FormField label="ISSN" required error={errors.issn?.message} hint="Format NNNN-NNNN">{(a) => <input {...a} className="input" placeholder="2584-1001" maxLength={9} {...register('issn')} />}</FormField>
          </div>
        </SectionCard>

        <SectionCard title="Paper ID pattern">
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
        </SectionCard>

        <SectionCard title="Article processing charge (APC) and GST">
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
        </SectionCard>

        <SectionCard title="WhatsApp and time slots">
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
                  <button type="button" aria-label={`Remove slot ${i + 1}`} className="btn-ghost mt-5 h-9 w-9 px-0" disabled={slots.fields.length <= 1 || fieldsetOff} onClick={() => slots.remove(i)}><Trash2 size={15} strokeWidth={1.5} /></button>
                </li>
              ))}
            </ul>
            {errors.dispatchSlots?.root?.message && <p role="alert" className="mt-1 text-xs text-red-600">{errors.dispatchSlots.root.message}</p>}
            {typeof errors.dispatchSlots?.message === 'string' && <p role="alert" className="mt-1 text-xs text-red-600">{errors.dispatchSlots.message}</p>}
            <button type="button" className="btn-secondary mt-2" disabled={slots.fields.length >= 4 || fieldsetOff} onClick={() => slots.append({ label: 'Extra dispatch', time: '12:00' })}><Plus size={14} strokeWidth={1.5} aria-hidden /> Add slot</button>
            <p className="mt-2 text-xs text-muted">Author emails and WhatsApp messages are queued and released together at each slot.</p>
          </div>
        </SectionCard>

        <SectionCard title="Indexing badges on the website">
          <p className="mb-3 text-sm text-muted">Only switch on a badge once the journal is truly listed — the website shows these in the header and footer.</p>
          <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {INDEXING_SERVICES.map((s) => (
              <li key={s.id}>
                <Switch checked={!!v.indexing?.[s.id]} disabled={fieldsetOff} label={s.label} description={s.description} onChange={(on) => setValue(`indexing.${s.id}`, on, { shouldDirty: true })} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </fieldset>

      <div className="sticky -bottom-6 z-30 -mx-6 border-t border-line bg-surface/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted" role="status">
            {!canEdit ? (perm.why('manage') ?? '') : changes.length ? <span className="font-medium text-amber-700">{changes.length} unsaved change{changes.length > 1 ? 's' : ''}: {[...new Set(changes.map((c) => c.group))].join(', ')}</span> : 'All changes saved.'}
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
