import { useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { ArrowLeft, Bold, Heading2, Italic, Link2, List, Paperclip, Send, Trash2, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { ConfirmDialog, Dialog } from '@/components/Dialog'
import { FormField } from '@/components/Form'
import { KpiCard } from '@/components/KpiCard'
import { toast } from '@/components/Toasts'
import { GuardedButton } from '@/components/Tooltip'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { formatDateTime } from '@/shared/formatters'
import { CHART_COLORS } from '@/styles/tokens'
import { JOURNAL_CODES } from '@/mock/data/core'
import { SUBSCRIBER_SOURCES, emptyAudience, type Campaign, type CampaignAttachment, type CampaignAudience } from '@/mock/data/newsletter'
import { audienceFor, deleteCampaign, saveCampaign, scheduleCampaign, sendCampaignNow, sendTestEmail } from '@/mock/api/newsletter'
import { useNewsletterStore } from '@/mock/stores/newsletter'
import { CampaignStatusBadge, Markup } from './newsletterParts'
import { useNow } from './hooks'

export const BULK_NOTE = 'Sent through a bulk email service (to be confirmed)'

const schema = z.object({
  subject: z.string().trim().min(5, 'Subject must be at least 5 characters').max(120, 'Keep the subject under 120 characters'),
  body: z.string().trim().min(30, 'The message needs at least 30 characters'),
})

const MAX_FILES = 5
const MAX_KB = 5120

const defaultSchedule = () => {
  const d = new Date(Date.now() + 86_400_000)
  d.setHours(9, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/* ------------------------------ composer ------------------------------ */

export function CampaignComposer({ campaign, canEdit, why, onBack }: { campaign?: Campaign; canEdit: boolean; why?: string; onBack: () => void }) {
  const subscribers = useNewsletterStore((s) => s.subscribers)
  const [id, setId] = useState(campaign?.id)
  const [subject, setSubject] = useState(campaign?.subject ?? '')
  const [body, setBody] = useState(campaign?.body ?? '')
  const [audience, setAudience] = useState<CampaignAudience>(campaign?.audience ?? emptyAudience())
  const [files, setFiles] = useState<CampaignAttachment[]>(campaign?.attachments ?? [])
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fileErr, setFileErr] = useState('')
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [when, setWhen] = useState(campaign?.scheduledAt ? campaign.scheduledAt.slice(0, 16) : defaultSchedule())
  const [confirmSend, setConfirmSend] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const locked = campaign?.status === 'sent'
  const editable = canEdit && !locked
  const dirty = subject !== (campaign?.subject ?? '') || body !== (campaign?.body ?? '') || JSON.stringify(audience) !== JSON.stringify(campaign?.audience ?? emptyAudience()) || files.length !== (campaign?.attachments.length ?? 0)
  useUnsavedChanges(dirty && editable)

  const parsed = schema.safeParse({ subject, body })
  const errors = { subject: parsed.success ? undefined : parsed.error.issues.find((i) => i.path[0] === 'subject')?.message, body: parsed.success ? undefined : parsed.error.issues.find((i) => i.path[0] === 'body')?.message }
  const recipients = useMemo(() => audienceFor(audience, subscribers).length, [audience, subscribers])
  const nowMs = useNow(30000)
  const whenDate = new Date(when)
  const whenErr = Number.isNaN(whenDate.getTime()) ? 'Choose a date and time' : whenDate.getTime() <= nowMs ? 'Choose a time in the future' : undefined

  const wrap = (before: string, after = before, placeholder = 'text') => {
    const el = taRef.current
    const s = el?.selectionStart ?? body.length
    const e = el?.selectionEnd ?? body.length
    const sel = body.slice(s, e) || placeholder
    setBody(body.slice(0, s) + before + sel + after + body.slice(e))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + before.length, s + before.length + sel.length) })
  }
  const linePrefix = (prefix: string) => {
    const el = taRef.current
    const s = el?.selectionStart ?? body.length
    const start = body.lastIndexOf('\n', s - 1) + 1
    setBody(body.slice(0, start) + prefix + body.slice(start))
    requestAnimationFrame(() => el?.focus())
  }
  const toggle = <K extends keyof CampaignAudience>(key: K, v: CampaignAudience[K][number]) =>
    setAudience((a) => { const cur = a[key] as string[]; return { ...a, [key]: cur.includes(v as string) ? cur.filter((x) => x !== v) : [...cur, v] } })

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = [...files]
    let err = ''
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { err = `Attach at most ${MAX_FILES} files.`; break }
      if (f.size / 1024 > MAX_KB) { err = `${f.name} is larger than 5 MB.`; continue }
      next.push({ name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) })
    }
    setFileErr(err)
    setFiles(next)
  }

  const persist = async (): Promise<string | undefined> => {
    setTouched(true)
    if (!parsed.success) return undefined
    const saved = await saveCampaign(id, { subject: subject.trim(), body: body.trim(), audience, attachments: files })
    setId(saved.id)
    return saved.id
  }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong') } finally { setBusy(false) }
  }
  const saveDraft = () => run(async () => { if (await persist()) { toast.success('Draft saved'); onBack() } })
  const test = () => run(async () => { if (!parsed.success) { setTouched(true); return } const to = await sendTestEmail(subject.trim()); toast.success(`Test email sent to ${to}`) })
  const schedule = () => run(async () => {
    if (whenErr) return
    const cid = await persist()
    if (!cid) { setScheduleOpen(false); return }
    await scheduleCampaign(cid, whenDate.toISOString())
    toast.success(`Campaign scheduled for ${formatDateTime(whenDate.toISOString())}`)
    setScheduleOpen(false)
    onBack()
  })
  const sendNow = () => run(async () => {
    const cid = await persist()
    if (!cid) return
    const n = await sendCampaignNow(cid)
    toast.success(`Campaign sent to ${n} subscriber${n === 1 ? '' : 's'}`)
    onBack()
  })
  const sendDisabled = busy || recipients === 0 || (touched && !parsed.success)
  const cannotSend = !editable ? why : recipients === 0 ? 'No confirmed subscribers match this audience.' : undefined

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost" onClick={() => { if (!dirty || !editable || window.confirm('Discard your unsaved changes?')) onBack() }}><ArrowLeft size={15} strokeWidth={1.5} aria-hidden /> All campaigns</button>
        <div className="flex items-center gap-2 text-sm">{campaign && <CampaignStatusBadge status={campaign.status} />}{campaign?.scheduledAt && <span className="text-muted">Goes out {formatDateTime(campaign.scheduledAt)}</span>}{dirty && editable && <span className="text-xs font-medium text-amber-700">Unsaved changes</span>}</div>
      </div>
      {locked && <p role="note" className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">This campaign has been sent and can no longer be edited.</p>}

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4">
          <SectionCard title="Message">
            <div className="space-y-4">
              <FormField label="Subject" required error={touched ? errors.subject : undefined}>
                {(p) => <input {...p} className="input" value={subject} readOnly={!editable} onChange={(e) => setSubject(e.target.value)} />}
              </FormField>
              <FormField label="Body" required error={touched ? errors.body : undefined} hint="Use the toolbar for headings, bold, italic, bullets and links.">
                {(p) => (
                  <>
                    <div role="toolbar" aria-label="Formatting" className="mb-1 flex gap-1">
                      {([[Heading2, 'Heading', () => linePrefix('## ')], [Bold, 'Bold', () => wrap('**')], [Italic, 'Italic', () => wrap('_')], [List, 'Bulleted list', () => linePrefix('- ')], [Link2, 'Link', () => wrap('[', '](https://)', 'link text')]] as const).map(([Icon, label, fn]) => (
                        <button key={label} type="button" className="btn-secondary !h-8 !px-2" aria-label={label} title={label} disabled={!editable} onClick={fn}><Icon size={15} strokeWidth={1.6} aria-hidden /></button>
                      ))}
                    </div>
                    <textarea {...p} ref={taRef} rows={12} className="input !h-auto py-2 font-mono text-[13px] leading-6" value={body} readOnly={!editable} onChange={(e) => setBody(e.target.value)} />
                  </>
                )}
              </FormField>
              <div>
                <p className="label">Attachments</p>
                <ul className="space-y-1">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-subtle px-2.5 py-1.5 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5"><Paperclip size={14} aria-hidden className="shrink-0 text-faint" /><span className="truncate">{f.name}</span><span className="text-xs text-muted">{f.sizeKb} KB</span></span>
                      {editable && <button className="btn-ghost !px-1.5" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={14} aria-hidden /></button>}
                    </li>
                  ))}
                </ul>
                {editable && (
                  <label className="btn-secondary mt-2 cursor-pointer">
                    <Paperclip size={15} strokeWidth={1.5} aria-hidden /> Add attachment
                    <input type="file" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
                  </label>
                )}
                {fileErr && <p role="alert" className="mt-1 text-xs text-red-600">{fileErr}</p>}
                <p className="mt-1 text-xs text-muted">Up to {MAX_FILES} files, 5 MB each. Attachments are mocked in this prototype.</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Audience">
            <fieldset disabled={!editable} className="space-y-3">
              <legend className="label">Journal</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {JOURNAL_CODES.map((j) => <label key={j} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-indigo-600" checked={audience.journals.includes(j)} onChange={() => toggle('journals', j)} />{j}</label>)}
              </div>
              <p className="label !mb-0 !mt-3">Source</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {SUBSCRIBER_SOURCES.map((s) => <label key={s} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-indigo-600" checked={audience.sources.includes(s)} onChange={() => toggle('sources', s)} />{s}</label>)}
              </div>
              <p className="label !mb-0 !mt-3">Status</p>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked disabled className="accent-indigo-600" />Confirmed <span className="text-xs text-muted">(pending and unsubscribed people never receive campaigns)</span></label>
            </fieldset>
            <p className="mt-3 text-sm" aria-live="polite"><strong className="tabular-nums">{recipients}</strong> confirmed subscriber{recipients === 1 ? '' : 's'} will receive this. {audience.journals.length === 0 && audience.sources.length === 0 && <span className="text-muted">Leave filters empty to reach everyone.</span>}</p>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Preview">
            <div className="rounded-lg border border-line bg-white p-4">
              <p className="text-xs text-muted">Subject</p>
              <p className="mb-3 border-b border-line pb-3 font-semibold">{subject || '(no subject)'}</p>
              {body.trim() ? <Markup text={body} /> : <p className="text-sm text-muted">Your message appears here as you type.</p>}
              {files.length > 0 && <p className="mt-3 border-t border-line pt-2 text-xs text-muted">{files.length} attachment{files.length === 1 ? '' : 's'}: {files.map((f) => f.name).join(', ')}</p>}
              <p className="mt-4 border-t border-line pt-2 text-[11px] text-muted">You received this because you subscribed on one of our journal websites. Unsubscribe at any time.</p>
            </div>
          </SectionCard>
          <p role="note" className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">{BULK_NOTE}</p>
        </div>
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          {campaign?.status === 'draft' && id
            ? <GuardedButton allowed={editable} why={why} className="btn-ghost text-red-700" onClick={() => setConfirmDelete(true)}><Trash2 size={15} strokeWidth={1.5} aria-hidden /> Delete draft</GuardedButton>
            : <span />}
          <div className="flex flex-wrap gap-2">
            <GuardedButton allowed={editable} why={why} className="btn-secondary" disabled={busy} onClick={test}>Send test</GuardedButton>
            <GuardedButton allowed={editable} why={why} className="btn-secondary" disabled={busy} onClick={saveDraft}>Save draft</GuardedButton>
            <GuardedButton allowed={editable && recipients > 0} why={cannotSend} className="btn-secondary" disabled={sendDisabled} onClick={() => { setTouched(true); if (parsed.success) setScheduleOpen(true) }}>Schedule</GuardedButton>
            <GuardedButton allowed={editable && recipients > 0} why={cannotSend} className="btn-primary" disabled={sendDisabled} onClick={() => { setTouched(true); if (parsed.success) setConfirmSend(true) }}><Send size={15} strokeWidth={1.5} aria-hidden /> Send now</GuardedButton>
          </div>
        </div>
      )}

      <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Schedule campaign" description={`Goes to ${recipients} confirmed subscriber${recipients === 1 ? '' : 's'}.`}
        footer={<><button className="btn-secondary" onClick={() => setScheduleOpen(false)}>Cancel</button><button className="btn-primary" disabled={!!whenErr || busy} onClick={schedule}>Schedule campaign</button></>}>
        <FormField label="Send on" required error={whenErr} hint="Local time. You can cancel the schedule until it goes out.">
          {(p) => <input {...p} type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />}
        </FormField>
      </Dialog>
      <ConfirmDialog open={confirmSend} onClose={() => setConfirmSend(false)} confirmLabel="Send now" title={`Send to ${recipients} subscriber${recipients === 1 ? '' : 's'} now?`}
        consequences={[`Email “${subject.trim() || 'this campaign'}” to ${recipients} confirmed subscriber${recipients === 1 ? '' : 's'} immediately.`, 'This cannot be recalled or edited afterwards.', 'Record the send and its delivery report in the campaign list and audit log.']}
        onConfirm={sendNow} />
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} danger confirmLabel="Delete draft" title="Delete this draft?"
        consequences={['Permanently remove the draft and its attachments list.', 'Nothing is sent to subscribers.']}
        onConfirm={() => run(async () => { if (id) { await deleteCampaign(id); toast.success('Draft deleted'); onBack() } })} />
    </div>
  )
}

/* ------------------------------ delivery report ------------------------------ */

export function DeliveryReportView({ campaign, onBack }: { campaign: Campaign; onBack: () => void }) {
  const r = campaign.report
  if (!r) return null
  const pct = (n: number, of = r.sent) => (of ? `${Math.round((n / of) * 100)}%` : '0%')
  const rows = [
    { name: 'Sent', value: r.sent, share: '100%' },
    { name: 'Delivered', value: r.delivered, share: pct(r.delivered) },
    { name: 'Opened', value: r.opened, share: pct(r.opened, r.delivered) + ' of delivered' },
    { name: 'Bounced', value: r.bounced, share: pct(r.bounced) },
    { name: 'Unsubscribed', value: r.unsubscribed, share: pct(r.unsubscribed) },
  ]
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="btn-ghost" onClick={onBack}><ArrowLeft size={15} strokeWidth={1.5} aria-hidden /> All campaigns</button>
        <span className="text-sm text-muted">Sent {campaign.sentAt ? formatDateTime(campaign.sentAt) : ''}</span>
      </div>
      <div>
        <h2 className="text-lg font-semibold">{campaign.subject}</h2>
        <p className="text-sm text-muted">Delivery report. Numbers are simulated in this prototype.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {rows.map((x) => <KpiCard key={x.name} label={x.name} value={x.value} hint={x.share} tone={x.name === 'Bounced' && x.value > 0 ? 'warning' : 'default'} />)}
      </div>
      <SectionCard title="Delivery funnel">
        <div role="img" aria-label={`Bar chart: ${rows.map((x) => `${x.name} ${x.value}`).join(', ')}`} className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#475569' }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#475569' }} />
              <ChartTip cursor={{ fill: '#F1F5F9' }} />
              <Bar dataKey="value" name="Recipients" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">Delivery numbers for {campaign.subject}</caption>
            <thead className="bg-page text-xs text-muted"><tr><th scope="col" className="px-3 py-2 text-left font-medium">Measure</th><th scope="col" className="px-3 py-2 text-right font-medium">Recipients</th><th scope="col" className="px-3 py-2 text-right font-medium">Share</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((x) => <tr key={x.name}><th scope="row" className="px-3 py-1.5 text-left font-normal">{x.name}</th><td className="px-3 py-1.5 text-right tabular-nums">{x.value}</td><td className="px-3 py-1.5 text-right text-muted">{x.share}</td></tr>)}</tbody>
          </table>
        </div>
      </SectionCard>
      <Badge tone="neutral">{BULK_NOTE}</Badge>
    </div>
  )
}

