import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Lock, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { ConfirmDialog } from '@/components/Dialog'
import { Switch } from '@/components/Form'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import type { Channel } from '@/shared/types'
import { saveReminders, saveTimeSlots, setChannelPaused, type TemplateBundle } from '@/mock/api/templates'
import { TEMPLATE_EVENTS, type ReminderSequence, type TimeSlot } from '@/mock/data/communication'
import { CHANNEL_LABEL, ChannelBadge } from './parts'
import { TemplateEditor } from './TemplateEditor'

const CHANNELS: Channel[] = ['email', 'sms', 'whatsapp']

/* ------------------------------ templates tab ------------------------------ */

export function TemplatesTab({ bundle, canEdit, why, onDirty, reload }: { bundle: TemplateBundle; canEdit: boolean; why?: string; onDirty: (d: boolean) => void; reload: () => void }) {
  const [eventKey, setEventKey] = useState(TEMPLATE_EVENTS[0].key)
  const [channel, setChannel] = useState<Channel>('email')
  const dirtyRef = useRef(false)
  const track = useCallback((d: boolean) => { dirtyRef.current = d; onDirty(d) }, [onDirty])
  const guard = () => !dirtyRef.current || window.confirm('You have unsaved changes to this template. Discard them?')

  const event = TEMPLATE_EVENTS.find((e) => e.key === eventKey)!
  const ch = event.channels.includes(channel) ? channel : 'email'
  const template = bundle.templates.find((t) => t.event === eventKey && t.channel === ch)!
  const groups = [...new Set(TEMPLATE_EVENTS.map((e) => e.group))]

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <nav aria-label="Template events" className="card h-fit overflow-hidden">
        {groups.map((g) => (
          <div key={g}>
            <p className="border-b border-line bg-page px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{g}</p>
            {TEMPLATE_EVENTS.filter((e) => e.group === g).map((e) => (
              <button key={e.key} aria-current={e.key === eventKey ? 'true' : undefined}
                onClick={() => { if (e.key !== eventKey && guard()) setEventKey(e.key) }}
                className={cn('flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-b-0', e.key === eventKey ? 'bg-accent-soft font-medium text-accent' : 'hover:bg-subtle')}>
                {e.label}
                <span className="flex gap-0.5 text-[10px] font-semibold text-faint">{e.channels.map((c) => <abbr key={c} title={CHANNEL_LABEL[c]} className="no-underline">{c === 'email' ? 'E' : c === 'sms' ? 'S' : 'W'}</abbr>)}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="card min-w-0 p-4 sm:p-5">
        <div role="group" aria-label="Channel" className="mb-5 inline-flex rounded-lg border border-line p-0.5">
          {CHANNELS.map((c) => {
            const ok = event.channels.includes(c)
            return (
              <button key={c} disabled={!ok} aria-pressed={c === ch} title={ok ? undefined : `${event.label} is not sent by ${CHANNEL_LABEL[c]}`}
                onClick={() => { if (c !== ch && guard()) setChannel(c) }}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40', c === ch ? 'bg-accent text-white' : 'text-muted hover:text-ink')}>
                {CHANNEL_LABEL[c]}
              </button>
            )
          })}
        </div>
        <TemplateEditor key={template.id} template={template} canEdit={canEdit} why={why} onDirty={track} onSaved={reload} />
      </div>
    </div>
  )
}

/* ------------------------------ time slots tab ------------------------------ */

const slotSchema = z.array(z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time, for example 17:30'),
  label: z.string().trim().min(3, 'Give the slot a name (3+ characters)'),
})).superRefine((slots, ctx) => {
  slots.forEach((s, i) => { if (slots.findIndex((x) => x.time === s.time) !== i) ctx.addIssue({ code: 'custom', path: [i, 'time'], message: 'Another slot already uses this time' }) })
})

export function SlotsTab({ initial, canEdit, why, onDirty, reload }: { initial: TimeSlot[]; canEdit: boolean; why?: string; onDirty: (d: boolean) => void; reload: () => void }) {
  const [slots, setSlots] = useState(initial)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(slots) !== JSON.stringify(initial)
  useUnsavedChanges(dirty)
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])

  const res = slotSchema.safeParse(slots)
  const err = (i: number, f: 'time' | 'label') => (res.success ? undefined : res.error.issues.find((x) => x.path[0] === i && x.path[1] === f)?.message)
  const upd = (id: string, p: Partial<TimeSlot>) => setSlots((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const eventsFor = TEMPLATE_EVENTS.filter((e) => e.group === 'Decision' || e.key.endsWith('reminder') || e.key === 'invoice_sent' || e.key === 'certificate_ready' || e.key === 'published_notice')

  const save = async () => {
    if (!res.success) return
    setSaving(true)
    await saveTimeSlots([...slots].sort((a, b) => a.time.localeCompare(b.time)))
    setSaving(false)
    toast.success('Dispatch time slots saved')
    reload()
  }

  return (
    <SectionCard title="Dispatch time slots" action={<Badge tone="neutral">All times IST</Badge>}>
      <p className="mb-4 max-w-2xl text-sm text-muted">Messages are held and released together at these times. The 08:45 slot carries every decision email and cannot be removed or moved; add extra slots for reminders and notices.</p>
      <ul className="space-y-3">
        {slots.map((s, i) => (
          <li key={s.id} className="rounded-lg border border-line p-3">
            <div className="grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-start">
              <div>
                <label htmlFor={`t-${s.id}`} className="label">Time</label>
                <input id={`t-${s.id}`} type="time" className="input" value={s.time} disabled={!canEdit || s.locked} aria-invalid={!!err(i, 'time')} onChange={(e) => upd(s.id, { time: e.target.value })} />
                {err(i, 'time') && <p role="alert" className="mt-1 text-xs text-red-600">{err(i, 'time')}</p>}
              </div>
              <div>
                <label htmlFor={`l-${s.id}`} className="label">Name</label>
                <input id={`l-${s.id}`} className="input" value={s.label} disabled={!canEdit || s.locked} aria-invalid={!!err(i, 'label')} onChange={(e) => upd(s.id, { label: e.target.value })} />
                {err(i, 'label') && <p role="alert" className="mt-1 text-xs text-red-600">{err(i, 'label')}</p>}
              </div>
              <div className="flex items-center gap-3 sm:pt-6">
                {s.locked ? <Badge tone="accent"><Lock size={12} aria-hidden /> Default</Badge> : <Switch label="Enabled" checked={s.enabled} disabled={!canEdit} onChange={(v) => upd(s.id, { enabled: v })} />}
                {!s.locked && (
                  <GuardedButton allowed={canEdit} why={why} className="btn-ghost !px-2" aria-label={`Remove ${s.time} slot`} onClick={() => setSlots((x) => x.filter((y) => y.id !== s.id))}><Trash2 size={16} strokeWidth={1.5} /></GuardedButton>
                )}
              </div>
            </div>
            <fieldset className="mt-3" disabled={!canEdit || s.locked}>
              <legend className="label">Messages sent in this slot</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {eventsFor.map((e) => (
                  <label key={e.key} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" className="accent-indigo-600" checked={s.events.includes(e.key)}
                      onChange={(ev) => upd(s.id, { events: ev.target.checked ? [...s.events, e.key] : s.events.filter((k) => k !== e.key) })} />
                    {e.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <GuardedButton allowed={canEdit} why={why} className="btn-secondary" onClick={() => setSlots((s) => [...s, { id: `slot-${Date.now().toString(36)}`, time: '12:00', label: 'New slot', enabled: true, events: [] }])}>
          <Plus size={15} strokeWidth={1.5} aria-hidden /> Add time slot
        </GuardedButton>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs font-medium text-amber-700">Unsaved changes</span>}
          <button className="btn-secondary" disabled={!dirty || saving} onClick={() => setSlots(initial)}>Discard</button>
          <GuardedButton allowed={canEdit} why={why} className="btn-primary" disabled={!dirty || !res.success || saving} onClick={save}>{saving ? 'Saving…' : 'Save slots'}</GuardedButton>
        </div>
      </div>
    </SectionCard>
  )
}

/* ------------------------------ reminders tab ------------------------------ */

export function RemindersTab({ initial, canEdit, why, onDirty, reload }: { initial: ReminderSequence[]; canEdit: boolean; why?: string; onDirty: (d: boolean) => void; reload: () => void }) {
  const [seqs, setSeqs] = useState(initial)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(seqs) !== JSON.stringify(initial)
  useUnsavedChanges(dirty)
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])

  const updSeq = (id: string, fn: (s: ReminderSequence) => ReminderSequence) => setSeqs((x) => x.map((s) => (s.id === id ? fn(s) : s)))
  const stepError = (s: ReminderSequence, i: number): string | undefined => {
    const st = s.steps[i]
    if (!Number.isInteger(st.afterDays) || st.afterDays < 1 || st.afterDays > 60) return 'Enter whole days between 1 and 60'
    if (s.steps.findIndex((x) => x.afterDays === st.afterDays) !== i) return 'Duplicate day'
    if (st.channels.length === 0) return 'Pick at least one channel'
    return undefined
  }
  const invalid = seqs.some((s) => s.enabled && s.steps.some((_, i) => stepError(s, i)))

  const save = async () => {
    setSaving(true)
    await saveReminders(seqs.map((s) => ({ ...s, steps: [...s.steps].sort((a, b) => a.afterDays - b.afterDays) })))
    setSaving(false)
    toast.success('Reminder sequences saved')
    reload()
  }

  return (
    <div className="space-y-4">
      {seqs.map((s) => {
        const ev = TEMPLATE_EVENTS.find((e) => e.key === s.templateEvent)
        return (
          <SectionCard key={s.id} title={s.name} action={<div className="w-44"><Switch label={s.enabled ? 'Active' : 'Off'} checked={s.enabled} disabled={!canEdit} onChange={(v) => updSeq(s.id, (x) => ({ ...x, enabled: v }))} /></div>}>
            <p className="text-sm text-muted">{s.trigger}. Uses the “{ev?.label}” template. {s.stopOn}</p>
            <ol className={cn('mt-3 space-y-2', !s.enabled && 'opacity-60')}>
              {s.steps.map((st, i) => {
                const e = stepError(s, i)
                return (
                  <li key={st.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-lg border border-line p-3">
                    <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-subtle text-xs font-semibold">{i + 1}</span>
                    <div>
                      <label htmlFor={`d-${st.id}`} className="label">After (days)</label>
                      <input id={`d-${st.id}`} type="number" min={1} max={60} className="input !w-24" value={Number.isNaN(st.afterDays) ? '' : st.afterDays} disabled={!canEdit} aria-invalid={!!e}
                        onChange={(ev) => updSeq(s.id, (x) => ({ ...x, steps: x.steps.map((y) => (y.id === st.id ? { ...y, afterDays: ev.target.value === '' ? NaN : Number(ev.target.value) } : y)) }))} />
                      {e && <p role="alert" className="mt-1 text-xs text-red-600">{e}</p>}
                    </div>
                    <fieldset disabled={!canEdit}>
                      <legend className="label">Send via</legend>
                      <div className="flex gap-3 pt-1.5">
                        {CHANNELS.filter((c) => ev?.channels.includes(c)).map((c) => (
                          <label key={c} className="flex items-center gap-1.5 text-sm">
                            <input type="checkbox" className="accent-indigo-600" checked={st.channels.includes(c)}
                              onChange={(x) => updSeq(s.id, (q) => ({ ...q, steps: q.steps.map((y) => (y.id === st.id ? { ...y, channels: x.target.checked ? [...y.channels, c] : y.channels.filter((k) => k !== c) } : y)) }))} />
                            {CHANNEL_LABEL[c]}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <GuardedButton allowed={canEdit} why={why} className="btn-ghost ml-auto !px-2" aria-label={`Remove step ${i + 1} of ${s.name}`} disabled={s.steps.length <= 1}
                      onClick={() => updSeq(s.id, (x) => ({ ...x, steps: x.steps.filter((y) => y.id !== st.id) }))}><Trash2 size={16} strokeWidth={1.5} /></GuardedButton>
                  </li>
                )
              })}
            </ol>
            <GuardedButton allowed={canEdit} why={why} className="btn-secondary mt-3"
              onClick={() => updSeq(s.id, (x) => ({ ...x, steps: [...x.steps, { id: `st-${Date.now().toString(36)}`, afterDays: Math.max(0, ...x.steps.map((y) => y.afterDays || 0)) + 3, channels: ['email'] }] }))}>
              <Plus size={15} strokeWidth={1.5} aria-hidden /> Add reminder
            </GuardedButton>
          </SectionCard>
        )
      })}
      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs font-medium text-amber-700">Unsaved changes</span>}
        <button className="btn-secondary" disabled={!dirty || saving} onClick={() => setSeqs(initial)}>Discard</button>
        <GuardedButton allowed={canEdit} why={why} className="btn-primary" disabled={!dirty || invalid || saving} onClick={save}>{saving ? 'Saving…' : 'Save sequences'}</GuardedButton>
      </div>
    </div>
  )
}

/* ------------------------------ pause tab ------------------------------ */

export function PauseTab({ paused, canEdit, why, reload }: { paused: Record<Channel, boolean>; canEdit: boolean; why?: string; reload: () => void }) {
  const [confirm, setConfirm] = useState<Channel | null>(null)
  const [busy, setBusy] = useState(false)
  const toggle = async (c: Channel, pause: boolean) => {
    setBusy(true)
    await setChannelPaused(c, pause)
    setBusy(false)
    toast.success(pause ? `${CHANNEL_LABEL[c]} sending paused` : `${CHANNEL_LABEL[c]} sending resumed`)
    reload()
  }
  const copy: Record<Channel, string> = {
    email: 'Decision emails, invoices, certificates and reminders',
    sms: 'DLT-approved transactional and reminder SMS',
    whatsapp: 'Approved WhatsApp notices and inbox replies',
  }
  return (
    <SectionCard title="Pause switches" flush>
      <p className="border-b border-line px-4 py-3 text-sm text-muted">Pausing a channel holds every outgoing message on it. Held items stay queued in the dispatch queue and are sent when you resume. Use this during provider outages or while correcting a template.</p>
      <ul className="divide-y divide-line">
        {CHANNELS.map((c) => (
          <li key={c} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium"><ChannelBadge channel={c} /> {paused[c] ? <Badge tone="warning">Paused</Badge> : <Badge tone="success">Sending</Badge>}</p>
              <p className="mt-0.5 text-sm text-muted">{copy[c]}</p>
            </div>
            <div className="w-56">
              {canEdit ? (
                <Switch label={`${CHANNEL_LABEL[c]} sending`} checked={!paused[c]} disabled={busy}
                  onChange={(v) => (v ? toggle(c, false) : setConfirm(c))} />
              ) : (
                <GuardedButton allowed={false} why={why} className="btn-secondary">{paused[c] ? 'Resume' : 'Pause'} {CHANNEL_LABEL[c]}</GuardedButton>
              )}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} danger confirmLabel="Pause channel"
        title={`Pause ${confirm ? CHANNEL_LABEL[confirm] : ''} sending?`}
        consequences={['Stop every outgoing message on this channel, for all journals.', 'Keep queued items in the 08:45 dispatch queue until the channel is resumed.', 'Block re-sends from the communication log for this channel.']}
        onConfirm={() => confirm && toggle(confirm, true)} />
    </SectionCard>
  )
}

