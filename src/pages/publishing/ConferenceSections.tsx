import { useState } from 'react'
import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister, type UseFormWatch } from 'react-hook-form'
import { Plus, Trash2, UserRound } from 'lucide-react'
import { SectionCard } from '@/components/Card'
import { CharCount, FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { saveConferenceMedia, type ConferenceMedia } from '@/mock/api/conferences'
import type { Conference } from '@/mock/data/publishing'
import type { FileRef } from '@/shared/types'
import type { ConferenceFormValues } from './conferenceForm'
import { DOC_ACCEPT, FileField, IMAGE_ACCEPT, PDF_ACCEPT, PhotosField, RichTextField } from './fields'

interface FormProps {
  control: Control<ConferenceFormValues>
  register: UseFormRegister<ConferenceFormValues>
  errors: FieldErrors<ConferenceFormValues>
  watch: UseFormWatch<ConferenceFormValues>
  disabled: boolean
}

/** Names and designations shown for the conference's key members. */
export function KeyMembersCard({ control, register, errors, disabled }: Omit<FormProps, 'watch'>) {
  const { fields, append, remove } = useFieldArray({ control, name: 'keyMembers' })
  return (
    <SectionCard title="Key members"
      action={<button type="button" className="btn-secondary" disabled={disabled} onClick={() => append({ name: '', designation: '' })}><Plus size={15} strokeWidth={1.5} aria-hidden /> Add member</button>}>
      {fields.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-faint"><UserRound size={20} strokeWidth={1.5} /></span>
          <p className="text-sm font-medium">No key members yet</p>
          <p className="max-w-sm text-sm text-muted">Add the chairs, patrons and committee heads with their designations. They are listed on the conference page.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {fields.map((f, i) => (
            <li key={f.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
              <FormField label={`Member ${i + 1} name`} error={errors.keyMembers?.[i]?.name?.message}>
                {(a) => <input {...a} className="input" placeholder="Prof. Anita Deshmukh" disabled={disabled} {...register(`keyMembers.${i}.name`)} />}
              </FormField>
              <FormField label="Designation" error={errors.keyMembers?.[i]?.designation?.message}>
                {(a) => <input {...a} className="input" placeholder="Conference Chair, Dean of Engineering" disabled={disabled} {...register(`keyMembers.${i}.designation`)} />}
              </FormField>
              <button type="button" className="btn-ghost !h-9 !w-9 !px-0 sm:mt-5" aria-label={`Remove member ${i + 1}`} disabled={disabled} onClick={() => remove(i)}><Trash2 size={16} strokeWidth={1.5} /></button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

/** Conference highlights (plain text) and the editorial note (formatted text). */
export function HighlightsNoteCard({ control, register, errors, watch, disabled }: FormProps) {
  return (
    <SectionCard title="Highlights and editorial note">
      <div className="space-y-5">
        <FormField label="Conference highlights" error={errors.highlights?.message} hint="A short description of what made the conference notable: keynotes, tracks, attendance, awards.">
          {(a) => (
            <>
              <textarea {...a} rows={4} maxLength={2000} className="input !h-auto py-2" disabled={disabled} {...register('highlights')} />
              <div className="mt-1 text-right"><CharCount value={watch('highlights') ?? ''} max={2000} /></div>
            </>
          )}
        </FormField>
        <Controller control={control} name="editorialNote" render={({ field }) => (
          <RichTextField label="Editorial note" value={field.value ?? ''} onChange={field.onChange} disabled={disabled} max={5000} error={errors.editorialNote?.message} />
        )} />
      </div>
    </SectionCard>
  )
}

/**
 * Cover page, proceedings book, brochure, photos and manuscript template. Saved as soon as a file is added,
 * and still editable after the proceedings are published.
 */
export function MediaCard({ conference, canEdit, onSaved }: { conference: Conference; canEdit: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const save = async (key: keyof ConferenceMedia, value: FileRef | FileRef[] | null, label: string) => {
    setBusy(key)
    try {
      await saveConferenceMedia(conference.id, { [key]: key === 'photos' ? value ?? [] : value ?? undefined } as Partial<ConferenceMedia>, label)
      toast.success(`${label} saved`)
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const cover = conference.coverPage
  return (
    <SectionCard title="Files and photos">
      <p className="mb-3 text-sm text-muted">Saved as soon as you upload, and editable even after the proceedings are published.</p>
      <div className="space-y-3">
        <div className="rounded-lg border border-line p-3">
          <div className="flex gap-3">
            <div className="flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-subtle">
              {cover?.data ? <img src={cover.data} alt="Proceedings cover page preview" className="h-full w-full object-cover" /> : <span className="px-1 text-center text-[11px] text-muted">{cover ? cover.name : 'No cover'}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <FileField label="Cover page" value={cover} disabled={!canEdit} busy={busy === 'coverPage'} {...IMAGE_ACCEPT} maxMb={5}
                hint="The proceedings cover shown on the conference page. PNG, JPG or WebP up to 5 MB." onChange={(f) => save('coverPage', f, 'Cover page')} />
            </div>
          </div>
        </div>
        <FileField label="Proceedings book" value={conference.proceedingsBook} disabled={!canEdit} busy={busy === 'proceedingsBook'} {...PDF_ACCEPT} maxMb={50}
          hint="The full proceedings as a PDF, offered as a download. Up to 50 MB." onChange={(f) => save('proceedingsBook', f, 'Proceedings book')} />
        <FileField label="Conference brochure" value={conference.brochure} disabled={!canEdit} busy={busy === 'brochure'}
          accept={/\.(pdf|png|jpe?g|webp)$|application\/pdf|^image\//i} acceptAttr=".pdf,image/png,image/jpeg,image/webp" what="a PDF or image" maxMb={25}
          hint="Displayed on the conference page with a download option. PDF or image up to 25 MB." onChange={(f) => save('brochure', f, 'Conference brochure')} />
        <PhotosField label="Conference photos" value={conference.photos ?? []} disabled={!canEdit} onChange={(v) => save('photos', v, 'Conference photos')} />
        <FileField label="Manuscript template" value={conference.manuscriptTemplate} disabled={!canEdit} busy={busy === 'manuscriptTemplate'} {...DOC_ACCEPT} maxMb={10}
          hint="DOC or DOCX template authors download before submitting. Up to 10 MB." onChange={(f) => save('manuscriptTemplate', f, 'Manuscript template')} />
      </div>
    </SectionCard>
  )
}
