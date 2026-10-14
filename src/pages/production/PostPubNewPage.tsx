import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, FileUp, Search } from 'lucide-react'
import { PageHeader } from '@/layout/PageHeader'
import { JournalBadge, StatusBadge } from '@/components/Badges'
import { SectionCard } from '@/components/Card'
import { FormField } from '@/components/Form'
import { EmptyState, Skeleton } from '@/components/States'
import { GuardedButton } from '@/components/Tooltip'
import { toast } from '@/components/Toasts'
import { useAsync } from '@/lib/useAsync'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'
import { useScopeJournals } from '@/lib/scope'
import { authorsOf, createChangeRequest, listPublishedPapers } from '@/mock/api/postPublication'
import { CHANGE_TYPE_META, type ChangeType } from '@/mock/data/production'
import type { Paper } from '@/shared/types'
import { useCanRaise } from './postPubShared'

const TYPES = Object.keys(CHANGE_TYPE_META) as ChangeType[]

export function PostPubNewPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const journals = useScopeJournals()
  const raise = useCanRaise()
  const papers = useAsync(() => listPublishedPapers(journals), [journals.join(',')])
  const [filter, setFilter] = useState('')
  const [paperId, setPaperId] = useState(params.get('paper') ?? '')
  const [type, setType] = useState<ChangeType>('author_name')
  const [reason, setReason] = useState('')
  const [authorIndex, setAuthorIndex] = useState(0)
  const [newValue, setNewValue] = useState('')
  const [oldText, setOldText] = useState('')
  const [newText, setNewText] = useState('')
  const [notice, setNotice] = useState('')
  const [fileName, setFileName] = useState('')
  const [attachment, setAttachment] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const attach = useRef<HTMLInputElement>(null)
  useUnsavedChanges(!busy && (reason.length > 0 || attachment.length > 0 || newValue.length > 0 || oldText.length > 0 || notice.length > 0))

  const all = papers.data ?? []
  const paper: Paper | undefined = all.find((p) => p.id === paperId)
  const authors = paper ? authorsOf(paper.id) : []
  const shown = all.filter((p) => !filter || `${p.id} ${p.title}`.toLowerCase().includes(filter.toLowerCase())).slice(0, 8)
  const editsAuthor = type === 'author_name' || type === 'affiliation'
  const terminal = type === 'retraction' || type === 'withdrawal'

  const resetValue = () => { setNewValue(''); setTouched(false) }
  const pickType = (t: ChangeType) => {
    setType(t); resetValue()
    setNotice(t === 'retraction' ? 'This article has been retracted at the request of the Editor because …' : t === 'withdrawal' ? 'This article has been withdrawn at the request of the authors because …' : '')
  }
  const pickPaper = (id: string) => { setPaperId(id); setAuthorIndex(0); resetValue() }
  const pickAuthor = (i: number) => { setAuthorIndex(i); resetValue() }

  const err = {
    paper: !paper ? 'Choose a published paper.' : undefined,
    reason: reason.trim().length < 10 ? 'Give the reason for the request (at least 10 characters).' : undefined,
    value: editsAuthor && newValue.trim().length < 3 ? 'Enter the new value.' : editsAuthor && newValue.trim() === (type === 'author_name' ? authors[authorIndex]?.name : authors[authorIndex]?.affiliation) ? 'The new value is the same as the published one.' : undefined,
    text: type === 'correction' ? (oldText.trim().length < 5 ? 'Quote the text that is wrong.' : newText.trim().length < 2 || newText.trim() === oldText.trim() ? 'Enter the corrected text.' : undefined) : undefined,
    notice: (type === 'erratum' || terminal) && notice.trim().length < 20 ? 'Write the public notice (at least 20 characters).' : undefined,
    file: type === 'file_replacement' && !fileName ? 'Attach the replacement file.' : undefined,
  }
  const hasErr = Object.values(err).some(Boolean)

  const submit = async () => {
    setTouched(true)
    if (hasErr || !paper) return
    setBusy(true)
    try {
      const r = await createChangeRequest({ paperId: paper.id, type, reason, authorIndex, newValue, oldText, newText, notice, fileName, attachmentName: attachment })
      toast.success(`${r.id} raised. An Editor will review it.`)
      navigate(`/post-publication/${r.id}`)
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="New change request" description="Raise a request on behalf of an author. An Editor reviews it (and may set a correction fee) before anyone edits the article." crumbs={[{ label: 'New' }]} />
      <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <SectionCard title="1. Published paper">
          <label htmlFor="pp-filter" className="label">Search published papers</label>
          <div className="relative mb-3">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input id="pp-filter" className="input !pl-9" placeholder="Paper ID or title" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          {papers.loading ? <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
            : shown.length === 0 ? <EmptyState icon={Search} title="No published paper matches" hint="Only published papers in your journals can be changed after publication." />
            : (
              <ul className="max-h-[340px] space-y-2 overflow-y-auto" aria-label="Published papers">
                {(paper && !shown.some((p) => p.id === paper.id) ? [paper, ...shown] : shown).map((p) => (
                  <li key={p.id}>
                    <button type="button" aria-pressed={p.id === paperId} onClick={() => pickPaper(p.id)}
                      className={cn('flex w-full items-start gap-3 rounded-lg border p-3 text-left', p.id === paperId ? 'border-accent bg-indigo-50' : 'border-line hover:bg-subtle')}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="whitespace-nowrap text-sm font-medium">{p.id}</span><JournalBadge code={p.journal} /><StatusBadge status={p.status} /></div>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted" title={p.title}>{p.title}</p>
                      </div>
                      {p.id === paperId && <Check size={18} className="mt-1 text-accent" aria-label="Selected" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {touched && err.paper && <p role="alert" className="mt-2 text-xs text-red-600">{err.paper}</p>}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title="2. What needs to change">
            <fieldset>
              <legend className="sr-only">Type of change</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {TYPES.map((t) => (
                  <label key={t} className={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm', type === t ? 'border-accent bg-indigo-50' : 'border-line hover:bg-subtle')}>
                    <input type="radio" name="change-type" className="mt-0.5 accent-indigo-600" checked={type === t} onChange={() => pickType(t)} />
                    <span><span className="font-medium">{CHANGE_TYPE_META[t].label}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="mt-2 text-xs text-muted">{CHANGE_TYPE_META[type].hint}</p>
            {terminal && (
              <p role="note" className="mt-3 flex items-start gap-2 rounded-md bg-red-50 p-2.5 text-xs text-red-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                {type === 'retraction' ? 'A retraction is public and permanent. The article stays online, marked as retracted, and Crossref is updated.' : 'A withdrawal removes the article from the live record and updates Crossref.'}</p>
            )}

            <div className="mt-4 space-y-4">
              {editsAuthor && paper && (
                <>
                  <FormField label="Author">
                    {(a) => <select {...a} className="input" value={authorIndex} onChange={(e) => pickAuthor(Number(e.target.value))}>{authors.map((au, i) => <option key={au.email + i} value={i}>{i + 1}. {au.name}</option>)}</select>}
                  </FormField>
                  <p className="text-xs text-muted">Published {type === 'author_name' ? 'name' : 'affiliation'}: <span className="text-ink">{type === 'author_name' ? authors[authorIndex]?.name : authors[authorIndex]?.affiliation}</span></p>
                  <FormField label={type === 'author_name' ? 'Corrected name' : 'Corrected affiliation'} required error={touched ? err.value : undefined}>
                    {(a) => <input {...a} className="input" value={newValue} onChange={(e) => setNewValue(e.target.value)} />}
                  </FormField>
                </>
              )}
              {type === 'correction' && (
                <>
                  <FormField label="Text as published (quote it exactly)" required error={touched ? err.text : undefined}>{(a) => <textarea {...a} rows={2} className="input !h-auto py-2" value={oldText} onChange={(e) => setOldText(e.target.value)} />}</FormField>
                  <FormField label="Corrected text" required>{(a) => <textarea {...a} rows={2} className="input !h-auto py-2" value={newText} onChange={(e) => setNewText(e.target.value)} />}</FormField>
                </>
              )}
              {(type === 'erratum' || terminal) && (
                <FormField label={type === 'erratum' ? 'Erratum notice (public)' : type === 'retraction' ? 'Retraction notice (public)' : 'Withdrawal notice (public)'} required error={touched ? err.notice : undefined}>
                  {(a) => <textarea {...a} rows={4} className="input !h-auto py-2" value={notice} onChange={(e) => setNotice(e.target.value)} />}
                </FormField>
              )}
              {type === 'file_replacement' && (
                <div>
                  <p className="label">Replacement file <span className="text-red-600" aria-hidden>*</span></p>
                  <input ref={file} type="file" accept=".pdf,.docx" className="sr-only" tabIndex={-1} aria-label="Choose replacement file" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
                  <button type="button" className="btn-secondary" onClick={() => file.current?.click()}><FileUp size={15} aria-hidden /> {fileName || 'Choose file'}</button>
                  {touched && err.file && <p role="alert" className="mt-1 text-xs text-red-600">{err.file}</p>}
                </div>
              )}
              <div>
                <p className="label">Supporting document <span className="text-xs font-normal text-muted">(optional, prototype: the file is not uploaded)</span></p>
                <input ref={attach} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" className="sr-only" tabIndex={-1} aria-label="Choose supporting document" onChange={(e) => setAttachment(e.target.files?.[0]?.name ?? '')} />
                <button type="button" className="btn-secondary" onClick={() => attach.current?.click()}><FileUp size={15} aria-hidden /> {attachment || 'Attach the author’s email or proof'}</button>
              </div>
              <FormField label="Reason for the change" required error={touched ? err.reason : undefined} hint="Visible to the Editor and recorded in the audit log.">
                {(a) => <textarea {...a} rows={4} className="input !h-auto py-2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Who asked for it, what is wrong, and how it was verified." />}
              </FormField>
            </div>
          </SectionCard>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => navigate('/post-publication')}>Cancel</button>
            <GuardedButton allowed={raise.can} why={raise.why} className="btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit request'}</GuardedButton>
          </div>
        </div>
      </div>
    </>
  )
}
