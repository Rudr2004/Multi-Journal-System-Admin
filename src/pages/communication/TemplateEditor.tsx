import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { AlertTriangle, CheckCircle2, Code2, FileText, Lock, Monitor, RotateCcw, ShieldCheck, Smartphone, Trash2, Wand2, XCircle } from 'lucide-react'
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
import { deleteHtmlLayout, saveEmailTemplate, saveHtmlLayout } from '@/mock/api/templates'
import { useCommStore } from '@/mock/stores/communication'
import { STARTER_HTML, lintEmailHtml } from '@/mock/data/emailHtml'
import {
  TEMPLATE_EVENTS, TEMPLATE_VARIABLES, paperVars, renderAny, renderText, sampleVars, unknownVariables, unknownVariablesAny, usedVariables,
  type MessageTemplate,
} from '@/mock/data/communication'
import { CHANNEL_LABEL, ChannelBadge } from './parts'

const unknownRule = (field: string) => (v: string, ctx: z.RefinementCtx) => {
  const bad = unknownVariables(v)
  if (bad.length) ctx.addIssue({ code: 'custom', message: `Unknown variable${bad.length > 1 ? 's' : ''} in ${field}: ${bad.map((b) => `{{${b}}}`).join(', ')}` })
}
const unknownAnyRule = (field: string) => (v: string, ctx: z.RefinementCtx) => {
  const bad = unknownVariablesAny(v)
  if (bad.length) ctx.addIssue({ code: 'custom', message: `Unknown placeholder${bad.length > 1 ? 's' : ''} in ${field}: ${bad.map((b) => `{${b}}`).join(', ')}` })
}
const unbalanced = (v: string) => (v.match(/\{\{/g)?.length ?? 0) === (v.match(/\}\}/g)?.length ?? 0)

const emailSchema = z.object({
  subject: z.string().trim().min(5, 'Subject must be at least 5 characters').max(150, 'Subject is too long (150 max)').superRefine(unknownAnyRule('subject')).refine(unbalanced, 'Check the braces: every {{ needs a closing }}'),
  body: z.string().trim().min(40, 'Body must be at least 40 characters').superRefine(unknownRule('body')).refine(unbalanced, 'Check the braces: every {{ needs a closing }}'),
})

function VariableChips({ onInsert, disabled, single }: { onInsert: (key: string) => void; disabled?: boolean; single?: boolean }) {
  return (
    <div>
      <p className="label">Insert placeholder</p>
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATE_VARIABLES.map((v) => (
          <button key={v.key} type="button" disabled={disabled} title={`${v.label}, e.g. ${v.sample}`} onClick={() => onInsert(v.key)}
            className="rounded-md border border-line bg-subtle px-2 py-0.5 font-mono text-xs text-ink hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50">
            {single ? `{${v.key}}` : `{{${v.key}}}`}
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
  const [format, setFormat] = useState<'text' | 'html'>(template.format ?? 'text')
  const [html, setHtml] = useState(template.html ?? '')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [htmlFocused, setHtmlFocused] = useState(false)
  const [layoutId, setLayoutId] = useState('')
  const layouts = useCommStore((st) => st.htmlLayouts)
  const htmlRef = useRef<HTMLTextAreaElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const lastField = useRef<'subject' | 'body' | 'html'>('body')

  const papers = useScoped(useDataStore((s) => s.papers))
  const previewPapers = useMemo(() => papers.slice(0, 4), [papers])
  const vars = useMemo(() => {
    const p = previewPapers.find((x) => x.id === previewId)
    return p ? paperVars(p) : sampleVars()
  }, [previewId, previewPapers])

  const isEmail = template.channel === 'email'
  const dirty = isEmail && (subject !== (template.subject ?? '') || body !== template.body || format !== (template.format ?? 'text') || (format === 'html' && html !== (template.html ?? '')))
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
    const inHtml = format === 'html' && lastField.current === 'html'
    const token = inHtml ? `{${key}}` : `{{${key}}}`
    const el = lastField.current === 'subject' ? subjectRef.current : inHtml ? htmlRef.current : bodyRef.current
    const cur = lastField.current === 'subject' ? subject : inHtml ? html : body
    const start = el?.selectionStart ?? cur.length
    const end = el?.selectionEnd ?? cur.length
    const next = cur.slice(0, start) + token + cur.slice(end)
    if (lastField.current === 'subject') setSubject(next)
    else if (inHtml) setHtml(next)
    else setBody(next)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length) })
  }

  const save = async () => {
    setTouched(true)
    if (!parsed.success || htmlError) return
    setSaving(true)
    try {
      await saveEmailTemplate(template.id, { subject: subject.trim(), body: body.trim(), format, html: format === 'html' ? html : undefined })
      toast.success(`"${event.label}" email template saved`)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the template')
    } finally {
      setSaving(false)
    }
  }

  const rSubject = renderAny(subject, vars)
  const rBody = renderText(body, vars)
  const rHtml = useMemo(() => renderAny(html, vars), [html, vars])
  const checks = useMemo(() => (format === 'html' ? lintEmailHtml(html) : []), [format, html])
  const htmlError = ((): string | undefined => {
    if (format !== 'html') return undefined
    if (html.trim().length < 60) return 'Enter your HTML (at least 60 characters), or use “Insert responsive layout” to start.'
    if (/<script[\s>]/i.test(html)) return 'Remove <script>: email clients block scripts.'
    const bad = unknownVariablesAny(html)
    if (bad.length) return `Unknown placeholder${bad.length > 1 ? 's' : ''}: ${bad.map((x) => `{${x}}`).join(', ')}`
    return undefined
  })()

  const insertStarter = () => {
    if (html.trim() && !window.confirm('Replace the HTML in the editor with the responsive starter layout?')) return
    setHtml(STARTER_HTML)
  }
  const applyLayout = () => {
    const l = layouts.find((x) => x.id === layoutId)
    if (!l) return
    if (html.trim() && html !== l.html && !window.confirm(`Replace the HTML in the editor with "${l.name}"?`)) return
    setHtml(l.html)
    toast.info(`Applied "${l.name}". Save the template to keep it.`)
  }
  const saveLayout = async () => {
    const name = window.prompt('Name this layout so you can reuse it for other notifications')
    if (!name) return
    try {
      const l = await saveHtmlLayout(name, html)
      setLayoutId(l.id)
      toast.success(`Layout "${l.name}" saved for reuse`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save the layout') }
  }
  const removeLayout = async () => {
    const l = layouts.find((x) => x.id === layoutId)
    if (!l || !window.confirm(`Delete the saved layout "${l.name}"? Templates already using it keep their HTML.`)) return
    try { await deleteHtmlLayout(l.id); setLayoutId(''); toast.success('Layout deleted') } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not delete the layout') }
  }

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
                {(p) => <input {...p} ref={subjectRef} className="input" value={subject} readOnly={!canEdit} onFocus={() => { lastField.current = 'subject'; setHtmlFocused(false) }} onChange={(e) => setSubject(e.target.value)} onBlur={() => setTouched(true)} />}
              </FormField>
              <div role="radiogroup" aria-label="Email format" className="inline-flex rounded-lg bg-subtle p-0.5">
                {([['text', 'Plain text', FileText], ['html', 'HTML code', Code2]] as const).map(([v, label, Icon]) => (
                  <button key={v} type="button" role="radio" aria-checked={format === v} disabled={!canEdit} onClick={() => setFormat(v)}
                    className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed', format === v ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>
                    <Icon size={14} strokeWidth={1.5} aria-hidden /> {label}
                  </button>
                ))}
              </div>

              {format === 'text' ? (
                <FormField label="Body" required error={touched ? errors.body : undefined} hint="Plain text. Placeholders are replaced with each paper’s data when the email is sent.">
                  {(p) => <textarea {...p} ref={bodyRef} rows={14} className="input !h-auto py-2 font-mono text-[13px] leading-6" value={body} readOnly={!canEdit} onFocus={() => { lastField.current = 'body'; setHtmlFocused(false) }} onChange={(e) => setBody(e.target.value)} onBlur={() => setTouched(true)} />}
                </FormField>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="btn-secondary !h-8" disabled={!canEdit} onClick={insertStarter}><Wand2 size={14} strokeWidth={1.5} aria-hidden /> Insert responsive layout</button>
                    <select aria-label="Saved layouts" className="input !h-8 !w-auto max-w-[200px]" value={layoutId} onChange={(e) => setLayoutId(e.target.value)}>
                      <option value="">Saved layouts…</option>
                      {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <button type="button" className="btn-secondary !h-8" disabled={!canEdit || !layoutId} onClick={applyLayout}>Use layout</button>
                    <button type="button" className="btn-ghost !h-8 text-red-600" disabled={!canEdit || !layoutId} aria-label="Delete saved layout" onClick={removeLayout}><Trash2 size={14} strokeWidth={1.5} aria-hidden /></button>
                    <button type="button" className="btn-ghost !h-8 ml-auto" disabled={!canEdit || !html.trim()} onClick={saveLayout}>Save as reusable layout</button>
                  </div>
                  <FormField label="HTML code" required error={touched ? htmlError : undefined} hint="Write or paste your own HTML. Use table layouts and inline styles for the best results in Gmail and Outlook.">
                    {(p) => (
                      <textarea {...p} ref={htmlRef} rows={20} spellCheck={false} wrap="off" readOnly={!canEdit} value={html}
                        className="block w-full resize-y rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-[12.5px] leading-5 text-slate-100 outline-none focus:ring-2 focus:ring-accent"
                        onFocus={() => { lastField.current = 'html'; setHtmlFocused(true) }} onChange={(e) => setHtml(e.target.value)} onBlur={() => setTouched(true)} />
                    )}
                  </FormField>
                  <p className="-mt-2 text-right text-xs tabular-nums text-muted">{html.split('\n').length} lines · {html.length.toLocaleString('en-IN')} characters</p>
                  <section aria-label="Email client compatibility" className="rounded-lg border border-line p-3">
                    <p className="mb-2 text-sm font-medium">Compatibility check <span className="font-normal text-muted">· {checks.filter((c) => c.level === 'pass').length} of {checks.length} passed</span></p>
                    <ul className="space-y-1.5 text-sm">
                      {checks.map((c) => (
                        <li key={c.id} className="flex items-start gap-2">
                          {c.level === 'pass' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-600" aria-hidden /> : c.level === 'warn' ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" aria-hidden /> : <XCircle size={15} className="mt-0.5 shrink-0 text-red-600" aria-hidden />}
                          <span><span className={c.level === 'pass' ? 'text-muted' : 'font-medium'}>{c.label}</span>{c.detail && <span className="block text-xs text-muted">{c.detail}</span>}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <details className="rounded-lg border border-line p-3">
                    <summary className="cursor-pointer text-sm font-medium">Plain-text version <span className="font-normal text-muted">(shown by email clients that cannot display HTML)</span></summary>
                    <div className="mt-3">
                      <FormField label="Plain-text body" required error={touched ? errors.body : undefined}>
                        {(p) => <textarea {...p} ref={bodyRef} rows={8} className="input !h-auto py-2 font-mono text-[13px] leading-6" value={body} readOnly={!canEdit} onFocus={() => { lastField.current = 'body'; setHtmlFocused(false) }} onChange={(e) => setBody(e.target.value)} onBlur={() => setTouched(true)} />}
                      </FormField>
                    </div>
                  </details>
                </>
              )}
              <VariableChips onInsert={insert} disabled={!canEdit} single={format === 'html' && htmlFocused} />
              {format === 'html' && <p className="-mt-2 text-xs text-muted">Both <span className="font-mono">{'{author_name}'}</span> and <span className="font-mono">{'{{author_name}}'}</span> work. Click inside the HTML box first to insert a placeholder there.</p>}
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
            format === 'html' ? (
              <figure aria-label="HTML email preview" className="overflow-hidden rounded-lg border border-line bg-slate-100">
                <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-page px-3 py-2 text-xs text-muted">
                  <span className="truncate"><span className="font-medium text-ink">{rSubject || '(no subject)'}</span></span>
                  <span role="group" aria-label="Preview width" className="inline-flex rounded-md bg-subtle p-0.5">
                    {([['desktop', 'Desktop', Monitor], ['mobile', 'Mobile', Smartphone]] as const).map(([v, label, Icon]) => (
                      <button key={v} type="button" aria-pressed={device === v} onClick={() => setDevice(v)} className={cn('inline-flex items-center gap-1 rounded px-2 py-1', device === v ? 'bg-surface font-medium text-ink shadow-sm' : 'hover:text-ink')}><Icon size={13} aria-hidden /> {label}</button>
                    ))}
                  </span>
                </figcaption>
                <div className="flex justify-center p-3">
                  {html.trim() ? (
                    <iframe title="Email preview" sandbox="" srcDoc={rHtml} className="h-[560px] rounded border border-line bg-white" style={{ width: device === 'mobile' ? 375 : '100%', maxWidth: '100%' }} />
                  ) : <p className="py-16 text-center text-sm text-muted">Nothing to preview yet. Write some HTML or insert the responsive layout.</p>}
                </div>
                <p className="border-t border-line bg-page px-3 py-1.5 text-xs text-muted">Placeholders show the sample data selected above. Scripts are blocked in the preview, as in real email clients.</p>
              </figure>
            ) : (
              <EmailPreview to={vars.author_name ? `${vars.author_name.toLowerCase().replace(/\s+/g, '.')}@university.example` : 'author@university.example'} subject={rSubject || '(no subject)'} body={rBody || '(empty body)'} />
            )
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
            <button className="btn-secondary" disabled={!dirty || saving} onClick={() => { setSubject(template.subject ?? ''); setBody(template.body); setFormat(template.format ?? 'text'); setHtml(template.html ?? ''); setTouched(false) }}><RotateCcw size={14} strokeWidth={1.5} aria-hidden /> Discard changes</button>
            <GuardedButton allowed={canEdit} why={why} className="btn-primary" disabled={!dirty || saving || (touched && (!parsed.success || !!htmlError))} onClick={save}>{saving ? 'Saving…' : 'Save template'}</GuardedButton>
          </div>
        </div>
      )}
      <p className="sr-only">{CHANNEL_LABEL[template.channel]} template</p>
    </div>
  )
}
