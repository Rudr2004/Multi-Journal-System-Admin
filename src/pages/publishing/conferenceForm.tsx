import type { FieldErrors, UseFormRegister, UseFormWatch } from 'react-hook-form'
import { z } from 'zod'
import { CharCount, FormField, Switch } from '@/components/Form'
import { computeGst } from '@/shared/gst'
import { formatMoney } from '@/shared/formatters'
import { journalByCode } from '@/mock/data/core'
import type { Conference } from '@/mock/data/publishing'
import type { ConferenceInput } from '@/mock/api/conferences'
import type { JournalCode } from '@/shared/types'

export const conferenceSchema = z.object({
  journal: z.string().min(1, 'Choose the journal that will publish the proceedings'),
  name: z.string().trim().min(5, 'Enter the full conference name').max(140),
  shortName: z.string().trim().min(3, 'Enter a short name, e.g. ICAMT 2026').max(24, 'Keep the short name under 24 characters'),
  startDate: z.string().min(1, 'Set the start date'),
  endDate: z.string().min(1, 'Set the end date'),
  venue: z.string().trim().min(3, 'Enter the venue'),
  city: z.string().trim().min(2, 'Enter the city and country'),
  organiser: z.string().trim().min(3, 'Enter the organiser'),
  theme: z.string().trim().min(10, 'Describe the theme in at least 10 characters').max(2000, 'Keep the theme to 2,000 characters or fewer'),
  volumeName: z.string().trim().max(120, 'Keep the volume name under 120 characters'),
  sponsoredBy: z.string().trim().max(160, 'Keep the sponsor name under 160 characters'),
  contactEmail: z.string().trim().max(120).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address'),
  contactPhone: z.string().trim().max(24).refine((v) => !v || /^\+?[\d\s()-]{7,}$/.test(v), 'Enter a valid phone number, e.g. +91 98765 43210'),
  highlights: z.string().trim().max(2000, 'Keep the highlights to 2,000 characters or fewer'),
  editorialNote: z.string().max(5000, 'Keep the editorial note to 5,000 characters or fewer'),
  keyMembers: z.array(z.object({
    name: z.string().trim().min(2, "Enter the member's name"),
    designation: z.string().trim().min(2, 'Enter the designation'),
  })),
  submissionDeadline: z.string().min(1, 'Set the submission deadline'),
  cameraReadyDeadline: z.string().min(1, 'Set the camera-ready deadline'),
  apcEnabled: z.boolean(),
  apcCurrency: z.enum(['INR', 'USD']),
  apcAmount: z.number().or(z.nan()),
}).superRefine((v, ctx) => {
  if (v.startDate && v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after the start date' })
  if (v.submissionDeadline && v.startDate && v.submissionDeadline >= v.startDate) ctx.addIssue({ code: 'custom', path: ['submissionDeadline'], message: 'Deadline must be before the conference starts' })
  if (v.cameraReadyDeadline && v.submissionDeadline && v.cameraReadyDeadline < v.submissionDeadline) ctx.addIssue({ code: 'custom', path: ['cameraReadyDeadline'], message: 'Camera-ready deadline must be after the submission deadline' })
  if (v.apcEnabled && !(v.apcAmount > 0)) ctx.addIssue({ code: 'custom', path: ['apcAmount'], message: 'Enter an amount greater than zero' })
})
export type ConferenceFormValues = z.infer<typeof conferenceSchema>

export const toFormValues = (c?: Conference, journal?: JournalCode): ConferenceFormValues => ({
  journal: c?.journal ?? journal ?? '', name: c?.name ?? '', shortName: c?.shortName ?? '', startDate: c?.startDate ?? '', endDate: c?.endDate ?? '',
  venue: c?.venue ?? '', city: c?.city ?? '', organiser: c?.organiser ?? '', theme: c?.theme ?? '',
  volumeName: c?.volumeName ?? '', sponsoredBy: c?.sponsoredBy ?? '', contactEmail: c?.contactEmail ?? '', contactPhone: c?.contactPhone ?? '',
  highlights: c?.highlights ?? '', editorialNote: c?.editorialNote ?? '', keyMembers: c?.keyMembers ?? [],
  submissionDeadline: c?.submissionDeadline ?? '', cameraReadyDeadline: c?.cameraReadyDeadline ?? '',
  apcEnabled: !!c?.apc, apcCurrency: c?.apc?.currency ?? 'INR', apcAmount: c?.apc?.amount ?? NaN,
})

export const toInput = (v: ConferenceFormValues): ConferenceInput => ({
  journal: v.journal as JournalCode, name: v.name, shortName: v.shortName, startDate: v.startDate, endDate: v.endDate, venue: v.venue, city: v.city,
  organiser: v.organiser, theme: v.theme, submissionDeadline: v.submissionDeadline, cameraReadyDeadline: v.cameraReadyDeadline,
  volumeName: v.volumeName || undefined, sponsoredBy: v.sponsoredBy || undefined, contactEmail: v.contactEmail || undefined, contactPhone: v.contactPhone || undefined,
  highlights: v.highlights || undefined, editorialNote: v.editorialNote || undefined, keyMembers: v.keyMembers.filter((m) => m.name.trim() || m.designation.trim()),
  apc: v.apcEnabled ? { currency: v.apcCurrency, amount: v.apcAmount } : undefined,
})

export function ConferenceFields({ register, errors, watch, setApc, journals, lockJournal }: {
  register: UseFormRegister<ConferenceFormValues>
  errors: FieldErrors<ConferenceFormValues>
  watch: UseFormWatch<ConferenceFormValues>
  setApc: (on: boolean) => void
  journals: JournalCode[]
  lockJournal?: boolean
}) {
  const apcOn = watch('apcEnabled')
  const cur = watch('apcCurrency')
  const amt = watch('apcAmount')
  const gst = apcOn && amt > 0 ? computeGst(amt, cur, 'Maharashtra') : undefined
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Publishing journal" required error={errors.journal?.message} hint="The journal that will publish the proceedings issue.">
        {(a) => <select {...a} className="input" disabled={lockJournal} {...register('journal')}>{journals.map((c) => <option key={c} value={c}>{c} — {journalByCode(c).name}</option>)}</select>}
      </FormField>
      <FormField label="Short name" required error={errors.shortName?.message}>
        {(a) => <input {...a} className="input" placeholder="ICAMT 2026" {...register('shortName')} />}
      </FormField>
      <FormField label="Conference name" required error={errors.name?.message} className="sm:col-span-2">
        {(a) => <input {...a} className="input" {...register('name')} />}
      </FormField>
      <FormField label="Start date" required error={errors.startDate?.message}>{(a) => <input {...a} type="date" className="input" {...register('startDate')} />}</FormField>
      <FormField label="End date" required error={errors.endDate?.message}>{(a) => <input {...a} type="date" className="input" {...register('endDate')} />}</FormField>
      <FormField label="Venue" required error={errors.venue?.message}>{(a) => <input {...a} className="input" {...register('venue')} />}</FormField>
      <FormField label="City, country" required error={errors.city?.message}>{(a) => <input {...a} className="input" placeholder="Ahmedabad, India" {...register('city')} />}</FormField>
      <FormField label="Organiser" required error={errors.organiser?.message} className="sm:col-span-2">{(a) => <input {...a} className="input" {...register('organiser')} />}</FormField>
      <FormField label="Conference theme" required error={errors.theme?.message} className="sm:col-span-2">
        {(a) => (
          <>
            <textarea {...a} rows={4} maxLength={2000} className="input !h-auto py-2" {...register('theme')} />
            <div className="mt-1 text-right"><CharCount value={watch('theme') ?? ''} max={2000} min={10} /></div>
          </>
        )}
      </FormField>
      <FormField label="Volume name" error={errors.volumeName?.message} className="sm:col-span-2"
        hint="Used on the certificates of conference papers, e.g. “Proceedings of ICAMT 2026, Volume 1”.">
        {(a) => <input {...a} className="input" placeholder="Proceedings of ICAMT 2026, Volume 1" {...register('volumeName')} />}
      </FormField>
      {watch('volumeName')?.trim() && (
        <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted sm:col-span-2" aria-live="polite">
          Certificate line: <span className="font-medium text-ink">“Published in {watch('volumeName').trim()}”</span>
        </p>
      )}
      <FormField label="Sponsored by" error={errors.sponsoredBy?.message} className="sm:col-span-2">{(a) => <input {...a} className="input" placeholder="Name of the sponsor" {...register('sponsoredBy')} />}</FormField>
      <FormField label="Contact email" error={errors.contactEmail?.message}>{(a) => <input {...a} type="email" className="input" placeholder="conference@university.edu" {...register('contactEmail')} />}</FormField>
      <FormField label="Contact phone" error={errors.contactPhone?.message}>{(a) => <input {...a} type="tel" className="input" placeholder="+91 98765 43210" {...register('contactPhone')} />}</FormField>
      <FormField label="Submission deadline" required error={errors.submissionDeadline?.message}>{(a) => <input {...a} type="date" className="input" {...register('submissionDeadline')} />}</FormField>
      <FormField label="Camera-ready deadline" required error={errors.cameraReadyDeadline?.message}>{(a) => <input {...a} type="date" className="input" {...register('cameraReadyDeadline')} />}</FormField>
      <div className="rounded-lg border border-line p-4 sm:col-span-2">
        <Switch checked={apcOn} onChange={setApc} label="Charge an article processing fee (APC) for this conference" description="Leave off if participation is covered by the organiser. The journal's standard APC applies otherwise." />
        {apcOn && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField label="Currency">{(a) => <select {...a} className="input" {...register('apcCurrency')}><option value="INR">INR (₹) — Indian authors, GST applies</option><option value="USD">USD ($) — foreign authors, no GST</option></select>}</FormField>
            <FormField label="Amount (before tax)" required error={errors.apcAmount?.message}>{(a) => <input {...a} type="number" min={0} step="0.01" className="input" {...register('apcAmount', { valueAsNumber: true })} />}</FormField>
            {gst && (
              <p className="text-sm text-muted sm:col-span-2" aria-live="polite">
                {gst.currency === 'INR'
                  ? <>Author pays <strong className="text-ink">{formatMoney(gst.total, 'INR')}</strong> = {formatMoney(gst.base, 'INR')} + 18% GST ({formatMoney(gst.igst, 'INR')}). Billed as CGST 9% + SGST 9% within Gujarat, otherwise IGST 18%.</>
                  : <>Author pays <strong className="text-ink">{formatMoney(gst.total, 'USD')}</strong>. {gst.note}.</>}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
