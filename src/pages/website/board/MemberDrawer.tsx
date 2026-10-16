import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Drawer } from '@/components/Dialog'
import { CharCount, FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import { BOARD_GROUPS, type BoardGroup, type BoardMember } from '@/mock/data/website'
import { saveMember } from '@/mock/api/board'
import type { JournalCode } from '@/shared/types'
import { Avatar } from '../shared'
import { TagInput } from './TagInput'

const isUrl = (v: string) => { try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false } }
const optionalUrl = (msg: string) => z.string().trim().refine((v) => v === '' || isUrl(v), msg)

const memberSchema = z
  .object({
    name: z.string().trim().min(3, 'Enter the full name.').max(80, 'Keep the name under 80 characters.'),
    group: z.enum(BOARD_GROUPS),
    designation: z.string().trim().min(2, 'Enter the designation shown on the website.').max(100, 'Keep it under 100 characters.'),
    affiliation: z.string().trim().min(2, 'Enter the institution.').max(120, 'Keep it under 120 characters.'),
    country: z.string().trim().min(2, 'Enter the country.').max(60),
    bio: z.string().trim().max(600, 'Keep the bio under 600 characters.'),
    orcid: z.string().trim().refine((v) => v === '' || /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(v), 'Use the format 0000-0002-1825-0097.'),
    scholar: optionalUrl('Enter a full link starting with https://'),
    scopus: optionalUrl('Enter a full link starting with https://'),
    researchgate: optionalUrl('Enter a full link starting with https://'),
    linkedin: optionalUrl('Enter a full link starting with https://'),
    website: optionalUrl('Enter a full link starting with https://'),
    termStart: z.string().min(1, 'Choose when the term starts.'),
    termEnd: z.string().min(1, 'Choose when the term ends.'),
  })
  .refine((v) => !v.termStart || !v.termEnd || v.termEnd > v.termStart, { path: ['termEnd'], message: 'The term must end after it starts.' })

type MemberForm = z.infer<typeof memberSchema>

export function MemberDrawer({ open, onClose, journal, member, defaultGroup, onSaved }: {
  open: boolean; onClose: () => void; journal: JournalCode; member?: BoardMember; defaultGroup?: BoardGroup; onSaved: () => void
}) {
  return (
    <Drawer open={open} onClose={onClose} title={member ? `Edit ${member.name}` : 'Add board member'} width={520}>
      {open && <MemberFormBody key={member?.id ?? 'new'} onClose={onClose} journal={journal} member={member} defaultGroup={defaultGroup} onSaved={onSaved} />}
    </Drawer>
  )
}

function MemberFormBody({ onClose, journal, member, defaultGroup, onSaved }: { onClose: () => void; journal: JournalCode; member?: BoardMember; defaultGroup?: BoardGroup; onSaved: () => void }) {
  const year = new Date().getFullYear()
  const { register, handleSubmit, watch, formState: { errors, isSubmitting, isDirty } } = useForm<MemberForm>({
    resolver: zodResolver(memberSchema),
    defaultValues: member
      ? { name: member.name, group: member.group, designation: member.designation, affiliation: member.affiliation, country: member.country, bio: member.bio, orcid: member.orcid, scholar: member.scholar, scopus: member.scopus, researchgate: member.researchgate ?? '', linkedin: member.linkedin ?? '', website: member.website ?? '', termStart: member.termStart, termEnd: member.termEnd }
      : { name: '', group: defaultGroup ?? 'Editorial Board', designation: '', affiliation: '', country: '', bio: '', orcid: '', scholar: '', scopus: '', researchgate: '', linkedin: '', website: '', termStart: `${year}-01-01`, termEnd: `${year + 2}-12-31` },
  })
  const [photo, setPhoto] = useState<string | undefined>(member?.photo)
  const [photoDirty, setPhotoDirty] = useState(false)
  const [expertise, setExpertise] = useState<string[]>(member?.expertise ?? [])
  const expertiseDirty = JSON.stringify(expertise) !== JSON.stringify(member?.expertise ?? [])
  const fileRef = useRef<HTMLInputElement>(null)
  const name = watch('name')

  const pick = (f?: File) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return toast.error('Choose an image file (JPG or PNG).')
    if (f.size > 2 * 1024 * 1024) return toast.error('The photo must be smaller than 2 MB.')
    const r = new FileReader()
    r.onload = () => { setPhoto(String(r.result)); setPhotoDirty(true) }
    r.readAsDataURL(f)
  }

  const submit = handleSubmit(async (v) => {
    try {
      await saveMember({ ...v, id: member?.id, journal, photo, expertise })
      toast.success(member ? `Saved changes to ${v.name}.` : `${v.name} added to the ${journal} board.`)
      onSaved()
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={name || 'New Member'} photo={photo} size={72} />
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Upload photo" onChange={(e) => pick(e.target.files?.[0])} />
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}><ImagePlus size={15} strokeWidth={1.5} aria-hidden /> {photo ? 'Replace photo' : 'Upload photo'}</button>
            {photo && <button type="button" className="btn-ghost" onClick={() => { setPhoto(undefined); setPhotoDirty(true) }}><Trash2 size={15} strokeWidth={1.5} aria-hidden /> Remove</button>}
          </div>
          <p className="mt-1 text-xs text-muted">Square JPG or PNG, up to 2 MB. Initials are shown if there is no photo.</p>
        </div>
      </div>
      <FormField label="Full name" required error={errors.name?.message}>{(a) => <input {...a} {...register('name')} className="input" placeholder="Dr. Meenakshi Raghavan" autoFocus />}</FormField>
      <FormField label="Role group" required error={errors.group?.message}>
        {(a) => <select {...a} {...register('group')} className="input">{BOARD_GROUPS.map((g) => <option key={g}>{g}</option>)}</select>}
      </FormField>
      <FormField label="Designation" required error={errors.designation?.message} hint="Shown under the name on the website.">{(a) => <input {...a} {...register('designation')} className="input" placeholder="Associate Editor" />}</FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Affiliation" required error={errors.affiliation?.message}>{(a) => <input {...a} {...register('affiliation')} className="input" placeholder="University of Madras" />}</FormField>
        <FormField label="Country" required error={errors.country?.message}>{(a) => <input {...a} {...register('country')} className="input" placeholder="India" />}</FormField>
      </div>
      <FormField label="Short bio" error={errors.bio?.message}>
        {(a) => (
          <div>
            <textarea {...a} {...register('bio')} rows={4} className="input !h-auto py-2" />
            <div className="mt-1 text-right"><CharCount value={watch('bio') ?? ''} max={600} /></div>
          </div>
        )}
      </FormField>
      <TagInput label="Area of expertise" value={expertise} onChange={setExpertise} placeholder="e.g. Smart materials, Machine learning" hint="Subjects this member can review or advise on. Type one and press Enter (up to 10)." />
      <fieldset className="space-y-4 rounded-lg border border-line p-3">
        <legend className="px-1 text-xs font-medium text-muted">Profiles</legend>
        <FormField label="ORCID iD" error={errors.orcid?.message}>{(a) => <input {...a} {...register('orcid')} className="input" placeholder="0000-0002-1825-0097" />}</FormField>
        <FormField label="Google Scholar link" error={errors.scholar?.message}>{(a) => <input {...a} {...register('scholar')} className="input" placeholder="https://scholar.google.com/citations?user=…" />}</FormField>
        <FormField label="Scopus link" error={errors.scopus?.message}>{(a) => <input {...a} {...register('scopus')} className="input" placeholder="https://www.scopus.com/authid/detail.uri?authorId=…" />}</FormField>
        <FormField label="ResearchGate profile" error={errors.researchgate?.message}>{(a) => <input {...a} {...register('researchgate')} className="input" placeholder="https://www.researchgate.net/profile/…" />}</FormField>
        <FormField label="LinkedIn profile" error={errors.linkedin?.message}>{(a) => <input {...a} {...register('linkedin')} className="input" placeholder="https://www.linkedin.com/in/…" />}</FormField>
        <FormField label="Personal portfolio / website" error={errors.website?.message}>{(a) => <input {...a} {...register('website')} className="input" placeholder="https://…" />}</FormField>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Term starts" required error={errors.termStart?.message}>{(a) => <input {...a} type="date" {...register('termStart')} className="input" />}</FormField>
        <FormField label="Term ends" required error={errors.termEnd?.message}>{(a) => <input {...a} type="date" {...register('termEnd')} className="input" />}</FormField>
      </div>
      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-line bg-surface px-5 py-3">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting || (!!member && !isDirty && !photoDirty && !expertiseDirty)}>{isSubmitting ? 'Saving…' : member ? 'Save changes' : 'Add member'}</button>
      </div>
    </form>
  )
}
