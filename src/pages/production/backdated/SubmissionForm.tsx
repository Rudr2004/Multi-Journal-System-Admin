import { useRef, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type Control, type FieldErrors, type UseFormSetValue } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Download, FileText, Plus, Send, Trash2, Upload, UserPlus, X } from 'lucide-react'
import { FormField } from '@/components/Form'
import { Badge } from '@/components/Badges'
import { ConfirmDialog } from '@/components/Dialog'
import { toast } from '@/components/Toasts'
import { UserAvatar } from '@/components/UserAvatar'
import { Skeleton } from '@/components/States'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import { formatDate } from '@/shared/formatters'
import type { FileRef, Issue, Paper } from '@/shared/types'
import { FileField, IMAGE_ACCEPT, PDF_ACCEPT, downloadFileRef, formatBytes, readFileRef } from '@/pages/publishing/fields'
import { getBackdatedSubmission, nextBackdatedSeq, submitBackdatedSubmission, type BackdatedSubmitResult } from '@/mock/api/production'
import { ARTICLE_TYPES, COUNTRIES, COUNTRY_CODES, DECLARATIONS, SUBJECT_AREAS, branchesFor } from '@/mock/data/backdatedOptions'
import { CONFERENCES } from '@/mock/data/editorial'
import { backdatedId } from '@/shared/paperId'
import { IssueVsOnline } from '../shared'
import { SjifForIssue } from '../SjifForIssue'
import { ABSTRACT_MAX, ABSTRACT_MIN, STEP_FIELDS, submissionSchema, toFormValues, wordCount, type SubmissionValues } from './schema'

const STEPS = ['Article details', 'Authors', 'Mentor & referral', 'Files & declarations', 'Article ID & submit'] as const

const MANUSCRIPT_ACCEPT = {
  accept: /\.(docx?|pdf)$|msword|wordprocessingml|application\/pdf/i,
  acceptAttr: `${PDF_ACCEPT.acceptAttr},.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  what: 'a DOC, DOCX or PDF file',
}
const SUPPLEMENTARY_ACCEPT = /\.(pdf|docx?|xlsx?|csv|zip|png|jpe?g)$/i
const NEW_AUTHOR = { name: '', email: '', phoneCode: '+91', phone: '', country: 'India', affiliation: '', orcid: '', photo: null, corresponding: false }

/** Loads the paper's saved/original submission, then renders the form once. */
export function SubmissionForm({ paper, issue, onDone, onCancel }: { paper: Paper; issue: Issue; onDone: (r: BackdatedSubmitResult) => void; onCancel: () => void }) {
  const q = useAsync(() => getBackdatedSubmission(paper.id), [paper.id])
  if (q.loading || !q.data) {
    return (
      <div className="card space-y-3 p-5" aria-busy="true" aria-label="Loading the submission">
        <Skeleton className="h-6 w-56" /><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-40" />
      </div>
    )
  }
  const defaults = toFormValues(q.data, paper.articleType, paper.title)
  return <FormBody key={paper.id} paper={paper} issue={issue} defaults={defaults} onDone={onDone} onCancel={onCancel} />
}

function FormBody({ paper, issue, defaults, onDone, onCancel }: { paper: Paper; issue: Issue; defaults: SubmissionValues; onDone: (r: BackdatedSubmitResult) => void; onCancel: () => void }) {
  const [step, setStep] = useState(0)
  const [pending, setPending] = useState<SubmissionValues | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const form = useForm<SubmissionValues>({ resolver: zodResolver(submissionSchema), defaultValues: defaults, mode: 'onTouched' })
  const { register, control, handleSubmit, trigger, setValue, getValues, formState: { errors, isDirty } } = form
  useUnsavedChanges(isDirty && !saved)

  const subject = useWatch({ control, name: 'subject' })
  const generateId = useWatch({ control, name: 'generateId' })
  const seq = nextBackdatedSeq(paper.journal)
  const newId = backdatedId(paper.journal, issue.volume, issue.number, seq)
  const branches = branchesFor(subject)

  const next = async () => {
    const ok = await trigger(STEP_FIELDS[step])
    if (ok) setStep((s) => Math.min(STEPS.length - 1, s + 1))
    else toast.error('Fix the highlighted fields to continue.')
  }
  const onInvalid = (errs: FieldErrors<SubmissionValues>) => {
    const bad = Object.keys(errs)
    const target = Object.entries(STEP_FIELDS).find(([, keys]) => keys.some((k) => bad.includes(k)))
    if (target) setStep(Number(target[0]))
    toast.error('Some details need attention before the article can be submitted.')
  }
  const submit = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const { articleType, title, generateId: gen, reason, mentorOpen, mentor, ...rest } = pending
      const result = await submitBackdatedSubmission({
        paperId: paper.id, issueId: issue.id, articleType, title, generateId: gen, reason,
        form: {
          subject: rest.subject, branch: rest.branch, abstract: rest.abstract, keywords: rest.keywords, mentor: mentorOpen ? mentor : undefined, referralCode: rest.referralCode.toUpperCase(),
          conference: rest.conference, manuscript: rest.manuscript, previousManuscripts: rest.previousManuscripts, supplementary: rest.supplementary, copyright: rest.copyright,
          declarations: rest.declarations, authors: rest.authors.map((a) => ({ ...a })),
        },
      })
      setSaved(true)
      setPending(null)
      toast.success(`${result.item.finalId} submitted under ${issue.label}.`)
      onDone(result)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit the article.')
    } finally {
      setBusy(false)
    }
  }

  const err = (m?: { message?: string }) => m?.message

  return (
    <form noValidate className="card" onSubmit={handleSubmit((v) => setPending(v), onInvalid)} aria-label={`Edit the submission of ${paper.id}`}>
      <ol className="grid grid-cols-2 gap-1 border-b border-line p-3 sm:grid-cols-5" aria-label="Form sections">
        {STEPS.map((s, i) => (
          <li key={s} className="min-w-0">
            <button type="button" aria-current={i === step ? 'step' : undefined} onClick={() => (i <= step ? setStep(i) : void next())} className="block w-full min-w-0 text-left">
              <div className={cn('h-1 rounded-full', i <= step ? 'bg-accent' : 'bg-slate-200')} />
              <p className={cn('mt-1.5 flex items-center gap-1 truncate text-xs', i === step ? 'font-semibold text-ink' : 'text-muted')}>
                {i < step ? <Check size={12} className="text-accent" aria-hidden /> : <span className="tabular-nums">{i + 1}.</span>}<span className="truncate">{s}</span>
              </p>
            </button>
          </li>
        ))}
      </ol>

      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
          <span className="whitespace-nowrap font-medium">{paper.id}</span><span className="text-muted">will be filed under</span><span className="font-medium">{issue.label}</span>
          <span className="text-muted">· published {formatDate(issue.publicationDate)}</span>
        </div>

        {/* 1. Article details */}
        <section hidden={step !== 0} aria-label="Article details" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Article type" required error={err(errors.articleType)}>
              {(a) => <select {...a} className="input" {...register('articleType')}>{ARTICLE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>}
            </FormField>
            <FormField label="Subject area" required error={err(errors.subject)}>
              {(a) => (
                <select {...a} className="input" {...register('subject', { onChange: () => setValue('branch', '', { shouldDirty: true }) })}>
                  <option value="">Select a subject area…</option>
                  {SUBJECT_AREAS.map((s) => <option key={s}>{s}</option>)}
                </select>
              )}
            </FormField>
          </div>
          {branches.length > 0 && (
            <FormField label="Branch" required error={err(errors.branch)} hint={`Branches within ${subject}.`}>
              {(a) => (
                <select {...a} className="input sm:max-w-md" {...register('branch')}>
                  <option value="">Select a branch…</option>
                  {branches.map((b) => <option key={b}>{b}</option>)}
                </select>
              )}
            </FormField>
          )}
          <FormField label="Title" required error={err(errors.title)}>
            {(a) => <textarea {...a} rows={2} className="input !h-auto py-2" {...register('title')} />}
          </FormField>
          <AbstractField control={control} error={err(errors.abstract)} register={register} />
          <Controller control={control} name="keywords" render={({ field }) => <KeywordsInput value={field.value} onChange={field.onChange} error={err(errors.keywords)} />} />
        </section>

        {/* 2. Authors */}
        <section hidden={step !== 1} aria-label="Authors" className="space-y-4">
          <AuthorsSection control={control} errors={errors} register={register} setValue={setValue} getValues={getValues} />
        </section>

        {/* 3. Mentor, referral, conference */}
        <section hidden={step !== 2} aria-label="Mentor, referral and conference" className="space-y-5">
          <MentorSection control={control} errors={errors} register={register} setValue={setValue} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Referral code" error={err(errors.referralCode)} hint="Optional. Credits the person who referred the author.">
              {(a) => <input {...a} className="input uppercase" placeholder="REF-AB1234" {...register('referralCode')} />}
            </FormField>
            <FormField label="Conference" hint="Optional. Only if the paper came from a conference.">
              {(a) => (
                <select {...a} className="input" {...register('conference')}>
                  <option value="">Not from a conference</option>
                  {CONFERENCES.filter((c) => c !== 'None').map((c) => <option key={c}>{c}</option>)}
                </select>
              )}
            </FormField>
          </div>
        </section>

        {/* 4. Files and declarations */}
        <section hidden={step !== 3} aria-label="Files and declarations" className="space-y-5">
          <FilesSection control={control} errors={errors} setValue={setValue} getValues={getValues} register={register} />
        </section>

        {/* 5. Article ID and submit */}
        <section hidden={step !== 4} aria-label="Article ID and submit" className="space-y-4">
          <IssueVsOnline issueDate={issue.publicationDate} />
          <SjifForIssue journal={paper.journal} issueDate={issue.publicationDate} />
          <fieldset className="space-y-2">
            <legend className="label">Article ID</legend>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-sm">
              <input type="radio" className="mt-0.5 accent-indigo-600" checked={!generateId} onChange={() => setValue('generateId', false, { shouldDirty: true })} />
              <span><span className="font-medium">Keep the original Paper ID</span><span className="block font-mono text-xs text-muted">{paper.id}</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-sm">
              <input type="radio" className="mt-0.5 accent-indigo-600" checked={generateId} onChange={() => setValue('generateId', true, { shouldDirty: true })} />
              <span><span className="font-medium">Original ID is unavailable: generate a new one</span>
                <span className="block text-xs text-muted">Next number in the {paper.journal} backdated sequence: <span className="tabular-nums">{seq}</span></span>
                <span className="mt-1 block font-mono text-sm text-ink">{newId}</span></span>
            </label>
          </fieldset>
          <FormField label="Reason for re-submission" required error={err(errors.reason)} hint="Stored on the paper timeline and the audit log.">
            {(a) => <textarea {...a} rows={3} className="input !h-auto py-2" placeholder="e.g. The authors completed the revision after the issue closed; the Editor agreed to place the article in the issue it was first submitted for." {...register('reason')} />}
          </FormField>
          <p className="text-sm text-muted">The article moves to <span className="font-medium text-ink">Submitted</span> under {issue.label}. The Editor then reviews it on the manuscript page and accepts it again; it follows the normal payment and production steps, and Final approval is locked to this issue.</p>
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ArrowLeft size={14} aria-hidden /> Back</button>
          <button type="button" className="btn-ghost" onClick={() => { if (!isDirty || window.confirm('Discard your edits and go back?')) onCancel() }}>Cancel</button>
        </div>
        {step < STEPS.length - 1
          ? <button type="button" className="btn-primary" onClick={() => void next()}>Continue <ArrowRight size={14} aria-hidden /></button>
          : <button type="submit" className="btn-primary" disabled={busy}><Send size={14} aria-hidden /> Submit under {issue.label}</button>}
      </footer>

      <ConfirmDialog open={!!pending} onClose={() => setPending(null)} onConfirm={submit} title={`Submit ${paper.id} under ${issue.label}?`} confirmLabel="Submit article"
        consequences={[
          'Save the edited details, authors, files and declarations on the article.',
          generateId ? `Assign the new ID ${newId} and use number ${seq} of the ${paper.journal} backdated sequence.` : `Keep the Paper ID ${paper.id}.`,
          `Change the status from ${paper.status.replace(/_/g, ' ')} to Submitted and file it under ${issue.label}, shown with the issue date ${formatDate(issue.publicationDate)}.`,
          'The Editor must accept it again on the manuscript page before it can go to production.',
        ]} />
    </form>
  )
}

type Reg = ReturnType<typeof useForm<SubmissionValues>>['register']

function AbstractField({ control, register, error }: { control: Control<SubmissionValues>; register: Reg; error?: string }) {
  const abstract = useWatch({ control, name: 'abstract' })
  const n = wordCount(abstract)
  const bad = n < ABSTRACT_MIN || n > ABSTRACT_MAX
  return (
    <FormField label="Abstract" required error={error} hint={`Between ${ABSTRACT_MIN} and ${ABSTRACT_MAX} words.`}>
      {(a) => (
        <>
          <textarea {...a} rows={9} className="input !h-auto py-2 leading-6" {...register('abstract')} />
          <p className={cn('mt-1 text-right text-xs tabular-nums', bad ? 'text-red-600' : 'text-muted')} aria-live="polite">{n} / {ABSTRACT_MAX} words</p>
        </>
      )}
    </FormField>
  )
}

function KeywordsInput({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const parts = raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return
    const merged = [...value]
    for (const p of parts) if (!merged.some((m) => m.toLowerCase() === p.toLowerCase()) && merged.length < 8) merged.push(p)
    onChange(merged)
    setText('')
  }
  return (
    <FormField label="Keywords" required error={error} hint="Press Enter or comma after each keyword. 3 to 8 keywords.">
      {(a) => (
        <div className={cn('flex flex-wrap gap-1.5 rounded-lg border bg-surface p-2 focus-within:ring-2 focus-within:ring-accent', error ? 'border-red-400' : 'border-line')}>
          {value.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
              {k}
              <button type="button" aria-label={`Remove keyword ${k}`} className="rounded-full hover:bg-indigo-200" onClick={() => onChange(value.filter((x) => x !== k))}><X size={12} aria-hidden /></button>
            </span>
          ))}
          <input {...a} value={text} onChange={(e) => { if (/[,;]$/.test(e.target.value)) add(e.target.value); else setText(e.target.value) }} onBlur={() => add(text)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(text) } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)) }}
            className="min-w-[10rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none" placeholder={value.length ? 'Add another keyword' : 'e.g. supply chain resilience'} />
        </div>
      )}
    </FormField>
  )
}

function AuthorsSection({ control, errors, register, setValue, getValues }: { control: Control<SubmissionValues>; errors: FieldErrors<SubmissionValues>; register: Reg; setValue: UseFormSetValue<SubmissionValues>; getValues: () => SubmissionValues }) {
  const { fields, append, remove, move } = useFieldArray({ control, name: 'authors' })
  const listError = errors.authors?.root?.message ?? errors.authors?.message
  const removeAt = (i: number) => {
    const wasCorresponding = getValues().authors[i]?.corresponding
    remove(i)
    if (wasCorresponding) setTimeout(() => setValue('authors.0.corresponding', true, { shouldDirty: true }), 0)
  }
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">List every author in the order they appear on the article. Exactly one must be the corresponding author.</p>
        <button type="button" className="btn-secondary shrink-0" onClick={() => append(NEW_AUTHOR)} disabled={fields.length >= 12}><UserPlus size={14} aria-hidden /> Add author</button>
      </div>
      {listError && <p role="alert" className="text-sm text-red-600">{listError}</p>}
      <ol className="space-y-4">
        {fields.map((f, i) => {
          const ae = errors.authors?.[i]
          return (
            <li key={f.id} className="rounded-lg border border-line p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">Author {i + 1}</Badge>
                  <Controller control={control} name={`authors.${i}.corresponding`} render={({ field }) => (
                    <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={field.value}
                        onChange={(e) => getValues().authors.forEach((_, k) => setValue(`authors.${k}.corresponding`, k === i && e.target.checked, { shouldDirty: true, shouldValidate: true }))} />
                      Corresponding author
                    </label>
                  )} />
                </div>
                <div className="flex gap-1" role="group" aria-label={`Author ${i + 1} order and removal`}>
                  <button type="button" className="btn-ghost !h-8 !w-8 !px-0" aria-label={`Move author ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={15} aria-hidden /></button>
                  <button type="button" className="btn-ghost !h-8 !w-8 !px-0" aria-label={`Move author ${i + 1} down`} disabled={i === fields.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={15} aria-hidden /></button>
                  <button type="button" className="btn-ghost !h-8 !px-2 text-red-700" aria-label={`Remove author ${i + 1}`} disabled={fields.length === 1} onClick={() => removeAt(i)}><Trash2 size={15} aria-hidden /> Remove</button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Full name" required error={ae?.name?.message}>{(a) => <input {...a} className="input" autoComplete="off" {...register(`authors.${i}.name`)} />}</FormField>
                <FormField label="Email" required error={ae?.email?.message}>{(a) => <input {...a} type="email" className="input" autoComplete="off" {...register(`authors.${i}.email`)} />}</FormField>
                <FormField label="Phone" required error={ae?.phone?.message ?? ae?.phoneCode?.message}>
                  {(a) => (
                    <div className="flex gap-2">
                      <select aria-label={`Author ${i + 1} country code`} className="input !w-36 shrink-0" {...register(`authors.${i}.phoneCode`)}>
                        {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                      <input {...a} type="tel" inputMode="tel" className="input min-w-0 flex-1" {...register(`authors.${i}.phone`)} />
                    </div>
                  )}
                </FormField>
                <FormField label="Country" required error={ae?.country?.message}>
                  {(a) => <select {...a} className="input" {...register(`authors.${i}.country`)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>}
                </FormField>
                <FormField label="Affiliation" required error={ae?.affiliation?.message}>{(a) => <input {...a} className="input" placeholder="Department, institution" {...register(`authors.${i}.affiliation`)} />}</FormField>
                <FormField label="ORCID iD" error={ae?.orcid?.message} hint="Optional. Format 0000-0002-1825-0097.">{(a) => <input {...a} className="input font-mono" placeholder="0000-0000-0000-0000" {...register(`authors.${i}.orcid`)} />}</FormField>
              </div>
              <div className="mt-4">
                <Controller control={control} name={`authors.${i}.photo`} render={({ field }) => <ProfilePhoto name={getValues().authors[i]?.name || `Author ${i + 1}`} value={field.value} onChange={field.onChange} />} />
              </div>
            </li>
          )
        })}
      </ol>
    </>
  )
}

function ProfilePhoto({ name, value, onChange }: { name: string; value: FileRef | null; onChange: (v: FileRef | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const pick = async (file?: File) => {
    if (!file) return
    const ref = await readFileRef(file, IMAGE_ACCEPT.accept, 2, IMAGE_ACCEPT.what)
    if (ref) onChange(ref)
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-subtle p-3">
      <UserAvatar name={name} photo={value?.data} size={56} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Profile photo</p>
        <p className="text-xs text-muted">{value ? `${value.name}${value.size ? ` · ${formatBytes(value.size)}` : ''}` : 'PNG, JPG or WebP, up to 2 MB. Shown on the published article.'}</p>
      </div>
      <input ref={input} type="file" accept={IMAGE_ACCEPT.acceptAttr} className="sr-only" tabIndex={-1} aria-label={`Upload profile photo for ${name}`} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      <button type="button" className="btn-secondary !h-8" onClick={() => input.current?.click()}><Upload size={14} aria-hidden /> {value ? 'Replace' : 'Upload'}</button>
      {value && <button type="button" className="btn-ghost !h-8" onClick={() => onChange(null)}><Trash2 size={14} aria-hidden /> Remove</button>}
    </div>
  )
}

function MentorSection({ control, errors, register, setValue }: { control: Control<SubmissionValues>; errors: FieldErrors<SubmissionValues>; register: Reg; setValue: UseFormSetValue<SubmissionValues> }) {
  const open = useWatch({ control, name: 'mentorOpen' })
  const me = errors.mentor
  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line p-4">
        <div><p className="text-sm font-medium">Mentor</p><p className="text-xs text-muted">No mentor is recorded for this article. Add one if a faculty mentor guided the work.</p></div>
        <button type="button" className="btn-secondary" onClick={() => setValue('mentorOpen', true, { shouldDirty: true })}><Plus size={14} aria-hidden /> Add mentor</button>
      </div>
    )
  }
  return (
    <fieldset className="rounded-lg border border-line p-4">
      <legend className="px-1 text-sm font-medium">Mentor</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Mentor name" required error={me?.name?.message}>{(a) => <input {...a} className="input" {...register('mentor.name')} />}</FormField>
        <FormField label="Mentor email" required error={me?.email?.message}>{(a) => <input {...a} type="email" className="input" {...register('mentor.email')} />}</FormField>
        <FormField label="Mentor phone" required error={me?.phone?.message} hint="Include the country code, e.g. +91 98200 11142.">{(a) => <input {...a} type="tel" className="input" {...register('mentor.phone')} />}</FormField>
        <FormField label="Institution" required error={me?.institution?.message}>{(a) => <input {...a} className="input" {...register('mentor.institution')} />}</FormField>
      </div>
      <button type="button" className="btn-ghost mt-3 text-red-700" onClick={() => { setValue('mentorOpen', false, { shouldDirty: true }); setValue('mentor', { name: '', email: '', phone: '', institution: '' }, { shouldDirty: true }) }}><Trash2 size={14} aria-hidden /> Remove mentor</button>
    </fieldset>
  )
}

function FilesSection({ control, errors, setValue, getValues, register }: { control: Control<SubmissionValues>; errors: FieldErrors<SubmissionValues>; setValue: UseFormSetValue<SubmissionValues>; getValues: () => SubmissionValues; register: Reg }) {
  const previous = useWatch({ control, name: 'previousManuscripts' })
  const current = useWatch({ control, name: 'manuscript' })
  const supplementary = useWatch({ control, name: 'supplementary' })
  const supInput = useRef<HTMLInputElement>(null)
  const de = errors.declarations
  const replaceManuscript = (v: FileRef | null) => {
    const cur = getValues().manuscript
    if (v && cur) setValue('previousManuscripts', [cur, ...getValues().previousManuscripts], { shouldDirty: true })
    setValue('manuscript', v, { shouldDirty: true, shouldValidate: true })
  }
  const addSupplementary = async (files: FileList | null) => {
    if (!files?.length) return
    const added: FileRef[] = []
    for (const f of Array.from(files)) {
      const ref = await readFileRef(f, SUPPLEMENTARY_ACCEPT, 25, 'a PDF, Word, Excel, CSV, ZIP or image file')
      if (ref) added.push(ref)
    }
    if (added.length) setValue('supplementary', [...getValues().supplementary, ...added], { shouldDirty: true })
  }
  const versionCount = previous.length + (current ? 1 : 0)
  return (
    <>
      <div className="space-y-2">
        <FileField label="Manuscript" value={current} onChange={replaceManuscript} accept={MANUSCRIPT_ACCEPT.accept} acceptAttr={MANUSCRIPT_ACCEPT.acceptAttr} what={MANUSCRIPT_ACCEPT.what} maxMb={25}
          hint="Not uploaded yet. Choose a DOC, DOCX or PDF file, up to 25 MB." />
        {errors.manuscript?.message && <p role="alert" className="text-xs text-red-600">{errors.manuscript.message}</p>}
        {previous.length > 0 && (
          <div className="rounded-lg border border-line p-3">
            <p className="text-xs font-medium text-muted">Earlier versions ({previous.length}). A replaced file stays on record.</p>
            <ul className="mt-2 divide-y divide-line text-sm">
              {previous.map((p, i) => (
                <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate" title={p.name}><span className="mr-2 tabular-nums text-muted">v{versionCount - 1 - i}</span>{p.name}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-muted">{formatDate(p.uploadedAt)}
                    <button type="button" className="btn-ghost !h-7 !px-2" aria-label={`Download ${p.name}`} onClick={() => downloadFileRef(p)}><Download size={13} aria-hidden /></button></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line p-3">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-medium">Supplementary files <span className="text-muted">({supplementary.length})</span></p><p className="text-xs text-muted">Datasets, figures, cover letter and similar. Select several files at once, up to 25 MB each.</p></div>
          <input ref={supInput} type="file" multiple className="sr-only" tabIndex={-1} aria-label="Upload supplementary files" onChange={(e) => { void addSupplementary(e.target.files); e.target.value = '' }} />
          <button type="button" className="btn-secondary !h-8 shrink-0" onClick={() => supInput.current?.click()}><Upload size={14} aria-hidden /> Add files</button>
        </div>
        {supplementary.length > 0 && (
          <ul className="mt-3 divide-y divide-line text-sm">
            {supplementary.map((s, i) => (
              <li key={`${s.name}-${i}`} className="flex items-center justify-between gap-3 py-1.5">
                <span className="flex min-w-0 items-center gap-2"><FileText size={15} className="shrink-0 text-muted" aria-hidden /><span className="truncate" title={s.name}>{s.name}</span><span className="shrink-0 text-xs text-muted">{formatBytes(s.size)}</span></span>
                <span className="flex shrink-0">
                  <button type="button" className="btn-ghost !h-7 !px-2" aria-label={`Download ${s.name}`} onClick={() => downloadFileRef(s)}><Download size={13} aria-hidden /></button>
                  <button type="button" className="btn-ghost !h-7 !px-2" aria-label={`Remove ${s.name}`} onClick={() => setValue('supplementary', getValues().supplementary.filter((_, k) => k !== i), { shouldDirty: true })}><Trash2 size={13} aria-hidden /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Controller control={control} name="copyright" render={({ field }) => (
          <FileField label="Copyright form" value={field.value} onChange={(v) => field.onChange(v)} accept={PDF_ACCEPT.accept} acceptAttr={PDF_ACCEPT.acceptAttr} what={PDF_ACCEPT.what} maxMb={10}
            hint="Not uploaded yet. Choose the signed copyright transfer form as a PDF, up to 10 MB." />
        )} />
        {errors.copyright?.message && <p role="alert" className="text-xs text-red-600">{errors.copyright.message}</p>}
      </div>

      <fieldset className="space-y-2">
        <legend className="label">Declarations</legend>
        {DECLARATIONS.map((d) => (
          <div key={d.key}>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" {...register(`declarations.${d.key}`)} />
              <span>{d.label}</span>
            </label>
            {de?.[d.key]?.message && <p role="alert" className="ml-6 mt-0.5 text-xs text-red-600">{de[d.key]?.message}</p>}
          </div>
        ))}
      </fieldset>
    </>
  )
}

