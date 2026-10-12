import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog } from '@/components/Dialog'
import { CharCount, FormField } from '@/components/Form'
import { toast } from '@/components/Toasts'
import type { JournalCode } from '@/shared/types'
import { AWARD_TYPE_LABEL, type AwardCycle, type AwardType } from '@/mock/data/website'
import { createCycle, updateCycle } from '@/mock/api/awards'

const CRITERIA: Record<AwardType, string> = {
  best_paper: 'Originality of the contribution, methodological rigour, clarity of writing and potential practical impact. Papers must be published in the period and must not carry a correction or retraction notice.',
  best_mentor: 'Authors who mentored the most early-career researchers to publication in the period, with evidence of mentoring (student first authors). Each mentor may win once per calendar year.',
}

const schema = z
  .object({
    journal: z.string().min(1, 'Choose a journal.'),
    type: z.enum(['best_paper', 'best_mentor']),
    name: z.string().trim().min(5, 'Enter a name of at least 5 characters.').max(100, 'Keep the name under 100 characters.'),
    periodStart: z.string().min(1, 'Choose the first day of the period.'),
    periodEnd: z.string().min(1, 'Choose the last day of the period.'),
    criteria: z.string().trim().min(20, 'Describe the selection criteria (at least 20 characters).').max(800, 'Keep the criteria under 800 characters.'),
  })
  .refine((v) => !v.periodStart || !v.periodEnd || v.periodEnd >= v.periodStart, { path: ['periodEnd'], message: 'The period must end on or after it starts.' })
type Values = z.infer<typeof schema>

export function CycleDialog({ journals, cycle, onClose, onDone }: { journals: JournalCode[]; cycle?: AwardCycle; onClose: () => void; onDone: (c?: AwardCycle) => void }) {
  const year = new Date().getFullYear()
  const defaults = useMemo<Values>(() => cycle
    ? { journal: cycle.journal, type: cycle.type, name: cycle.name, periodStart: cycle.periodStart, periodEnd: cycle.periodEnd, criteria: cycle.criteria }
    : { journal: journals[0], type: 'best_paper', name: `${journals[0]} Best Paper ${year}`, periodStart: `${year}-01-01`, periodEnd: `${year}-12-31`, criteria: CRITERIA.best_paper }, [cycle, journals, year])
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults })
  const v = watch()

  const regen = (j: string, t: AwardType) => {
    if (cycle) return
    setValue('name', `${j} ${AWARD_TYPE_LABEL[t]} ${year}`)
    setValue('criteria', CRITERIA[t])
  }

  const submit = handleSubmit(async (x) => {
    try {
      if (cycle) {
        await updateCycle(cycle.id, { name: x.name, periodStart: x.periodStart, periodEnd: x.periodEnd, criteria: x.criteria })
        toast.success('Cycle updated.')
        onDone()
      } else {
        const c = await createCycle({ journal: x.journal as JournalCode, type: x.type, name: x.name, periodStart: x.periodStart, periodEnd: x.periodEnd, criteria: x.criteria })
        toast.success('Award cycle created as a draft.')
        onDone(c)
      }
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <Dialog open onClose={onClose} width={560} title={cycle ? 'Edit award cycle' : 'New award cycle'} description="Eligible papers are listed automatically from the publication period."
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={isSubmitting}>{isSubmitting ? 'Saving…' : cycle ? 'Save changes' : 'Create cycle'}</button>
      </>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {!cycle && (
          <div className="grid gap-4 sm:grid-cols-2">
            {journals.length > 1 && (
              <FormField label="Journal" required error={errors.journal?.message}>
                {(a) => <select {...a} {...register('journal', { onChange: (e) => regen(e.target.value, v.type) })} className="input">{journals.map((j) => <option key={j}>{j}</option>)}</select>}
              </FormField>
            )}
            <FormField label="Award" required>
              {(a) => <select {...a} {...register('type', { onChange: (e) => regen(v.journal, e.target.value as AwardType) })} className="input">{(Object.keys(AWARD_TYPE_LABEL) as AwardType[]).map((t) => <option key={t} value={t}>{AWARD_TYPE_LABEL[t]}</option>)}</select>}
            </FormField>
          </div>
        )}
        <FormField label="Cycle name" required error={errors.name?.message}>{(a) => <input {...a} {...register('name')} className="input" />}</FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Period starts" required error={errors.periodStart?.message}>{(a) => <input {...a} type="date" {...register('periodStart')} className="input" />}</FormField>
          <FormField label="Period ends" required error={errors.periodEnd?.message}>{(a) => <input {...a} type="date" {...register('periodEnd')} className="input" />}</FormField>
        </div>
        <FormField label="Selection criteria" required error={errors.criteria?.message}>
          {(a) => <div><textarea {...a} {...register('criteria')} rows={5} className="input !h-auto py-2" /><div className="mt-1 text-right"><CharCount value={v.criteria} max={800} /></div></div>}
        </FormField>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  )
}
