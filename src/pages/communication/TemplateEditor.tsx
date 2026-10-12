import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { Lock, RotateCcw, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/Badges'
import { EmailPreview } from '@/components/EmailPreview'
import { FormField } from '@/components/Form'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useScoped } from '@/lib/scope'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import { formatDate } from '@/shared/formatters'
import { useDataStore } from '@/mock/store'
import { saveEmailTemplate } from '@/mock/api/templates'
import {
  TEMPLATE_EVENTS, TEMPLATE_VARIABLES, paperVars, renderText, sampleVars, unknownVariables, usedVariables,
  type MessageTemplate,
} from '@/mock/data/communication'
import { CHANNEL_LABEL, ChannelBadge } from './parts'

const unknownRule = (field: string) => (v: string, ctx: z.RefinementCtx) => {
  const bad = unknownVariables(v)
  if (bad.length) ctx.addIssue({ code: 'custom', message: `Unknown variable${bad.length > 1 ? 's' : ''} in ${field}: ${bad.map((b) => `{{${b}}}`).join(', ')}` })
}
const unbalanced = (v: string) => (v.match(/\{\{/g)?.length ?? 0) === (v.match(/\}\}/g)?.length ?? 0)

const emailSchema = z.object({
  subject: z.string().trim().min(5, 'Subject must be at least 5 characters').max(150, 'Subject is too long (150 max)').superRefine(unknownRule('subject')).refine(unbalanced, 'Check the braces: every {{ needs a closing }}'),
  body: z.string().trim().min(40, 'Body must be at least 40 characters').superRefine(unknownRule('body')).refine(unbalanced, 'Check the braces: every {{ needs a closing }}'),
})

function VariableChips({ onInsert, disabled }: { onInsert: (key: string) => void; disabled?: boolean }) {
  return (
    <div>
      <p className="label">Insert variable</p>
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATE_VARIABLES.map((v) => (
          <button key={v.key} type="button" disabled={disabled} title={`${v.label}, e.g. ${v.sample}`} onClick={() => onInsert(v.key)}
            className="rounded-md border border-line bg-subtle px-2 py-0.5 font-mono text-xs text-ink hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50">
            {`{{${v.key}}}`}
          </button>
        ))}
      </div>
    </div>
  )
}

function Phone({ children, tone }: { children: React.ReactNode; tone: 'sms' | 'whatsapp' }) {
  return (
    <div className="mx-auto w-full max-w-[320px] rounded-[24px] border-4 border-slate-800 bg-slate-800 p-1">
      <div className={cn('min-h-[200px] rounded-[18px] p-3', tone === 'whatsapp' ? 'bg-[#e7f6e4]' : 'bg-slate-100')}>
        <p className="mb-2 text-center text-[11px] font-medium text-muted">{tone === 'whatsapp' ? 'EdTech Publishers · WhatsApp' : 'EDTPUB · SMS'}</p>
        {children}
      </div>
    </div>
  )
}

/** Variables in the order they appear → positional placeholders. */
function VariableMapping({ body, positional }: { body: string; positional: string }) {
  const keys = usedVariables(body)
  const sample = sampleVars()
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold">Variable mapping</h4>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-page text-xs text-muted"><tr><th scope="col" className="px-3 py-2 text-left font-medium">Placeholder</th><th scope="col" className="px-3 py-2 text-left font-medium">Mapped to</th><th scope="col" className="px-3 py-2 text-left font-medium">Sample</th></tr></thead>
          <tbody className="divide-y divide-line">
            {keys.map((k, i) => (
              <tr key={k}>
                <td className="px-3 py-1.5 font-mono text-xs">{positional === 'dlt' ? '{#var#}' : `{{${i + 1}}}`} <span className="text-faint">#{i + 1}</span></td>
                <td className="px-3 py-1.5 font-mono text-xs">{`{{${k}}}`}</td>
                <td className="px-3 py-1.5 text-muted">{sample[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function TemplateEditor({ template, canEdit, why, onDirty, onSaved }: {
  template: MessageTemplate
  canEdit: boolean
  why?: string
  onDirty: (dirty: boolean) => void
  onSaved: () => void
}) {
  const event = TEMPLATE_EVENTS.find((e) => e.key === template.event)!
  const [subject, setSubject] = useState(template.subject ?? '')
  const [body, setBody] = useState(template.body)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewId, setPreviewId] = useState('sample')
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const lastField = useRef<'subject' | 'body'>('body')

  const papers = useScoped(useDataStore((s) => s.papers))
  const previewPapers = useMemo(() => papers.slice(0, 4), [papers])
  const vars = useMemo(() => {
    const p = previewPapers.find((x) => x.id === previewId)
    return p ? paperVars(p) : sampleVars()
  }, [previewId, previewPapers])

  const isEmail = template.channel === 'email'
  const dirty = isEmail && (subject !== (template.subject ?? '') || body !== template.body)
  useUnsavedChanges(dirty)
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])

  const parsed = emailSchema.safeParse({ subject, body })
  const errors = useMemo(() => {
    const out: { subject?: string; body?: string } = {}
    if (!parsed.success) for (const i of parsed.error.issues) { const k = i.path[0] as 'subject' | 'body'; out[k] ??= i.message }
    return out
  }, [parsed])

  const insert = (key: string) => {
    const token = `{{${key}}}`
    const el = lastField.current === 'subject' ? subjectRef.current : bodyRef.current
    const cur = lastField.current === 'subject' ? subject : body
    const start = el?.selectionStart ?? cur.length
    const end = el?.selectionEnd ?? cur.length
    const next = cur.slice(0, start) + token + cur.slice(end)
    if (lastField.current === 'subject') setSubject(next)
    else setBody(next)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length) })
  }

  const save = async () => {
    setTouched(true)
    if (!parsed.success) return
    setSaving(true)
    try {
      await saveEmailTemplate(template.id, { subject: subject.trim(), body: body.trim() })
      toast.success(`"${event.label}" email template saved`)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the template')
    } finally {
      setSaving(false)
    }
  }

  const rSubject = renderText(subject, vars)
  const rBody = renderText(body, vars)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">{event.label} <ChannelBadge channel={template.channel} /></h3>
          <p className="mt-0.5 text-sm text-muted">{event.description}</p>
        </div>
        {isEmail ? <Badge tone="accent">Editable</Badge>
          : template.channel === 'sms' ? <Badge tone="warning"><Lock size={12} aria-hidden /> DLT-approved</Badge>
          : <Badge tone="success"><ShieldCheck size={12} aria-hidden /> Meta-approved</Badge>}
      </div>

      {!isEmail && (
        <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <Lock size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            {template.channel === 'sms'
              ? <><strong>DLT-approved wording, cannot be freely edited.</strong> Changes need a fresh DLT registration with the telecom operator. Only the variable mapping is shown here.</>
              : <><strong>Meta-approved template.</strong> The wording is fixed by WhatsApp Business approval; submit a new template to Meta to change it.</>}
          </p>
        </div>
      )}
      {!canEdit && isEmail && <p role="note" className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">View only. {why}</p>}

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4">
          {isEmail ? (
            <>
              <FormField label="Subject" required error={touched ? errors.subject : undefined}>
                {(p) => <input {...p} ref={subjectRef} className="input" value={subject} readOnly={!canEdit} onFocus={() => (lastField.current = 'subject')} onChange={(e) => setSubject(e.target.value)} onBlur={() => setTouched(true)} />}
              </FormField>
              <FormField label="Body" required error={touched ? errors.body : undefined} hint="Plain text. Variables are replaced with each paper’s data when the email is sent.">
                {(p) => <textarea {...p} ref={bodyRef} rows={14} className="input !h-auto py-2 font-mono text-[13px] leading-6" value={body} readOnly={!canEdit} onFocus={() => (lastField.current = 'body')} onChange={(e) => setBody(e.target.value)} onBlur={() => setTouched(true)} />}
              </FormField>
              <VariableChips onInsert={insert} disabled={!canEdit} />
            </>
          ) : (
            <>
              <div>
                <p className="label">Approved wording</p>
                <pre className="whitespace-pre-wrap rounded-lg border border-line bg-subtle px-3 py-2.5 font-mono text-[13px] leading-6 text-muted">{template.body}</pre>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {(template.channel === 'sms'
                  ? [['DLT template ID', template.dltId], ['Sender ID', template.senderId], ['Approved on', template.approvedAt ? formatDate(template.approvedAt) : '—'], ['Length', `${template.body.length} characters (before variables)`]]
                  : [['Template name', template.metaName], ['Category', template.metaCategory], ['Language', 'English (en)'], ['Approved on', template.approvedAt ? formatDate(template.approvedAt) : '—']]
                ).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 break-all font-medium">{v}</dd></div>)}
              </dl>
              <VariableMapping body={template.body} positional={template.channel === 'sms' ? 'dlt' : 'meta'} />
            </>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Live preview</h4>
            <label className="flex items-center gap-2 text-xs text-muted">Sample data
              <select className="input !h-8 !w-auto" value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
                <option value="sample">Generic sample</option>
                {previewPapers.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
              </select>
            </label>
          </div>
          {isEmail ? (
            <EmailPreview to={vars.author_name ? `${vars.author_name.toLowerCase().replace(/\s+/g, '.')}@university.example` : 'author@university.example'} subject={rSubject || '(no subject)'} body={rBody || '(empty body)'} />
          ) : (
            <>
              <Phone tone={template.channel === 'whatsapp' ? 'whatsapp' : 'sms'}>
                <p className="whitespace-pre-wrap rounded-lg rounded-tl-sm bg-white px-3 py-2 text-sm leading-6 shadow-sm">{renderText(template.body, vars)}</p>
              </Phone>
              {template.channel === 'sms' && <p className="text-center text-xs text-muted">{renderText(template.body, vars).length} characters after substitution · {Math.ceil(renderText(template.body, vars).length / 160)} SMS segment(s)</p>}
            </>
          )}
        </div>
      </div>

      {isEmail && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs text-muted">Last edited by {template.updatedBy}, {formatDate(template.updatedAt)}{dirty && <span className="ml-2 font-medium text-amber-700">Unsaved changes</span>}</p>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={!dirty || saving} onClick={() => { setSubject(template.subject ?? ''); setBody(template.body); setTouched(false) }}><RotateCcw size={14} strokeWidth={1.5} aria-hidden /> Discard changes</button>
            <GuardedButton allowed={canEdit} why={why} className="btn-primary" disabled={!dirty || saving || (touched && !parsed.success)} onClick={save}>{saving ? 'Saving…' : 'Save template'}</GuardedButton>
          </div>
        </div>
      )}
      <p className="sr-only">{CHANNEL_LABEL[template.channel]} template</p>
    </div>
  )
}
