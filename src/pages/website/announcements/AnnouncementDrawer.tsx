import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Drawer, ConfirmDialog } from '@/components/Dialog'
import { EmailPreview } from '@/components/EmailPreview'
import { CharCount, FormField, Switch } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { useScopeJournals } from '@/lib/scope'
import { cn } from '@/lib/utils'
import { useJournals } from '@/permissions/hooks'
import { formatDateTime } from '@/shared/formatters'
import type { JournalCode } from '@/shared/types'
import { ANNOUNCEMENT_TYPES, PLACEMENTS, type Announcement } from '@/mock/data/website'
import { createAnnouncements, updateAnnouncement, type AnnouncementInput } from '@/mock/api/announcements'
import { fromLocalInput, toLocalInput } from '../shared'

const makeSchema = (isEdit: boolean) =>
  z
    .object({
      journals: z.array(z.string()),
      title: z.string().trim().min(5, 'Enter a headline of at least 5 characters.').max(120, 'Keep the headline under 120 characters.'),
      body: z.string().trim().min(20, 'Write at least a sentence (20 characters).').max(600, 'Keep the text under 600 characters.'),
      type: z.enum(ANNOUNCEMENT_TYPES),
      placements: z.array(z.enum(['banner', 'topbar', 'page'])).min(1, 'Choose at least one place to show it.'),
      pinned: z.boolean(),
      mode: z.enum(['now', 'schedule']),
      startAt: z.string(),
      hasEnd: z.boolean(),
      endAt: z.string(),
      emailSubscribers: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (!isEdit && v.journals.length === 0) ctx.addIssue({ code: 'custom', path: ['journals'], message: 'Choose at least one journal.' })
      if (v.mode === 'schedule') {
        if (!v.startAt) ctx.addIssue({ code: 'custom', path: ['startAt'], message: 'Choose when it should go live.' })
        else if (!isEdit && new Date(v.startAt).getTime() <= Date.now()) ctx.addIssue({ code: 'custom', path: ['startAt'], message: 'Choose a time in the future, or switch to Publish now.' })
      }
      if (v.hasEnd) {
        if (!v.endAt) ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'Choose when it should come down.' })
        else {
          const start = v.mode === 'now' ? Date.now() : new Date(v.startAt).getTime()
          if (new Date(v.endAt).getTime() <= start) ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'The end must be after the start.' })
        }
      }
    })

type Values = z.infer<ReturnType<typeof makeSchema>>

export function AnnouncementDrawer({ open, onClose, announcement, onSaved }: { open: boolean; onClose: () => void; announcement?: Announcement; onSaved: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} title={announcement ? 'Edit announcement' : 'New announcement'} width={600}>
      {open && <Body key={announcement?.id ?? 'new'} announcement={announcement} onClose={onClose} onSaved={onSaved} />}
    </Drawer>
  )
}

function Body({ announcement, onClose, onSaved }: { announcement?: Announcement; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!announcement
  const allowed = useJournals()
  const scope = useScopeJournals()
  const schema = useMemo(() => makeSchema(isEdit), [isEdit])
  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: announcement
      ? { journals: [announcement.journal], title: announcement.title, body: announcement.body, type: announcement.type, placements: announcement.placements, pinned: announcement.pinned, mode: 'schedule', startAt: toLocalInput(announcement.startAt), hasEnd: !!announcement.endAt, endAt: announcement.endAt ? toLocalInput(announcement.endAt) : '', emailSubscribers: announcement.emailSubscribers }
      : { journals: scope.length === 1 ? scope : [], title: '', body: '', type: 'News', placements: ['page'], pinned: false, mode: 'now', startAt: '', hasEnd: false, endAt: '', emailSubscribers: false },
  })
  const v = watch()
  const [pending, setPending] = useState<Values | null>(null)

  const toInput = (x: Values): AnnouncementInput => ({
    title: x.title.trim(), body: x.body.trim(), type: x.type, placements: x.placements, pinned: x.pinned,
    startAt: x.mode === 'now' ? new Date().toISOString() : fromLocalInput(x.startAt),
    endAt: x.hasEnd ? fromLocalInput(x.endAt) : undefined, emailSubscribers: x.emailSubscribers,
  })

  const perform = async (x: Values) => {
    try {
      if (announcement) {
        await updateAnnouncement(announcement.id, toInput(x))
        toast.success('Announcement updated.')
      } else {
        const made = await createAnnouncements(x.journals as JournalCode[], toInput(x))
        const names = x.journals.join(' and ')
        toast.success(x.mode === 'schedule' ? `Scheduled for ${names}: ${made.length} ${made.length === 1 ? 'announcement' : 'announcements'} created.` : `Published to ${names}.`)
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const submit = handleSubmit((x) => (isEdit && announcement && new Date(announcement.startAt) <= new Date() ? perform(x) : setPending(x)))

  const toggleIn = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])
  const journalsLabel = v.journals.length ? v.journals.join(', ') : 'selected journals'
  const live = !isEdit && v.mode === 'now'

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {isEdit ? (
        <p className="text-sm text-muted">Journal: <span className="font-medium text-ink">{announcement.journal}</span>. Posts made to several journals are separate records, so each is edited on its own.</p>
      ) : (
        <fieldset>
          <legend className="label">Post to {allowed.length > 1 ? 'journals' : 'journal'} <span className="text-red-600" aria-hidden>*</span></legend>
          <div className="flex flex-wrap gap-2">
            <Controller control={control} name="journals" render={({ field }) => (
              <>
                {allowed.map((j) => (
                  <label key={j} className={cn('inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium', field.value.includes(j) ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-subtle')}>
                    <input type="checkbox" className="accent-indigo-600" checked={field.value.includes(j)} onChange={() => field.onChange(toggleIn(field.value, j))} /> {j}
                  </label>
                ))}
                {allowed.length > 1 && <button type="button" className="btn-ghost h-8" onClick={() => field.onChange(field.value.length === allowed.length ? [] : [...allowed])}>{field.value.length === allowed.length ? 'Clear' : 'Select all'}</button>}
              </>
            )} />
          </div>
          {errors.journals && <p role="alert" className="mt-1 text-xs text-red-600">{errors.journals.message}</p>}
          {v.journals.length > 1 && <p className="mt-1 text-xs text-muted">One announcement is created for each of the {v.journals.length} journals. Each can be edited or ended separately afterwards.</p>}
        </fieldset>
      )}

      <FormField label="Type" required>{(a) => <select {...a} {...register('type')} className="input">{ANNOUNCEMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>}</FormField>
      <FormField label="Headline" required error={errors.title?.message}>
        {(a) => <div><input {...a} {...register('title')} className="input" placeholder="Call for papers: Volume 4, Issue 1" /><div className="mt-1 text-right"><CharCount value={v.title} max={120} /></div></div>}
      </FormField>
      <FormField label="Text" required error={errors.body?.message}>
        {(a) => <div><textarea {...a} {...register('body')} rows={4} className="input !h-auto py-2" /><div className="mt-1 text-right"><CharCount value={v.body} max={600} /></div></div>}
      </FormField>

      <fieldset>
        <legend className="label">Show on <span className="text-red-600" aria-hidden>*</span></legend>
        <Controller control={control} name="placements" render={({ field }) => (
          <div className="flex flex-wrap gap-2">
            {PLACEMENTS.map((p) => (
              <label key={p.id} className={cn('inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm', field.value.includes(p.id) ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-subtle')}>
                <input type="checkbox" className="accent-indigo-600" checked={field.value.includes(p.id)} onChange={() => field.onChange(toggleIn(field.value, p.id))} /> {p.label}
              </label>
            ))}
          </div>
        )} />
        {errors.placements && <p role="alert" className="mt-1 text-xs text-red-600">{errors.placements.message}</p>}
      </fieldset>

      <Switch label="Pin to the top" description="Pinned announcements stay above newer ones on the website." checked={v.pinned} onChange={(x) => setValue('pinned', x, { shouldDirty: true })} />

      <fieldset className="space-y-3 rounded-lg border border-line p-3">
        <legend className="px-1 text-xs font-medium text-muted">Timing</legend>
        {!isEdit && (
          <div role="radiogroup" aria-label="When to publish" className="flex gap-4 text-sm">
            {([['now', 'Publish now'], ['schedule', 'Schedule for later']] as const).map(([val, label]) => (
              <label key={val} className="inline-flex cursor-pointer items-center gap-2"><input type="radio" className="accent-indigo-600" checked={v.mode === val} onChange={() => setValue('mode', val, { shouldDirty: true })} /> {label}</label>
            ))}
          </div>
        )}
        {(v.mode === 'schedule' || isEdit) && (
          <FormField label={isEdit ? 'Start date and time' : 'Go live on'} required error={errors.startAt?.message} hint="Times are in your browser's time zone.">
            {(a) => <input {...a} type="datetime-local" {...register('startAt')} className="input" />}
          </FormField>
        )}
        <Switch label="Set an end date" description="It is taken down automatically and shown as Expired." checked={v.hasEnd} onChange={(x) => setValue('hasEnd', x, { shouldDirty: true })} />
        {v.hasEnd && <FormField label="Take down on" required error={errors.endAt?.message}>{(a) => <input {...a} type="datetime-local" {...register('endAt')} className="input" />}</FormField>}
      </fieldset>

      <Switch label="Also email to subscribers" description="Sends one email to each selected journal's subscriber list when it goes live." checked={v.emailSubscribers} onChange={(x) => setValue('emailSubscribers', x, { shouldDirty: true })} />
      {v.emailSubscribers && (
        <EmailPreview to={`${journalsLabel} subscribers`} subject={`[${v.journals[0] ?? announcement?.journal ?? 'Journal'}] ${v.title || 'Announcement headline'}`}
          body={`Dear reader,\n\n${v.body || 'Your announcement text appears here.'}\n\n${v.type === 'Call for Papers' || v.type === 'Special Issue' ? 'Read the full details and submit your manuscript on our website.' : 'Visit our website for the latest news.'}\n\nWith regards,\nEditorial Office`} />
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-line bg-surface px-5 py-3">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : v.mode === 'schedule' ? 'Schedule' : 'Publish now'}</button>
      </div>

      <ConfirmDialog open={!!pending} onClose={() => setPending(null)} confirmLabel={pending?.mode === 'schedule' ? 'Schedule' : isEdit ? 'Save' : 'Publish now'}
        title={pending?.mode === 'schedule' && !isEdit ? 'Schedule this announcement?' : isEdit ? 'Save changes to a scheduled announcement?' : 'Publish this announcement now?'}
        consequences={[
          live || pending?.mode === 'now' ? `Show it immediately on ${pending?.journals.join(', ')} (${pending?.placements.map((p) => PLACEMENTS.find((x) => x.id === p)?.label).join(', ')})` : `Go live on ${pending?.startAt ? formatDateTime(fromLocalInput(pending.startAt)) : ''} for ${pending?.journals.join(', ')}`,
          pending && pending.journals.length > 1 ? `Create ${pending.journals.length} announcement records, one per journal` : 'Create one announcement record',
          ...(pending?.emailSubscribers ? [`Email each journal's subscribers when it goes live`] : []),
          'Record the change in the audit log',
        ]}
        onConfirm={() => pending && perform(pending)} />
    </form>
  )
}
